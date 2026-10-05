# T-023 · Diseño — cobros, cobros parciales y pendiente de cobro

Arquitecto, 05-10-2026. Contrato: `tickets/T-023-cobros-y-pendiente.md`.

**Este diseño es condicional.** Vale tal cual si el propietario responde P1 = (ii) y P4 = partir
(§Preguntas abiertas). Si P1 = (i), lo único que queda en pie es §1.1 (a) y (b), el formulario y la
acción: la vista del pendiente pasa a depender de T-026 y el ticket espera. Los nombres de §1 están
cerrados para el caso (ii); el implementador no elige nada.

**Orden de arranque.** No se implementa hasta que T-021 (ronda 2) y T-043 estén en `main`. La
migración es `20261013120000` y el banco `30-cobros.sql`: antes de lanzar el verificador, comprobar
`max(version)` de `supabase/migrations/` en la rama (memoria «Branch migration before verifying»).

---

## Preguntas abiertas al propietario

**Respondidas (05-10-2026)**: P1 = (ii) devengado menos cobrado · P2 = (a) la `no_asistida` no cuenta · P3 = (a) cuenta 0 y se señala (`citas_sin_tarifa`, aviso ámbar) · P4 = (a) partir: T-023b tras T-026 (contrato por redactar) · P5 = (a) columna `cobros.motivo` con check si `importe < 0` (cerrada por el orquestador con la recomendada). El diseño de abajo queda en pie tal cual.

Cada una con la opción recomendada. El diseño de abajo asume la recomendada.

### P1 · Qué cuenta el pendiente (P3.d del contrato)

- **(i) Lo facturado menos lo cobrado.** Todo T-023 dependería de T-026. Arrastra los cinco huecos
  de §P3.4 del diseño de T-021: los bonos no llegan al espejo, tampoco las rectificativas ni lo
  hecho directamente en el programa, sin proveedor el pendiente sale siempre 0, cada cobro anticipado
  aparece como excedente y la anulación habría que descontarla.
- **(ii) Lo devengado menos lo cobrado.** Lo devengado son las citas `realizada` sin bono, cada
  una a la tarifa vigente el día local de la cita (primero `tarifas_paciente` y, si no hay,
  `tipos_terapia.tarifa_base`), más el importe de cada bono dado de alta.

**Recomendada: (ii).** Funciona sin proveedor y sin T-026. Es la regla de precio de
`architecture.md` §Fiscalidad («tarifa base del tipo de terapia, salvo `tarifas_paciente`
vigente»). Respeta el ADR-077 (lo cobrado es solo lo de la app y no se copia nada del programa) y
el pendiente es por paciente (P1 de T-021). Además, es una vista: si algún día se quiere (i),
se redefine sin migrar datos.

### P2 · ¿Cuenta una cita `no_asistida`?

- (a) **No**: solo cuentan las `realizada`.
- (b) Sí, a la tarifa de ese día.
- (c) Sí, pero solo con una regla de cancelación tardía (plazo y porcentaje), que hoy no existe.

**Recomendada: (a).** No hay ninguna regla de inasistencia en el modelo ni en los ADR, y cobrar
una ausencia es una política comercial de cada consulta. Si una consulta la cobra, registra el
cobro a mano: con (a) ese cobro aparece como excedente y se ve. Para (c) haría falta otro ticket
con su columna de política.

### P3 · Cita realizada sin tarifa (sin tipo de terapia, o con un tipo sin `tarifa_base` y sin tarifa del paciente)

- (a) **Cuenta 0 y se señala**: la vista lleva `citas_sin_tarifa`, y la pantalla avisa en ámbar en
  la fila del paciente («2 sesiones sin precio»).
- (b) Cuenta 0 sin avisar.
- (c) Se impide marcar `realizada` una cita sin precio resoluble (es un cambio en la agenda y en
  T-021).

**Recomendada: (a).** (b) entierra un error igual que esconder `cobrado_de_mas`, que el contrato
prohíbe. (c) se sale del alcance y bloquea la agenda por un dato económico.

### P4 · T-026 no está integrado: ¿esperar o partir?

- (a) **Partir.** T-023 hace cobros, pendiente y pantalla. Un **T-023b** posterior a T-026 hace
  el listado de facturas del espejo, el cobro contra factura, la cabecera de facturas del técnico
  y el criterio «con T-026 integrado».
- (b) Esperar a T-026 y hacer T-023 entero.

**Recomendada: (a).** Con P1 = (ii), nada de lo que cierra este ticket necesita el espejo. El
contrato ya prevé partirlo (§Lo que depende de T-026). El T-023b lo redacta el propietario o el
orquestador: este diseño no escribe contratos.

### P5 · El «motivo» de una devolución

El contrato pide «un cobro negativo, con su motivo», y `cobros` (T-021) no tiene columna de motivo.

- (a) **Columna nueva `cobros.motivo text`**, nula, obligatoria en la base cuando `importe < 0`
  (`check`). Se añade con `alter table … add column`: no reescribe ninguna fila ni es un UPDATE.
- (b) Usar `referencia` como motivo, sin tocar el esquema y sin forzarlo en la base.

**Recomendada: (a).** Con (b), «con su motivo» lo exigiría solo la aplicación, y la constitución
pide que la base impida lo que importa. Además, `referencia` ya significa otra cosa (el número de
la transferencia o del datáfono). Con (a), el banco 26 de T-021 cambia en una línea (§1.3).

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | `cobros(id, paciente_id → pacientes, importe numeric(12,2), fecha date, forma_pago, referencia text, registrado_por → perfiles, registrado_en timestamptz default now())`, `check (importe <> 0)`. **No tiene `motivo` ni enlace a factura** | worktree T-021, `supabase/migrations/20261011120000_economico_esquema.sql` (antes de la ronda 2; la ronda 2 no cambia las columnas de `cobros`) |
| H2 | Enum `forma_pago`: `efectivo`, `transferencia`, `tarjeta`, `bizum`, `otro` | ídem; contrato de T-021 línea 81 |
| H3 | Ronda 2 de T-021: grants de insert **por columnas**, sin `cobros.registrado_en` (B-H7). `cobros` sigue en `tablas_solo_adicion` con sus tres capas | `tickets/T-021/diseno.md` líneas 1755 y 1836; banco 26 L8 |
| H4 | `cobros_lectura` / `cobros_alta`: administrador; profesional con el rol **en positivo** y `es_profesional_asignado(paciente_id)`; técnico con `paciente_id in (select p.id from public.pacientes p where p.centro_id in (select public.centros_actuales()))`. El `with check` exige `registrado_por = (select auth.uid())` | `tickets/T-021/diseno.md` línea 478 y A-H4 (línea 1830) |
| H5 | `tarifas_paciente` en la ronda 2: sin `vigente_hasta`, con `orden` (lo pone `fn_alta_tarifa`), solo adición. La tarifa vigente en X es la de mayor `(vigente_desde, orden)` con `vigente_desde <= X`, y una tarifa sustituida el mismo día da un intervalo vacío. La vista `tarifas_paciente_vigencias` es **invoker** | `tickets/T-021/diseno.md` líneas 1258-1330 |
| H6 | `bonos(id, paciente_id, sesiones_totales, importe numeric(12,2) > 0, caducidad, creado_por, creado_en)`. `citas.bono_id` existe (T-021) | worktree T-021, migración |
| H7 | `citas(paciente_id, profesional_id, centro_id, tipo_terapia_id NULL, inicio timestamptz, zona_horaria text not null, estado estado_cita, …)` | `supabase/migrations/20260906120000_agenda_esquema.sql:180-203` |
| H8 | `estado_cita`: `programada`, `confirmada`, `realizada`, `cancelada`, `no_asistida` | ídem :40-46 |
| H9 | `tipos_terapia.tarifa_base numeric(10,2)` **nula**, `check (tarifa_base is null or tarifa_base >= 0)` | ídem :96-109 |
| H10 | `pacientes.profesional_id not null`, `pacientes.centro_id` **nulo**, `fusionado_en`. Los tres roles leen `pacientes` con el grant de tabla entera y tres políticas; el técnico, solo los de su centro | `20260815192424…:40-46`, `20260822094547…:320-327`, `20260822160000…:836-850` |
| H11 | `es_profesional_asignado(uuid)`: definer, resuelve la fusión en un salto y exige el perfil `activo` | `20260822160000_rls_funciones_y_politicas.sql:93-113` |
| H12 | `zona_horaria_centro(uuid)`: definer, la zona del centro → la de la organización → `Europe/Madrid`. `authenticated` puede ejecutarla | `20260822094547…:1009-1021, 1344` |
| H13 | `pendiente(total, cobrado): { estado: 'pendiente' \| 'cobrado' \| 'cobrado_de_mas', pendiente, excedente }` en céntimos: el pendiente nunca es negativo y el excedente solo aparece en `cobrado_de_mas` | `lib/dinero/reparto.ts:31-60` |
| H14 | `aCentimos(texto)` lee la forma española, acepta el signo menos y lanza si el texto no es un importe. `formatearImporte(c)`. No existe un helper de céntimos a decimal | `lib/dinero/importe.ts` |
| H15 | Primitivas: `Field`, `Seleccion` (un `<select>` nativo compatible con `register()`), `AreaTexto`, `Dialogo` (con foco y `ancho`), `Desplegable` (`valor` y `alElegir`), y en `piezas.tsx` `Tarjeta`, `Metrica`, `FilaConAvatar`, `Pildora` (tonos `success`, `info` y `warning`), `EncabezadoDeModulo`, `EstadoVacio`, `Cargando` y `AvisoDeError` | `components/ui/*.tsx` |
| H16 | Patrón de alta: `esquemas.ts` + `acciones.ts` (`'use server'`, `datos: unknown`, `exigirSesion()`, `safeParse`, `EstadoFormulario`, `revalidatePath`) + un formulario cliente con `useForm` + `zodResolver` + `useTransition` + `aplicarErroresDelServidor`. **El cliente manda a la acción la SALIDA del esquema**, que la acción vuelve a validar | `app/(app)/pacientes/{esquemas,acciones,formulario-nuevo-paciente}.ts(x)`, `lib/formularios.ts` |
| H17 | El rol se lee de la base: `estadoDeCuenta(sesion)?.rol`, y se filtra con la lista blanca `leerRol()`. «Hoy» en la zona se calcula con `hoyEn(ahora, zona)` | `app/(app)/pacientes/[id]/datos.ts:72-76`, `app/(app)/agenda/bloques.ts:32, 73-75` |
| H18 | `/facturacion` no existe. En `modulos.ts`, `disponible: false` y `roles: TODOS_LOS_ROLES` | `components/armazon/modulos.ts:62-68` |
| H19 | `cacheComponents: true`: lo dinámico va dentro de un `<Suspense>`, y el reloj, después de `connection()` | `next.config.ts`; `.claude/rules/nextjs.md` |
| H20 | Los bancos se concatenan en una sola sesión, en orden alfabético. Los 26 y 29 son de T-021 y T-043; el 25 no existe. **El 26.C4 inserta una devolución (-20,00) sin motivo**, que con P5 = (a) falla con 23514 | `scripts/test-rls.mjs:12-23`; worktree, `scripts/rls/26-economico.sql:326-329` |
| H21 | Ya hay vistas definer con barrera que comprueban sus opciones en el catálogo (`reloptions @> array['security_barrier=true','security_invoker=false']`) | `scripts/rls/23-cita-en-episodio.sql:88` |
| H22 | El prototipo: métrica «Pendiente de cobro» con el icono `Clock3` en tono ámbar; píldora «Pendiente» = `warning`, «Pagada» = `success`. «Nueva factura» y «En cola AEAT» quedan **retirados** por los ADR-053 y 078 | `app/prototipo/page.tsx:76` |
| H23 | `npm run tipos` regenera `lib/supabase/tipos-bd.ts`, siempre después de `db reset` | `.claude/rules/supabase.md` §Siembra y tipos |

---

## 1 · Piezas y contratos

### 1.1 · Migración `supabase/migrations/20261013120000_cobros_y_pendiente.sql`

Cabecera: el porqué en cuatro líneas (P1 = (ii), P5 = (a) y la vista como puerta lateral), con
cita a los ADR-077 y 053 (g) y a T-021.

**(a) `cobros.motivo`** (P5)

```sql
alter table public.cobros add column motivo text;

alter table public.cobros
  add constraint cobros_devolucion_motivo_ck
  check (importe > 0 or (motivo is not null and length(trim(motivo)) > 0));

comment on column public.cobros.motivo is
  'Por qué se devuelve. Obligatorio si importe < 0 (cobros_devolucion_motivo_ck). '
  'Económico, nunca clínico: lo lee el técnico administrativo (T-023).';

grant insert (motivo) on table public.cobros to authenticated;
```

- El check se crea **validado**, sin `not valid`, porque `cobros` está vacía en toda base: T-021
  no se ha desplegado. Si al implementar existiera algún entorno con devoluciones sin motivo,
  `db reset` o `migration up` fallarían con ruido. Eso es lo correcto: se para y se anota en
  `state.md`, no se cambia a `not valid`.
- No se toca ningún otro grant ni la auditoría: `fn_auditar` guarda la fila nueva y ya incluye la
  columna.

**(b) Una fecha futura no entra por ninguna puerta**

```sql
create function public.fn_validar_cobro()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_centro uuid;
  v_hoy    date;
begin
  if current_setting('role', true) in ('authenticated', 'anon') then
    select p.centro_id into v_centro from public.pacientes p where p.id = new.paciente_id;
    v_hoy := (now() at time zone public.zona_horaria_centro(v_centro))::date;
    if new.fecha > v_hoy then
      raise exception 'La fecha de un cobro no puede ser posterior a hoy (fecha del centro) (T-023)'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_validar_cobro() from public;

create trigger validar_cobro
  before insert on public.cobros
  for each row execute function public.fn_validar_cobro();
```

- El fragmento único para el banco es **`no puede ser posterior a hoy`**.
- **Invoker**, igual que `fn_alta_tarifa` (T-021 R2.1.1). Si quien llama no puede ver al paciente,
  `v_centro` sale nulo y se usa la zona de la organización. El 23514 depende solo de la fecha, y
  luego la RLS rechaza con 42501. No hay oráculo de existencia, porque el código de error no
  depende de que el paciente exista.
- `postgres` y `service_role` quedan exentos: son la fijación y el futuro importador, con el mismo
  criterio que `fn_alta_tarifa`. No se exonera «sin sesión»: un `authenticated` sin JWT sigue
  sujeto a la guarda.
- `zona_horaria_centro` ya es ejecutable por `authenticated` (H12). El disparador es invoker, así
  que la necesita.

**(c) La vista `pendiente_paciente`**: definer con barrera; es la puerta lateral.

```sql
create view public.pendiente_paciente
  with (security_invoker = false, security_barrier = true)
as
select
  p.id                                                      as paciente_id,
  p.profesional_id,
  ((s.importe + b.importe) * 100)::bigint                   as devengado_centimos,
  (k.importe * 100)::bigint                                 as cobrado_centimos,
  (greatest(s.importe + b.importe - k.importe, 0) * 100)::bigint as pendiente_centimos,
  (greatest(k.importe - s.importe - b.importe, 0) * 100)::bigint as excedente_centimos,
  (case
     when s.importe + b.importe > k.importe then 'pendiente'
     when s.importe + b.importe = k.importe then 'cobrado'
     else 'cobrado_de_mas'
   end)::text                                               as estado,
  s.sin_tarifa                                              as citas_sin_tarifa
from public.pacientes p
cross join lateral (
  select coalesce(sum(x.precio), 0)::numeric                as importe,
         count(*)::integer                                  as sesiones,
         (count(*) filter (where x.precio is null))::integer as sin_tarifa
  from (
    select coalesce(
             (select t.importe
                from public.tarifas_paciente t
               where t.paciente_id     = c.paciente_id
                 and t.tipo_terapia_id = c.tipo_terapia_id
                 and t.vigente_desde  <= (c.inicio at time zone c.zona_horaria)::date
               order by t.vigente_desde desc, t.orden desc
               limit 1),
             tt.tarifa_base) as precio
      from public.citas c
      left join public.tipos_terapia tt on tt.id = c.tipo_terapia_id
     where c.paciente_id = p.id
       and c.estado = 'realizada'::public.estado_cita
       and c.bono_id is null
  ) x
) s
cross join lateral (
  select coalesce(sum(bo.importe), 0)::numeric as importe, count(*)::integer as bonos
    from public.bonos bo
   where bo.paciente_id = p.id
) b
cross join lateral (
  select coalesce(sum(co.importe), 0)::numeric as importe, count(*)::integer as cobros
    from public.cobros co
   where co.paciente_id = p.id
) k
where (s.sesiones > 0 or b.bonos > 0 or k.cobros > 0)
  and (
        (select public.rol_actual()) = 'administrador'::public.rol_usuario
     or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
         and public.es_profesional_asignado(p.id))
     or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
         and p.id in (select p2.id from public.pacientes p2
                       where p2.centro_id in (select public.centros_actuales())))
  );

revoke all on table public.pendiente_paciente from public, anon, authenticated, service_role;
grant select on table public.pendiente_paciente to authenticated;
```

Contrato de la vista, en este orden y con nada más:

| Columna | Tipo | Semántica |
|---|---|---|
| `paciente_id` | uuid | Una fila por paciente con alguna partida: sesión devengable, bono o cobro |
| `profesional_id` | uuid | `pacientes.profesional_id`. Solo lo usa el selector del administrador; los tres roles ya lo leen en `pacientes` (H10) |
| `devengado_centimos` | bigint | Las sesiones (a su tarifa o 0 si no tienen) más los bonos |
| `cobrado_centimos` | bigint | La suma de `cobros`, con las devoluciones (puede ser negativa) |
| `pendiente_centimos` | bigint | `max(devengado − cobrado, 0)` |
| `excedente_centimos` | bigint | `max(cobrado − devengado, 0)` |
| `estado` | text | `pendiente` / `cobrado` / `cobrado_de_mas`, la misma semántica que `pendiente()` (H13). 0/0 da `cobrado` |
| `citas_sin_tarifa` | integer | Las realizadas sin bono y sin precio resoluble (P3) |

- **El `where` es `cobros_lectura` copiada**, con `paciente_id` cambiado por `p.id`. El texto de
  arriba es el de la ronda 2 (H4). Si la política fusionada en `main` difiere en algo, se copia la
  fusionada carácter a carácter y la diferencia se anota en la bitácora. El banco lo comprueba por
  comportamiento (30.D9).
- **Ningún `with`/CTE y el `where` en el nivel exterior**, como `bonos_consumo` y `citas_agenda`:
  es lo que `security_barrier` protege frente a los predicados del llamante.
- **La tarifa vigente se resuelve contra `tarifas_paciente`**, no contra `tarifas_paciente_vigencias`.
  Esa vista es invoker y anidarla dentro de una definer deja la cuestión de con qué permisos corre.
  La subconsulta `order by vigente_desde desc, orden desc limit 1` es equivalente a
  `[vigente_desde, lead)` (H5), incluido el intervalo vacío de una sustitución el mismo día.
- **Día local de la cita**: `(c.inicio at time zone c.zona_horaria)::date`, nunca `c.inicio::date`.
- La vista no lleva `tipo_terapia_id`, `cita_id`, `fecha` ni ningún nombre. Los nombres los lee la
  pantalla en `pacientes`, bajo su propia RLS (D6).
- `comment on view`: «Pendiente por paciente: lo devengado (citas realizadas sin bono a la tarifa
  vigente su día local, más los bonos) menos lo cobrado. Definer con barrera: el técnico no lee
  citas ni tarifas. El where repite cobros_lectura; si cambia una, cambia la otra (T-023).»
- `comment on column citas_sin_tarifa`: «Sesiones realizadas que cuentan 0 por no tener precio.
  Se enseña, no se entierra (P3).»

**(d) Lo que la migración NO hace.** No crea ninguna política, porque una vista no las lleva. Por
eso `11-cobertura.sql` no cambia. No toca `facturas_espejo` (no existe), ni `tarifas_paciente`, ni
`bonos`, ni `citas`. No añade ninguna FK hacia una tabla de solo adición (riesgo 4 de T-021 R2.5).

### 1.2 · Banco `scripts/rls/30-cobros.sql`

- Ids con el prefijo `30300000-0000-0000-0000-0000000000NN`. Recuentos **por diferencia** o
  acotados a los pacientes del banco. Los candados se cierran al final y se termina con
  `pg_temp.reset_sesion()` (H25 de `state.md`; reglas de pruebas, punto 33).
- Fijación propia, como `postgres`: tipos `T30` (`tarifa_base 60.00`) y `T30N` (`tarifa_base null`).
  Pacientes `P30A` (centro `CA`, `PRO1`), `P30B` (centro `CB`, `PRO2`) y `P30C` (centro `CA`,
  `PRO1`). `D := current_date + 1600` como ancla futura, con citas en días distintos para no chocar
  con `citas_sin_solape_profesional`. Las citas se insertan `programada` y luego se pasan a
  `realizada`, `cancelada` o `no_asistida` con un `update` como `postgres`, como hace el banco 26.
  El `bono_id` va en el insert, porque la ronda 2 lo congela.

| Bloque | Prueba | Esperado |
|---|---|---|
| **A · Catálogo** | A1 `reloptions` de la vista `@> {security_barrier=true, security_invoker=false}` · A2 lista **exacta** y ordenada de columnas (`information_schema.columns`) igual a la tabla de §1.1 (c) · A3 sin `tipo_terapia_id` ni `cita_id` · A4 `authenticated` solo tiene `SELECT` sobre la vista; `anon`, `PUBLIC` y `service_role`, nada · A5 `cobros.motivo` existe, `text` y nula · A6 `cobros_devolucion_motivo_ck` existe y `convalidated` · A7 `column_privileges`: `authenticated` tiene `INSERT` en `motivo` y sigue sin tenerlo en `registrado_en` · A8 `validar_cobro` es `BEFORE INSERT FOR EACH ROW`; `fn_validar_cobro` es invoker con `search_path=""` y sin `EXECUTE` para `PUBLIC` · A9 `cobros` sigue en `tablas_solo_adicion` y `cobertura_solo_adicion() = 0` | todo cierto |
| **B · Los 100 €** (P30A) | B0 tarifa del paciente `P30A/T30` desde `D` = 100,00; la cita CA1 a las **00:30 Europe/Madrid del día D** pasa a realizada. Como ADM: `devengado = 10000`, `pendiente = 10000`, `estado = 'pendiente'`, `cobrado = 0`. La fila existe sin ningún cobro · B1 ADM cobra 30,00 → `pendiente 7000`, `pendiente` · B2 TEC1 cobra 30,00 → `4000`, `pendiente` · B3 PRO1 cobra 40,00 → `0`, **`cobrado`**, `excedente 0` · B4 ADM cobra 10,00 → `pendiente 0`, `excedente 1000`, **`cobrado_de_mas`** · B5 ADM devuelve -10,00 con motivo → `cobrado`, 0/0 · B6 ADM devuelve -20,00 con motivo → `pendiente 2000`, `pendiente` · B7 seis filas en `cobros` de P30A, ninguna sin `registrado_por` | cifras exactas |
| **C · Qué se devenga** (P30C) | Citas realizadas: C1 `T30` en `D-10` sin tarifa del paciente → 60,00 (tarifa base) · C2 sin tipo → 0 y +1 en `citas_sin_tarifa` · C3 `T30N` → 0 y +1 · C4 `T30` con `bono_id = B30` (bono de 150,00) → la cita **no** cuenta y el bono sí, una vez · C5 dos tarifas de P30C/T30 el mismo día `D+5` (80,00 y luego 90,00; `orden` lo pone la base) y una cita ese día → **90,00**. Además, una cita `cancelada`, una `no_asistida`, una `programada` y una `confirmada` de `T30` → 0. Sin cobros: `devengado = 6000 + 15000 + 9000 = 30000`, `citas_sin_tarifa = 2`, `estado = 'pendiente'`. C6 un cobro de 300,00 → `cobrado` | cifras exactas |
| **D · Quién ve qué** | D1 TEC1 ve P30A y P30C en la vista · D2 TEC1 ve 0 filas de P30B y su gemela, D2g: ADM ve 1 · D3 TEC1 lee 0 filas de `tarifas_paciente` de P30A, con su gemela D3g (ADM ve 1; PRO1 ve 1) · D4 PRO2 ve 0 filas de P30A en la vista y 0 en `cobros`, con su gemela D4g (PRO1, 1 y 6) · D5 PRO1 ve 0 filas de P30B, con su gemela D5g (PRO2 ve 1) · D6 un uuid sin perfil (rol nulo) ve 0 filas de la vista · D7 `anon`: `select` sobre la vista da **42501** · D8 TEC1 ve las columnas de cifras de P30A y ninguna otra (las de A2) · D9 **dos caminos**: para ADM, PRO1, PRO2 y TEC1, el conjunto de `paciente_id` de la vista ∩ {P30A, P30B, P30C} = el `distinct paciente_id` de `cobros` ∩ los mismos (los tres tienen cobros al llegar aquí) | recuentos exactos |
| **E · Escritura** | E1-E3 `update` / `delete` / `truncate` sobre `cobros` como ADM → **42501**; E4-E5 `update` y `delete` como TEC1 → 42501; E6 `update` como PRO1 → 42501 (UPDATE 0 no vale: cada intento lleva su gemela de lectura de la misma fila) · E7 devolución sin motivo → **23514** `cobros_devolucion_motivo_ck`; E7b con motivo `'   '` → 23514; gemela E7g: con motivo, entra · E8 positivo sin motivo → entra · E9 TEC1 con `fecha = hoy_CA + 1` → **23514** `no puede ser posterior a hoy`; gemela E9g: `fecha = hoy_CA` entra (`hoy_CA` = `(now() at time zone zona_horaria_centro(:CA))::date`) · E10 como `postgres`, una fecha futura entra (la exención, documentada) · E11 la vista no da `UPDATE` ni `INSERT` (catálogo, no el intento: una vista con agregados falla en el reescritor antes que en los permisos) | códigos exactos |

**Mutantes que el banco tiene que ver en rojo** (medidos a mano, apuntados al final del fichero y
en `tickets/T-023/mutantes.json`):

| M | Mutación | Rojo en |
|---|---|---|
| M1 | Quitar la condición de centro del técnico en el `where` | D2 |
| M2 | Quitar `and public.es_profesional_asignado(p.id)` de la rama del profesional | D4 (PRO2 vería P30A) y D9 |
| M3 | `c.inicio::date` en lugar del día local | B0 (sale 6000) |
| M4 | Quitar `and c.bono_id is null` | C (sale 39000) |
| M5 | `estado in ('realizada', 'no_asistida')` | C |
| M6 | Quitar `t.orden desc` del `order by` | C5 (80 o 90 según el plan: si sale verde, se anota como equivalente en esa base, no se da por cubierto) |
| M7 | `security_barrier = false` | A1 |
| M8 | Quitar `cobros_devolucion_motivo_ck` | E7 |
| M9 | Quitar el disparador `validar_cobro` | E9 |
| M10 | `>` por `>=` en `when … > k.importe` | B3 |

### 1.3 · Ajustes a ficheros ajenos (mínimos)

- **`scripts/rls/26-economico.sql`, 26.C4**: la devolución de -20,00 añade
  `motivo = 'Devolución parcial'` a la lista de columnas. **Solo eso.** Si alguna otra aserción del
  26 cae por la columna nueva o por el disparador (por ejemplo, una lista exacta de columnas o de
  privilegios de `cobros`), se ajusta solo esa aserción, en una línea, y cada cambio va a la
  bitácora con su motivo. Si cae por otra cosa, se para.
- **`scripts/rls/README.md`**: fila `30-cobros.sql` con los bloques A-E y los mutantes, y en la
  fila 26, «C4 lleva motivo desde T-023».
- **`lib/supabase/tipos-bd.ts`**: se regenera con `npx supabase db reset && npm run tipos`. No se
  edita a mano.

### 1.4 · Pantalla `/facturacion`

Ficheros en `app/(app)/facturacion/`. Las pruebas van junto a cada módulo.

| Fichero | Qué es | Contrato |
|---|---|---|
| `page.tsx` | Server Component | `EncabezadoDeModulo` (versalitas «Facturación», título «Cobros», subtítulo «Lo que se ha cobrado y lo que queda por cobrar», acción primaria `<RegistrarCobro>`). Debajo, tres bloques, **cada uno en su `<Suspense>` con esqueleto** y su `AvisoDeError` si falla (patrón de `app/(app)/agenda/page.tsx`): `BloqueMetrica`, `BloquePendientes` y `BloqueCobros`. Recibe `searchParams` (una promesa) y se la pasa a los bloques sin esperarla fuera de un `Suspense` |
| `datos.ts` | Lecturas, sin `use cache` | `cargarContexto(searchParams)` → `{ rol, profesionalFiltrado: string \| null, zona, hoy }`. El `rol` sale de `estadoDeCuenta` + `leerRol` (H17). `profesionalFiltrado` **solo** se lee si `rol === 'administrador'`, y se valida con `z.uuid()`; para cualquier otro rol es `null` sin mirar el parámetro. `zona` = `zona_horaria_centro(null)` (la de la organización) y `hoy = hoyEn(new Date(), zona)` después de `await connection()`. `cargarPendientes(filtro)` → filas de `pendiente_paciente` (`.eq('profesional_id', x)` si hay filtro), con los nombres leídos aparte de `pacientes` (`id, nombre, apellidos`, `.in('id', ids)`). `cargarCobrosRecientes(filtro)` → `cobros.select('id, paciente_id, importe::text, fecha, forma_pago, referencia, motivo, pacientes!inner(nombre, apellidos, profesional_id)')`, ordenado por `fecha desc, registrado_en desc`, `limit 20`, más `.eq('pacientes.profesional_id', x)` si hay filtro. `cargarOpcionesProfesional()` (solo para el administrador): los `profesional_id` distintos de la vista **sin filtrar**, con sus nombres de `perfiles.nombre_completo`. `cargarPacientesParaCobro()` → `pacientes (id, nombre, apellidos)` con `fusionado_en is null`, por apellidos |
| `presentacion.ts` | Puro, sin E/S | `aFilaDePendiente(fila)`: valida que ninguna columna sea nula, llama a **`pendiente(devengado, cobrado)`** de `lib/dinero` y **lanza** si su `estado`, `pendiente` o `excedente` no coinciden con los de la vista (la divergencia es un bug y no se tapa; la recoge el `AvisoDeError` del bloque). Devuelve `{ pacienteId, estado, parcial: estado === 'pendiente' && cobrado > 0, pendiente, excedente, cobrado, citasSinTarifa }`. `pildoraDe(fila)` → `{ tono, texto }`: `cobrado` → `success` «Cobrado»; `pendiente` → `warning` «Pendiente» (o «Parcial»); `cobrado_de_mas` → `warning` «Cobrado de más». `ordenar(filas)`: primero `cobrado_de_mas`, luego `pendiente` por importe descendente y por último `cobrado`. `totalPendiente(filas)` → la suma de `pendiente` |
| `bloques.tsx` | Server Components | **`BloqueMetrica`**: `Metrica` con la etiqueta «Pendiente de cobro», el icono `Clock3` en ámbar, la cifra `formatearImporte(totalPendiente)` en serif y el matiz «N pacientes con pendiente». Si hay `cobrado_de_mas`, una segunda línea visible: «N con cobros de más». **`BloquePendientes`**: una `FilaConAvatar` por paciente (iniciales, nombre, subtítulo «Debe X · ha pagado Y» o «Cobrado de más: Z, revisa sus cobros») y la `Pildora`. Si `citasSinTarifa > 0`, el texto «N sesiones sin precio» en ámbar dentro del subtítulo (P3). Estado vacío: «No hay nada pendiente». **`BloqueCobros`**: la lista de los últimos cobros (fecha con `formatearFechaSinZona`, nombre, forma de pago, importe y, si es negativo, «Devolución · motivo»). **Ninguna fila lleva menú, editar, borrar ni anular** |
| `esquemas.ts` | Zod compartido | ver §1.5 |
| `acciones.ts` | `'use server'` | ver §1.6 |
| `registrar-cobro.tsx` | `'use client'` | El botón «Registrar cobro» (44 px) + `Dialogo` (`ancho="amplio"`) + `FormularioCobro`. Al terminar bien: cierra, el foco vuelve al botón y un `role="status"` anuncia «Cobro registrado». Recibe `pacientes` y `hoy` como props |
| `formulario-cobro.tsx` | `'use client'` | `useForm` + `zodResolver(crearEsquemaCobro(hoy))` + `useTransition` + `aplicarErroresDelServidor`, calcado de `formulario-nuevo-paciente.tsx`. Campos: **Paciente** (`Seleccion`), **Importe** (`Field`, `inputMode="decimal"`, con la ayuda «Para una devolución, en negativo: -20,00»), **Fecha** (`Field type="date"`, `max={hoy}`, valor inicial `hoy`), **Forma de pago** (`Seleccion` con las cinco: Efectivo, Transferencia, Tarjeta, Bizum, Otro), **Referencia** (`Field`, opcional) y **Motivo** (`AreaTexto`), que **solo se pinta** si el importe tecleado se lee como negativo (`watch('importe')` + `aCentimos` en un `try`). Ayuda del motivo: «Solo el motivo económico. Nada clínico». Botón «Registrar cobro». No aparece «Emitir», «Facturar», «Expedir», «Aprobar» ni «Crear factura» (ADR-078) |
| `selector-profesional.tsx` | `'use client'` | Solo se monta si `rol === 'administrador'`, y lo decide `page.tsx` en servidor. `Desplegable` con «Todos los profesionales» más las opciones. `alElegir` → `router.replace('/facturacion?profesional=<uuid>')` o sin parámetro para «todos» |

- **`components/armazon/modulos.ts`**: Facturación pasa a `disponible: true`. En `modulos.test.ts`,
  un caso «Facturación está disponible: T-023 construye /facturacion».
- **`lib/i18n/es.ts`**: todos los textos de arriba van a un bloque `cobros` (por ejemplo
  `cobros.pendienteDeCobro`, `cobros.registrarCobro` o `cobros.devolucionNecesitaMotivo`). Ningún
  literal en los componentes.
- **`accesibilidad/facturacion.spec.ts`**: siguiendo `accesibilidad/avisos.spec.ts`, `/facturacion`
  como administrador con el diálogo abierto y cerrado, sin violaciones del verificador de T-009. A
  360 px se puede abrir el diálogo, rellenarlo y enviarlo.

### 1.5 · `app/(app)/facturacion/esquemas.ts`

```ts
export const FORMAS_DE_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'bizum', 'otro'] as const;
/** numeric(12,2): 9.999.999.999,99 € */
export const LIMITE_CENTIMOS = 999_999_999_999;

export function crearEsquemaCobro(hoy: string): z.ZodType<…>;   // ver campos
export type EntradaCobro = z.input<ReturnType<typeof crearEsquemaCobro>>;
export type DatosCobro  = z.output<ReturnType<typeof crearEsquemaCobro>>;

/** Céntimos → '12.50' / '-20.00' por aritmética entera, sin pasar por coma flotante. */
export function importeParaBd(c: Centimos): string;
```

Campos (los mensajes, con `t()`):
- `pacienteId`: `z.uuid()`.
- `importe`: `z.string().trim()` + `refine` (que `aCentimos` no lance) + `refine` (≠ 0, «El importe
  no puede ser cero») + `refine` (`|c| <= LIMITE_CENTIMOS`). **Sin `transform`**: la salida sigue
  siendo el texto. La acción convierte con `aCentimos` después de validar (D8).
- `fecha`: `z.string()` + `refine(esFechaDeCalendario)` + `refine(f => f <= hoy, «La fecha no puede
  ser posterior a hoy»)`. La comparación es de cadenas `AAAA-MM-DD`; aquí no se construye ningún
  `Date`.
- `formaPago`: `z.enum(FORMAS_DE_PAGO)`.
- `referencia`: opcional, `''` → `undefined` (el `opcional()` de `pacientes/esquemas.ts`), `max(120)`.
- `motivo`: opcional, igual, `max(300)`.
- `superRefine`: si el importe es válido y negativo y no hay motivo → error en `motivo`, «Una
  devolución necesita su motivo».
- **Invariante: la salida es una entrada válida.** `parse(parse(x))` es igual a `parse(x)`, porque
  el cliente manda la salida (H16).

### 1.6 · `app/(app)/facturacion/acciones.ts`

```ts
'use server';
export async function registrarCobro(datos: unknown): Promise<EstadoFormulario>;
```

En este orden:
1. `const { supabase, usuario } = await exigirSesion();`
2. Se extrae `pacienteId` con `z.object({ pacienteId: z.uuid() }).safeParse(datos)`. Si falla, se
   devuelve el error de campo `pacienteId`.
3. `pacientes.select('centro_id').eq('id', pacienteId).maybeSingle()` bajo RLS. Si no hay fila, se
   devuelve el mensaje genérico «No se ha podido registrar el cobro», el mismo que con un 42501:
   así no hay oráculo.
4. `zona = rpc('zona_horaria_centro', { p_centro_id: centro_id })`, `hoy = hoyEn(new Date(), zona)`.
5. `crearEsquemaCobro(hoy).safeParse(datos)`. Si falla: `{ errores: z.flattenError(…).fieldErrors }`.
6. `c = aCentimos(importe)`. Se inserta en `cobros`
   `{ paciente_id, importe: importeParaBd(c), fecha, forma_pago, referencia: referencia ?? null,
   motivo: c < 0 ? motivo : null, registrado_por: usuario.id }`. **Sin `id` y sin `registrado_en`.**
   `registrado_por` sale de la sesión y nunca del formulario.
7. Errores de la base: un 23514 con `no puede ser posterior a hoy` → error de campo `fecha`. Un
   23514 con `cobros_devolucion_motivo_ck` → error de campo `motivo`. Un 42501 o cualquier otro →
   el mensaje genérico, con `console.error` del código, sin importe ni paciente.
8. `revalidatePath('/facturacion')` y se devuelve `{ mensaje: t('cobros.cobroRegistrado') }`.

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartado y por qué |
|---|---|---|
| D1 | Pendiente = devengado − cobrado (P1 (ii), pendiente del propietario) | (i) facturado: depende de T-026 y tiene cinco huecos (§P3.4 de T-021) |
| D2 | Partir: T-023 sin espejo, T-023b después de T-026 (P4) | Esperar: bloquea lo que no depende de T-026 |
| D3 | Vista definer con barrera y el `where` copiado de `cobros_lectura` | Invoker: el técnico no lee `citas` ni `tarifas_paciente` y su pendiente saldría 0 o falso |
| D4 | Las cifras de la vista en **céntimos `bigint`** | `numeric` en pesetas: llega a JS como `number` decimal, se redondea mal y obliga a reparsear; `lib/dinero` trabaja en céntimos enteros |
| D5 | El `estado` se calcula en SQL **y** la pantalla lo comprueba con `pendiente()`, lanzando si difieren | Solo en TS: el banco no podría probar el estado y cada consumidor (T-026, T-027, la ficha) derivaría el suyo. Solo en SQL: incumple «reutiliza `pendiente()`» y no avisa si alguien cambia una semántica sin la otra |
| D6 | La vista sin nombres; los nombres los da `pacientes` bajo su RLS | Nombres dentro de la vista definer: duplicaría la política de `pacientes` en una segunda puerta |
| D7 | La tarifa se resuelve contra `tarifas_paciente` con `order by vigente_desde desc, orden desc limit 1` | Usar `tarifas_paciente_vigencias`: es invoker anidada en una definer, con permisos ambiguos, para el mismo resultado |
| D8 | El esquema Zod sin `transform` sobre el importe | `transform` a céntimos: el cliente manda la salida (H16) y la acción recibiría un número donde el esquema espera texto |
| D9 | `motivo` como columna con check validado (P5 (a)) | `referencia` como motivo: solo lo exigiría la aplicación y mezcla dos significados; `not valid`: no hay filas que lo justifiquen |
| D10 | La fecha futura la rechazan el esquema **y** un disparador invoker con exención para `postgres` y `service_role` | Solo la acción: PostgREST con la clave anónima y un JWT inserta directo y se salta la acción |
| D11 | El selector del administrador va por `?profesional=` y el servidor solo lo lee si el rol es administrador | Filtrar en cliente: el profesional recibiría filas ajenas; un selector oculto con CSS: se puede usar |
| D12 | Las píldoras siguen al prototipo: «Pendiente» y «Parcial» en `warning`, «Cobrado» en `success`, y `cobrado_de_mas` en `warning` **con el importe en texto, primera en el orden y contada en la métrica** | `cobrado_de_mas` en rojo: el rojo es error de formulario (interfaz.md); un cuarto tono: «tres, no más» |
| D13 | Registrar se hace desde la cabecera, eligiendo paciente con un `<select>` nativo | Una acción en cada fila: necesita estado compartido entre filas de servidor y un diálogo; puede entrar en T-023b con el listado de facturas |
| D14 | `profesional_id` en la vista | Unirlo con `pacientes` en la pantalla: la vista no tiene FK para embeberlo y serían dos lecturas por fila |
| D15 | Los bonos devengan entero al darse de alta, sin mirar caducidad ni consumo | Prorratear por sesión consumida: lo excluye la definición de (ii) («el importe de los bonos dados de alta») |

---

## 3 · Cómo se cierra cada criterio de aceptación

| Criterio | Cómo se demuestra |
|---|---|
| 100 €: dos parciales → `pendiente`; el tercero → 0 y `cobrado` | Banco 30.B0-B3 (`npm run test:rls`), más `presentacion.test.ts` con la fila (10000, 6000) → `pendiente` y `parcial` |
| Sobrepago → `cobrado_de_mas` con su excedente, y la pantalla lo señala | 30.B4. `bloques.test.tsx`: con una fila `cobrado_de_mas` se pinta «Cobrado de más: 10,00 €», va la primera y la métrica dice «1 con cobros de más». Guion manual, paso 3 |
| `update` / `delete` sobre cobros fallan | 30.E1-E6 (42501, con gemela de lectura); el 26 sigue en verde |
| La devolución entra negativa y mueve el pendiente | 30.B5-B6 y 30.E7/E7g. `acciones.test.ts`: con -20,00 y motivo se inserta `importe: '-20.00'` y el motivo; sin motivo, error de campo y ninguna llamada a `insert` |
| El cobro sin factura entra y cuenta | 30.B1-B4: todos se insertan sin columna de factura y mueven el pendiente |
| Técnico: su centro sí, otro no (con gemela); 0 en `tarifas_paciente`; la vista sin `tipo_terapia_id` ni `cita_id` | 30.D1, D2/D2g, D3/D3g, A2, A3 y D9 |
| Profesional: 0 de los no asignados y sí de los suyos | 30.D4/D4g, D5/D5g y D9 |
| Con T-026: el técnico no recibe `tipo_terapia_id` ni `cita_id` de facturas | **Pasa a T-023b** (P4). La evidencia lo marca «fuera: T-023b», no «PASA» |
| Manual: el profesional no tiene selector | `page.test.tsx` (o `bloques.test.tsx`): con `rol = 'profesional_sanitario'` y con `'tecnico_administrativo'`, `queryByRole('combobox'/'button', { name: /profesional/i })` es `null` **y** `cargarOpcionesProfesional` no se llama. Comprobación manual con PRO1 |
| Manual: el selector del administrador filtra y la métrica se mueve | `datos.test.ts`: con un administrador y `?profesional=X`, la consulta lleva `.eq('profesional_id', X)`; con un profesional y el mismo parámetro, **no**. Manual: ADM elige PRO1 y la cifra cambia |
| Manual: ningún control para editar o borrar | `bloques.test.tsx`: en las filas de cobros no hay ningún `button` ni `menuitem`. `grep -rniE "editar|borrar|eliminar|anular" app/(app)/facturacion --include=*.tsx` no devuelve nada fuera de las pruebas |
| Manual: mismo vocabulario que `/prototipo` | Revisión visual: `Metrica`, `FilaConAvatar`, `Pildora` y `EncabezadoDeModulo` de `piezas.tsx`, sin «Nueva factura», «Facturas recientes», «En cola AEAT» ni la tarjeta fiscal (no hay datos detrás) |
| Manual: cada rol ve lo de la matriz | Guion con ADM, PRO1 y TEC1; el técnico no ve en ninguna parte ni el tipo de terapia ni la cita (la vista no los tiene, A3) |
| Manual: a 360 px se registra un cobro | `accesibilidad/facturacion.spec.ts` con el viewport a 360 y un envío completo; también a mano |
| a11y, `test:rls`, lint y build | `npm run test:a11y`, `npm run test:rls`, `npm run lint && npm run build`, `npm run lint:migraciones` y `npm test` |
| Server Action con Zod: rechaza importe 0 y fecha futura | `esquemas.test.ts` (`'0'`, `'0,00'`, `'-0'` y la fecha de mañana, rechazados; la de hoy, aceptada; `parse(parse(x))` idempotente). `acciones.test.ts`: `hoy` sale de la zona del centro del paciente (con un `rpc` simulado que devuelve `Atlantic/Canary`) y nunca de `datos`. 30.E9 cubre la otra puerta |

---

## 4 · Riesgos, por probabilidad

1. **Alta: el `where` de la vista se desvía de `cobros_lectura`** al fusionar T-021 o en un ticket
   posterior. Mitigación: se copia de la versión fusionada, D9 compara los dos caminos, el
   `comment on view` lo nombra y hay una línea para el revisor en §5.
2. **Alta: el banco 26 cae por la columna o por el disparador.** Mitigación: §1.3, solo la línea
   que cae por eso, y anotada.
3. **Media: el día de la cita en UTC.** Una cita a las 00:30 de Madrid es del día anterior en UTC
   y cogería la tarifa de ese día. B0 la pone justo en esa frontera y M3 lo demuestra.
4. **Media: contar dos veces el bono** (la sesión y el bono). C4 y M4.
5. **Media: pasar una realizada a cancelada baja lo devengado**, porque `citas` no tiene guarda de
   transición (hallazgo R2.8 de T-021). Con (ii), el pendiente puede bajar sin que nadie cobre. No
   se arregla aquí: se anota en `state.md` §Hallazgos como dependencia del pendiente y se propone
   el ticket de la guarda.
6. **Media: el técnico deduce el tipo de terapia por el importe** (devengado ÷ sesiones), de la
   familia de R2-H1 de T-021. La vista no da ni el recuento de sesiones ni el desglose; solo el
   total por paciente. Se acepta y se anota; cerrarlo del todo exigiría no enseñarle lo devengado,
   y eso contradice «el mismo pendiente».
7. **Media: el reloj en el render** bloquea el prerenderizado (`blocking-prerender-*`). `hoy` se
   calcula después de `connection()` dentro del bloque, y en la acción.
8. **Baja: la divergencia entre SQL y `pendiente()`** tumba un bloque. Es lo que se quiere (D5): el
   bloque enseña `AvisoDeError` y el resto de la pantalla sigue.
9. **Baja: la zona del formulario frente a la del paciente.** El cliente valida con la `hoy` de la
   organización, y la acción y la base con la del centro del paciente. Pasada la medianoche en la
   península, con un paciente de Canarias, el servidor rechaza y lo dice junto al campo. Es
   aceptable.
10. **Baja: el rendimiento de la vista** (subconsultas laterales por paciente) en consultas con
    miles de citas. Con los índices de FK de T-021 basta para v1; si no, se mide en T-023b.
11. **Baja: T-021 o T-043 sin fusionar** al empezar: la migración se aplica en orden equivocado.
    Mitigación: el orden de arranque de la cabecera.

---

## 5 · Qué revisar

**Base de datos**
- [ ] El `where` de `pendiente_paciente` es **carácter a carácter** el de `cobros_lectura` en
      `main` (con `paciente_id` → `p.id`), con el rol en positivo en las tres ramas y sin
      `rol_actual() is null` que se cuele por un `or`.
- [ ] La vista está creada con `security_invoker = false, security_barrier = true`, **sin CTE**, y
      el `where` está en el nivel exterior. Nadie la redefine con `create or replace` sin repetir el
      `with (…)` (la trampa de 23.A7).
- [ ] Las columnas son exactamente las ocho de §1.1 (c). Ni `tipo_terapia_id`, ni `cita_id`, ni el
      recuento de sesiones, ni nombres ni fechas: cada columna de más es información para el
      técnico.
- [ ] El día de la cita es `(c.inicio at time zone c.zona_horaria)::date`.
- [ ] `c.bono_id is null` y `c.estado = 'realizada'`; `no_asistida` no cuenta (salvo que P2 diga
      otra cosa).
- [ ] La tarifa va con `vigente_desde <= día` y `order by vigente_desde desc, orden desc limit 1`, y
      el respaldo es `tarifa_base`. Una cita sin precio cuenta 0 y suma en `citas_sin_tarifa`, no
      desaparece.
- [ ] El paso a céntimos (`* 100)::bigint`) se hace **después** de sumar `numeric`; nunca hay
      `float` ni `real` por medio.
- [ ] `grant select` a `authenticated` y nada más; `anon`, `PUBLIC` y `service_role` revocados.
- [ ] `cobros_devolucion_motivo_ck` está validado. `grant insert (motivo)` es el único grant nuevo
      sobre `cobros`; ningún `grant update` ni `grant` de tabla entera.
- [ ] `fn_validar_cobro`: invoker, `search_path = ''`, sin `EXECUTE` para `PUBLIC` y exención solo
      para quien **no** es `authenticated`/`anon`. Lanza 23514 con un fragmento único que no es
      prefijo de otro mensaje.
- [ ] Ningún UPDATE, DELETE ni TRUNCATE sobre `cobros` en la migración (`lint:migraciones`) ni FK
      hacia `tarifas_paciente`, `bonos_caducidades` o `cobros`.
- [ ] El 26 solo cambia en C4 (y en lo que cayó por la columna, anotado).

**Banco**
- [ ] Cada negativa usa `assert_lanza_codigo` con su código exacto **y** su gemela positiva sobre
      la misma fila y el mismo perfil.
- [ ] La negativa del técnico (D2) se pone roja con M1; la del profesional (D4), con M2; la del día
      local (B0), con M3; la del bono (C), con M4. Si una sigue verde con su mutante, prueba otra
      cosa.
- [ ] D9 compara dos caminos y no fija cantidades globales: aguanta la base sembrada.
- [ ] La fijación del 30 no depende de nada que dejen el 26 ni el 29. Ids propios y
      `reset_sesion()` al final.

**Aplicación**
- [ ] `registrado_por` sale de `usuario.id`; `registrado_en` e `id` no se mandan.
- [ ] `hoy` en la acción sale de la zona del centro del paciente, calculada en el servidor; nunca
      de `datos`.
- [ ] El esquema es idempotente (`parse(parse(x))`); no hay `transform` que cambie el tipo.
- [ ] `profesional` en la URL **no se lee** si el rol no es administrador (no basta con no pintar
      el selector). Con PRO1 y `?profesional=<PRO2>`, PRO1 ve exactamente lo mismo que sin el
      parámetro.
- [ ] El selector no existe en el DOM para el profesional ni para el técnico; tampoco oculto ni
      deshabilitado.
- [ ] `aFilaDePendiente` llama a `pendiente()` y lanza si no coincide; no hay un segundo cálculo
      del estado en ningún componente.
- [ ] `cobrado_de_mas` se ve: importe en texto, primero en el orden y contado en la métrica. No
      depende solo del color (WCAG 1.4.1).
- [ ] El motivo se pinta solo con el importe negativo; un motivo enviado con el importe positivo
      se guarda `null`.
- [ ] Ningún texto de la pantalla usa el vocabulario prohibido del ADR-078; no hay «Nueva factura»
      ni métricas sin datos («Facturado», «Previsión»).
- [ ] Nada de `use cache`; cada bloque tiene su `Suspense` y su `AvisoDeError`.
- [ ] Los importes de `cobros` se leen como `importe::text` y pasan por `aCentimos`; ningún
      `Number(importe) * 100`.

**Puertas laterales a probar a mano**
- [ ] Con un JWT de técnico y la clave anónima: un `insert` en `cobros` con fecha de mañana → 23514;
      con un paciente de otro centro → 42501; `select * from pendiente_paciente` → solo su centro.
- [ ] Un profesional con `estado = 'suspendido'` y JWT vivo ve 0 en la vista (lo da
      `es_profesional_asignado`).
- [ ] Un paciente fusionado: su pendiente sigue en su propio `id` y no aparece en el selector del
      formulario (`fusionado_en is null`). Que la base acepte un cobro a un fusionado se anota como
      hallazgo y no se arregla aquí.

---

## 6 · Territorio

Para el frontmatter del contrato:

```yaml
territorio:
  - supabase/migrations/20261013120000_cobros_y_pendiente.sql
  - scripts/rls/30-cobros.sql
  - scripts/rls/26-economico.sql        # solo 26.C4 y lo que caiga por motivo/validar_cobro (§1.3)
  - scripts/rls/README.md
  - lib/supabase/tipos-bd.ts            # generado
  - app/(app)/facturacion/**
  - components/armazon/modulos.ts
  - components/armazon/modulos.test.ts
  - lib/i18n/es.ts
  - accesibilidad/facturacion.spec.ts
  - tickets/T-023/**
  - docs/bitacora/T-023*.md
  - docs/state.md
```

Fuera, aunque tiente: `components/ui/**` (si falta una primitiva, se para y se anota), `lib/dinero/**`
(`importeParaBd` vive en `esquemas.ts`), `app/(app)/agenda/**` (de ahí solo se importan `hoyEn` y
`leerRol`), `app/(app)/pacientes/**` (la pestaña Facturación de la ficha no entra) y
`scripts/rls/11-cobertura.sql` (no hay políticas nuevas).

---

## 7 · Delegable

Casi nada. Lo único sin comportamiento son los **esqueletos** de los tres bloques (`Cargando` con
el número de filas y la forma de `MarcoBloque`) y el **estado vacío** de cada uno. Son unas veinte
líneas y no merecen un encargo aparte: los escribe el implementador. El formulario, el diálogo con
foco, el selector, la vista, el banco, la acción y todo lo que toca dinero o RLS se quedan en la
fábrica (`.claude/rules/pipeline.md`).

---

## Lo que no entra, y por qué

- **El listado de facturas del espejo, el cobro contra factura, la cabecera de facturas del técnico
  y el criterio «con T-026»**: pasan a T-023b (P4).
- **La pestaña Facturación de la ficha del paciente** (`facturacionVacia`): es de otro ticket.
  Cuando llegue, lee la misma vista con `.eq('paciente_id', id)`.
- **El filtro por centro del armazón** (choque 1): la RLS ya acota al técnico, y el contrato no lo
  pide. Si se quiere, la vista no tiene que cambiar (`pacientes.centro_id`).
- **Paginación y búsqueda** en las listas: 20 cobros recientes y todos los pacientes con partidas
  bastan para el criterio. Se mide con datos reales.
- **La acción «Registrar cobro» en cada fila** (D13).
- **Una guarda de transición `realizada → cancelada`** (riesgo 5): es la agenda, no los cobros.
- **Impedir cobros a pacientes fusionados en la base**: va como hallazgo.
- **Las métricas «Facturado» y «Previsión trimestral», el libro de gastos y la tarjeta fiscal**: no
  tienen datos detrás (ADR-053; los gastos no tienen ticket), y un control sin dato no se dibuja.
- **Bonos (alta, saldo y avisos)**: T-027. Aquí el bono solo devenga su importe.
