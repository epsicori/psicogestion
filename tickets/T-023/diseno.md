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

---

## Anexo · Ronda 2 (07-10-2026)

Este anexo se añade al diseño y no corrige nada de lo anterior, salvo donde dice «sustituye». En lo
que toca, manda sobre §1-§7. Fuentes: `tickets/T-023/revision.json` (1 ALTA, 8 MEDIA, 6 BAJA),
`revision-a.ronda1.json` (juicio de los tres puntos), `evidencia.json` y el bloque «Ronda 2
(07-10-2026), decisiones del propietario» del contrato. El fallo de CA15 en el banco 23 es de T-050
y este anexo no lo toca.

### R2.0 · Hechos verificados (ronda 2), con ruta

- **R2-V1** `directorio_perfiles` (`supabase/migrations/20260822160000_rls_funciones_y_politicas.sql:1390`):
  - Es una vista definer con barrera, columnas `id, nombre_completo, rol, estado, centro_id`,
    filtro `(select public.rol_actual()) is not null` y `grant select … to authenticated`.
  - Ninguna migración posterior la redefine.
  - Precedente de uso: `agenda_citas_rango` (invoker) la une con `left join`
    (`20261007120000_cita_en_episodio_y_asistencia.sql:1560`).
  - `perfiles` solo tiene `perfiles_lectura_propia`: el administrador lee su propia fila y ninguna
    más. Es la causa de A-H1.
- **R2-V2** En la rama:
  - `datos.ts:186-207` lee la vista entera sin límite y después `from('perfiles').in('id', ids)`.
  - `datos.ts:115-121` lee los nombres con `.in('id', ids)` sin trocear.
  - `datos.ts:213-222` lee los pacientes sin rango y devuelve `[]` si falla.
  - `supabase/config.toml:18` fija `max_rows = 1000`.
- **R2-V3** Fusión (ADR-031):
  - `fn_normalizar_fusion_paciente` (`20260822094547_…:1152`) hace que `fusionado_en` apunte
    siempre a un superviviente final, así que un salto basta.
  - Existe el índice parcial `pacientes_fusionado_en_idx (fusionado_en) where fusionado_en is not null`.
  - `fn_proteger_columnas_reservadas_paciente` (`20260822160000_…:663`) impide cambiar
    `fusionado_en` a quien no es administrador, también a `postgres` sin JWT. Por eso en el banco
    la fusión se fija en el propio insert (precedente: `scripts/rls/01-fijacion.sql:101-104`, PFUS).
- **R2-V4** Quién está asignado a un fusionado:
  - `es_profesional_asignado(p)` es verdadero para el profesional del registro y también para el
    del superviviente.
  - `cobros_lectura` y `cobros_alta` (`20261011120000_economico_esquema.sql:1157` y `:1170`) no
    miran `fusionado_en`.
  - `fn_validar_cobro` (migración de la rama, `:49-50`) tampoco lo mira.
- **R2-V5** Zona de los centros:
  - `centros.zona_horaria` admite nulo (`20260822094547_…:151`).
  - Un centro con zona propia se fija como en `scripts/rls/16-series.sql:1522`
    (`insert into public.centros (id, nombre, zona_horaria)`).
  - `CA` y `CB` nacen sin zona y heredan `Europe/Madrid`.
- **R2-V6** Contrastes medidos con `lib/contraste` sobre los tokens de `app/globals.css`. Para los
  colores con alfa se compone en sRGB sobre `card`.
  - `Pildora success` actual (`text-primary-foreground` sobre `primary/10` en `card`): **1,13:1**.
  - `primary` sobre `muted`: **7,95:1**.
  - `primary` sobre `card`: 9,34:1.
  - `muted-foreground` sobre `card`: **5,33:1**.
  - `muted-foreground/70` sobre `card`: **2,92:1** (B-H8).
  - El prototipo pinta su `StatusPill` success como `bg-muted text-primary`
    (`app/prototipo/page.tsx:85`).
- **R2-V7** Pantallas que usan `tono="success"` (en `main` y en la rama). Las mira el verificador:
  - `app/(app)/pacientes/[id]/historia/notas/estado-de-nota.tsx`: Firmada, Modificada.
  - `app/(app)/pacientes/[id]/historial-clinico.tsx:29,48,100`: nivel bajo, diagnóstico principal.
  - `app/(app)/pacientes/[id]/page.tsx:92`: indicador de riesgo.
  - `app/(app)/pacientes/[id]/panel-datos.tsx:61`: Vigente.
  - `app/(app)/pacientes/[id]/panel-documentos.tsx:57,89`: Firmado.
  - `app/(app)/pacientes/[id]/panel-resumen.tsx:46-47,59,75,201`: Confirmada, Realizada, Al día.
  - `app/(app)/facturacion/presentacion.ts`: Cobrado (solo en la rama).
- **R2-V8** `Dialogo` (`components/ui/dialogo.tsx`, fuera de territorio) llama a `alCerrar` con
  Escape, con clic fuera y con la X. Quien lo monta decide si cierra. Precedentes:
  - Foco tras errores del servidor y mensaje de «resultado desconocido»:
    `app/(app)/cuenta/formulario-regenerar.tsx` (`campoConFoco` + `setFocus` en `useEffect`,
    `try/catch/finally`).
  - `aria-disabled`: `agenda/dialogo-reprogramar.tsx:312` y `agenda/documentacion/buscador.tsx:135`.
- **R2-V9** No hay `axe` en las dependencias (lo dice `accesibilidad/avisos.spec.ts`).
  - «El verificador de T-009» son las comprobaciones estructurales de `accesibilidad/acceso.spec.ts`:
    sin desbordamiento a 360 px, controles dentro de la ventana, nombre accesible y foco de vuelta.
  - El contraste lo cierran `lib/contraste/tokens.test.ts` y `components/ui/piezas.test.tsx`, no el spec.
- **R2-V10** La siembra (`supabase/seed.sql`):
  - Crea `admin@`, `ana@` y `bruno@psicogestion.test` de la misma forma en `auth.users`, con
    contraseña `psico1234`.
  - No siembra tarifas ni cobros, así que la vista sale vacía hasta que alguien registra un cobro.
  - Lucía Márquez (`d0080001-…-0001`) es paciente de Ana.
  - No hay ningún paciente fusionado.

### R2.1 · La migración `20261013120000_cobros_y_pendiente.sql` (se edita en su sitio)

La migración no está en `main`, así que no salta la regla 6 del linter (ediciones hacia atrás
contra `main`).
- Se conservan **sin cambios** las secciones (a), `motivo` y su check, y (b), `fn_validar_cobro` y
  su disparador.
- Se **sustituye** la sección (c).
- Se **añade** una sección (d).

**(c) La vista `pendiente_paciente`, con la fusión en un salto.** No cambian:
- las ocho columnas y sus tipos;
- el nombre;
- las opciones (`security_invoker = false, security_barrier = true`);
- el `revoke`/`grant`.

Cambian tres cosas:
- cada lateral suma los movimientos del superviviente **y** los de sus absorbidos;
- la fila del absorbido desaparece;
- el `profesional_id` y la RLS son los del superviviente.

```sql
create view public.pendiente_paciente
  with (security_invoker = false, security_barrier = true)
  as
select p.id as paciente_id,
       p.profesional_id,
       ((s.importe + b.importe) * 100)::bigint                         as devengado_centimos,
       (k.importe * 100)::bigint                                       as cobrado_centimos,
       (greatest(s.importe + b.importe - k.importe, 0) * 100)::bigint  as pendiente_centimos,
       (greatest(k.importe - s.importe - b.importe, 0) * 100)::bigint  as excedente_centimos,
       (case when s.importe + b.importe > k.importe then 'pendiente'
             when s.importe + b.importe = k.importe then 'cobrado'
             else 'cobrado_de_mas' end)::text                          as estado,
       s.sin_tarifa                                                    as citas_sin_tarifa
from public.pacientes p
cross join lateral (
  select coalesce(sum(x.precio), 0)::numeric                      as importe,
         count(*)::integer                                        as sesiones,
         (count(*) filter (where x.precio is null))::integer      as sin_tarifa
    from (
      select coalesce(
               (select t.importe
                  from public.tarifas_paciente t
                 where t.paciente_id = c.paciente_id      -- la tarifa del registro de la cita: nada se repunta
                   and t.tipo_terapia_id = c.tipo_terapia_id
                   and t.vigente_desde <= (c.inicio at time zone c.zona_horaria)::date
                 order by t.vigente_desde desc, t.orden desc
                 limit 1),
               tt.tarifa_base) as precio
        from public.citas c
        left join public.tipos_terapia tt on tt.id = c.tipo_terapia_id
       where c.paciente_id in (select p.id
                               union all
                               select m.id from public.pacientes m where m.fusionado_en = p.id)
         and c.estado = 'realizada'::public.estado_cita
         and c.bono_id is null
    ) x
) s
cross join lateral (
  select coalesce(sum(bo.importe), 0)::numeric as importe, count(*)::integer as bonos
    from public.bonos bo
   where bo.paciente_id in (select p.id
                            union all
                            select m.id from public.pacientes m where m.fusionado_en = p.id)
) b
cross join lateral (
  select coalesce(sum(co.importe), 0)::numeric as importe, count(*)::integer as cobros
    from public.cobros co
   where co.paciente_id in (select p.id
                            union all
                            select m.id from public.pacientes m where m.fusionado_en = p.id)
) k
where p.fusionado_en is null
  and (s.sesiones > 0 or b.bonos > 0 or k.cobros > 0)
  and ( (select public.rol_actual()) = 'administrador'::public.rol_usuario
     or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
         and public.es_profesional_asignado(p.id))
     or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
         and p.id in (select p2.id from public.pacientes p2
                       where p2.centro_id in (select public.centros_actuales()))) );
```

- El comentario de la vista se reescribe. Debe decir:
  - hay una fila por paciente **superviviente**;
  - suma lo suyo y lo de sus absorbidos (`fusionado_en = p.id`, un salto, ADR-031);
  - el absorbido no tiene fila;
  - la tarifa de cada cita se resuelve contra el paciente de la cita;
  - `profesional_id` y el recorte por rol son los del superviviente.
- Cada superviviente sale una sola vez: `p.id` es la clave de `pacientes` y los tres laterales
  agregan.

**(d) Dos funciones de lectura nuevas.** Las dos llevan:
- `language sql stable security invoker set search_path = ''`;
- alias en toda tabla del cuerpo (regla de `.claude/rules/supabase.md`);
- `revoke all on function … from public, anon;`;
- `grant execute on function … to authenticated;`.

Son invoker a propósito: leen la vista (definer, que recorta por `rol_actual()`) y
`directorio_perfiles` (definer). No necesitan privilegio propio y así no abren nada que la vista no
abra.

```sql
create function public.resumen_pendiente(p_profesional_id uuid default null)
returns table (pendiente_total_centimos bigint,
               pacientes_con_pendiente  integer,
               pacientes_cobrado_de_mas integer,
               filas                    integer)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(sum(v.pendiente_centimos), 0)::bigint,
         (count(*) filter (where v.estado = 'pendiente'))::integer,
         (count(*) filter (where v.estado = 'cobrado_de_mas'))::integer,
         count(*)::integer
    from public.pendiente_paciente v
   where p_profesional_id is null or v.profesional_id = p_profesional_id;
$$;

create function public.profesionales_del_pendiente()
returns table (id uuid, nombre_completo text)
language sql stable security invoker set search_path = ''
as $$
  select d.id, d.nombre_completo
    from public.directorio_perfiles d
   where d.id in (select v.profesional_id from public.pendiente_paciente v)
   order by d.nombre_completo, d.id;
$$;
```

- `p_profesional_id` **solo estrecha**: se parte de lo que la vista ya deja ver a quien llama. Un
  profesional que pase el uuid de otro obtiene ceros.
- `profesionales_del_pendiente()` devuelve una fila por cada profesional con alguna fila visible.
  Su tamaño lo acota el número de perfiles de la organización, no el de pacientes.
- Cada función lleva un comentario con su porqué:
  - `resumen_pendiente`: da cifras exactas, que `max_rows` no recorta.
  - `profesionales_del_pendiente`: el nombre sale de `directorio_perfiles` porque `perfiles` solo
    enseña la fila propia.

Después del cambio se ejecutan `npx supabase db reset && npm run tipos` (regenera
`lib/supabase/tipos-bd.ts`; nunca se edita a mano) y `npm run lint:migraciones`.

### R2.2 · El banco `scripts/rls/30-cobros.sql`: fijación y casos nuevos

Los ids nuevos usan el prefijo `30300000-`, el mismo de ahora. **Ningún valor esperado de los casos
existentes cambia.**
- Si alguna aserción existente acota «los pacientes del banco» por prefijo de id, pasa a una lista
  explícita (`P30A, P30B, P30C`), para que los pacientes nuevos no la muevan.
- D9 sigue restringido a esos tres pacientes. Con la consolidación, la vista y `cobros` ya no tienen
  por qué dar el mismo conjunto cuando un superviviente tiene absorbidos de otro centro, y eso es lo
  esperado.

**Fijación nueva (como `postgres`, antes del bloque A):**

| Id | Qué | Datos |
|---|---|---|
| `P30D` | paciente de PRO1 en CA **sin partidas** | nada |
| `P30E` | superviviente, PRO1, CA | una cita `T30` `realizada` (tarifa base 60,00, sin tarifa propia); un cobro de 20,00 |
| `P30F` | absorbido, PRO2, CB, `fusionado_en = P30E`, `fusionado_el = now()` **en el insert** | tarifa propia de `T30` = 70,00 desde D-30; una cita `T30` `realizada` el día D-1; un bono de 150,00; un cobro de 50,00 |
| `CK`, `CP` | centros con `zona_horaria` `'Pacific/Kiritimati'` (UTC+14) y `'Pacific/Pago_Pago'` (UTC−11) | patrón de `16-series.sql:1522` |
| `P30K`, `P30P` | pacientes de PRO1 en `CK` y `CP` | nada |

- Las citas y su paso a `realizada` se hacen igual que el banco ya lo hace para `P30C`: con
  `pg_temp.cita30` y la misma transición. Los cobros siguen el patrón del bloque B.
- Si algún disparador de pacientes exige que PRO1 pertenezca a `CK`/`CP`, se añade la fila de
  `perfiles_centros` como en `scripts/rls/19-nota-en-episodio.sql:57`, y nada más.
- Valores esperados de `P30E` consolidado:

  | Columna | Valor | Cálculo |
  |---|---|---|
  | devengado | **28000** | 60 + 70 + 150 |
  | cobrado | **7000** | 20 + 50 |
  | pendiente | **21000** | |
  | excedente | 0 | |
  | estado | `pendiente` | |
  | `citas_sin_tarifa` | 0 | |

**A · catálogo (casos añadidos)**
- A9, para las dos funciones (`resumen_pendiente(uuid)` y `profesionales_del_pendiente()`):
  - existen;
  - `prosecdef = false`;
  - `proconfig` contiene `search_path=""`;
  - `has_function_privilege('anon', …, 'EXECUTE')` es falso;
  - `has_function_privilege('authenticated', …, 'EXECUTE')` es verdadero.
- A10: la vista conserva sus **ocho** columnas exactas. Si la aserción del bloque A ya lo
  comprueba, basta con que siga en verde.

**A5 · el filtro «tiene alguna partida» (A-H5)**
- A5a: como ADM, `pg_temp.fila30(P30D)` = `'sin fila'`.
- A5b (gemela):
  1. Como `postgres`, se inserta un bono de 10,00 a `P30D`.
  2. Como ADM, la fila es `dev=1000 cob=0 pen=1000 exc=0 est=pendiente sin=0`.

**F · fusión (A-H2)**

En la tabla, «la cadena de F2» es `dev=28000 cob=7000 pen=21000 exc=0 est=pendiente sin=0`.

| Caso | Sesión | Comprobación | Gemela, en la misma sesión |
|---|---|---|---|
| F1 | ADM | `fila30(P30F)` = `'sin fila'`: el absorbido no tiene fila | — |
| F2 | ADM | `fila30(P30E)` = la cadena de F2, y `count(*)` de la vista con `paciente_id in (P30E, P30F)` = 1: sale una sola vez | — |
| F3 | PRO1, profesional del superviviente | `fila30(P30E)` = la cadena de F2: ve lo del absorbido | — |
| F4 | PRO2, profesional del absorbido y no asignado al superviviente | cero filas con `paciente_id in (P30E, P30F)` | `fila30(P30B)` ≠ `'sin fila'` |
| F5 | TEC1, centro del superviviente | `fila30(P30E)` = la cadena de F2 | — |
| F6 | TEC2, centro del absorbido | cero filas con `paciente_id in (P30E, P30F)` | `fila30(P30B)` ≠ `'sin fila'` |

**G · las dos funciones (A-H1, A-H3), llamadas como las llama la página**
- G1: como ADM, `select id, nombre_completo from public.profesionales_del_pendiente() where id in
  (PRO1, PRO2) order by id` = `(PRO1, 'Profesional Uno'), (PRO2, 'Profesional Dos')`, con los
  nombres de `01-fijacion.sql`. Es la prueba sin RLS fingida que pide A-H1.
- G2: como ADM, el conjunto de ids de `profesionales_del_pendiente()` es igual a `select distinct
  profesional_id from pendiente_paciente` en la misma sesión. Compara dos caminos sin fijar
  cantidad.
- G3:
  - como PRO1, todas las filas de `profesionales_del_pendiente()` tienen `id = PRO1` y hay al
    menos una;
  - como un perfil con `rol_actual()` nulo (el `SINPERFIL30` del banco, o PROBAJA en baja), cero
    filas.
- G4, como ADM:
  - `resumen_pendiente(PRO1)` es igual al agregado de la vista con `profesional_id = PRO1` en la
    misma sesión: suma de `pendiente_centimos`, cuenta de `pendiente`, cuenta de `cobrado_de_mas`
    y `count(*)`;
  - `resumen_pendiente(null)` es igual al mismo agregado sin filtro.
- G5, como PRO1:
  - `resumen_pendiente(PRO2)` = `(0, 0, 0, 0)`;
  - **gemela**: `resumen_pendiente(PRO1)` tiene `filas >= 3` (P30A, P30C, P30E).

**E10 · la zona del centro del paciente en `validar_cobro` (A-H4)**
- `hoy_k := (now() at time zone 'Pacific/Kiritimati')::date` y `hoy_p := (now() at time zone
  'Pacific/Pago_Pago')::date`, las dos con `\gset`.
- Los cuatro casos, como ADM:

  | Caso | Cobro | Esperado |
  |---|---|---|
  | E10a | a `P30K` con fecha `hoy_k` | **entra** |
  | E10b | a `P30K` con fecha `hoy_k + 1` | `assert_lanza_codigo_msg` 23514 `'no puede ser posterior a hoy'` |
  | E10c | a `P30P` con fecha `hoy_p` | **entra** |
  | E10d | a `P30P` con fecha `hoy_p + 1` | 23514 |

- Por qué discrimina a cualquier hora (el mutante calcula «hoy» con la hora de Madrid):
  - Kiritimati va por delante de Madrid 13 h en invierno y 12 h en verano. Con Madrid entre las
    11:00 y las 24:00 en invierno (12:00-24:00 en verano), `hoy_k` es mañana en Madrid y el
    mutante rechaza E10a.
  - Pago Pago va por detrás 12 h en invierno y 13 h en verano. Con Madrid entre las 0:00 y las
    12:00 en invierno (13:00 en verano), `hoy_p` es ayer en Madrid y el mutante acepta E10d.
  - Las dos ventanas juntas cubren el día entero.

**Mutantes nuevos.** Van al final del fichero, anotados como M1-M10, y en
`tickets/T-023/mutantes.json`. Se miden a mano en `begin … rollback`.

| Mutante | Dónde | Cae en |
|---|---|---|
| M11 sin `p.fusionado_en is null` | vista | F1 (sale la fila de P30F) |
| M12a sin la rama `union all` de los absorbidos en el lateral de citas | vista | F2 (`dev=21000`) |
| M12b ídem en bonos | vista | F2 (`dev=13000`) |
| M12c ídem en cobros | vista | F2 (`cob=2000`) |
| M13 `t.paciente_id = p.id` en lugar de `c.paciente_id` | vista | F2 (`dev=27000`) |
| M14 sin `(s.sesiones > 0 or b.bonos > 0 or k.cobros > 0)` | vista | A5a |
| M15 `zona_horaria_centro(null)` en `fn_validar_cobro` | función | E10a o E10d, según la hora |
| M16 `public.perfiles` en lugar de `public.directorio_perfiles` | `profesionales_del_pendiente` | G1 |
| M17 sin el `where` de `p_profesional_id` | `resumen_pendiente` | G4 y G5 |

En `scripts/rls/README.md`, la fila del módulo 30 añade: «fusión en un salto (F), funciones de
lectura (G), zona del centro (E10), filtro de partidas (A5)».

### R2.3 · La pantalla `app/(app)/facturacion/**`

**`datos.ts`**
- `ContextoFacturacion` gana `pagina: number`.
  - Sale de `?pagina` con `z.coerce.number().int().min(1).max(100000)`; si no valida, es 1.
  - Se lee **para todos los roles**: solo pagina lo que la vista ya deja ver.
- `export const TAMANO_PAGINA = 50`.
- Nuevo `cargarResumen = cache(async (filtro: string | null))`:
  - llama a `rpc('resumen_pendiente', filtro ? { p_profesional_id: filtro } : {})`;
  - devuelve `{ ok: true; resumen: { pendienteTotal: Centimos; conPendiente: number; deMas:
    number; filas: number } } | { ok: false }`;
  - espera una sola fila. Si no hay exactamente una, o algún número no es `Number.isSafeInteger`
    y ≥ 0, devuelve `{ ok: false }` y hace `console.error` del código.
- `cargarPendientes(filtro, pagina)` (sustituye):
  - Ordena con `.order('excedente_centimos', { ascending: false }).order('pendiente_centimos', {
    ascending: false }).order('paciente_id')` y pagina con `.range((pagina - 1) * TAMANO_PAGINA,
    pagina * TAMANO_PAGINA - 1)`.
  - Ese orden es el mismo de `ordenar`: primero lo cobrado de más por excedente, luego lo pendiente
    de mayor a menor y al final lo cobrado. El desempate por id lo hace estable entre páginas.
  - Lee los nombres con `.in('id', ids)` sobre **50 ids como mucho**.
  - Sigue contrastando cada fila con `pendiente()` (`aFilaDePendiente`).
  - Ya no llama a `ordenar`.
- `cargarOpcionesProfesional(elegido: string | null)` (sustituye):
  - Llama a `rpc('profesionales_del_pendiente')` y devuelve `{ id, nombre: nombre_completo }`.
  - Si `elegido` no está entre las opciones, lee
    `from('directorio_perfiles').select('id, nombre_completo').eq('id', elegido).maybeSingle()` y
    lo añade al principio con su nombre. Si no existe, lo añade con
    `t('cobros.profesionalDesconocido')`.
  - **En `app/(app)/facturacion/` no queda ningún `from('perfiles')`.**
  - Un fallo deja `[]`, como ahora.
- `cargarPacientesParaCobro()` (sustituye):
  - Devuelve `{ ok: true; pacientes } | { ok: false }`.
  - Lee por páginas de 1000, con `.order('apellidos').order('nombre').order('id').range(desde,
    desde + 999)` y `.is('fusionado_en', null)`, hasta que una página trae menos de 1000 filas.
  - Deduplica por `id`.
  - Un error en cualquier página es `{ ok: false }` (B-H9, B-H10).

**`presentacion.ts`**: se eliminan `ordenar` y `totalPendiente`, y sus casos en
`presentacion.test.ts`. El orden y el total viven ya en la base: una sola fuente. `pildoraDe` no
cambia.

**`bloques.tsx`**
- `BloqueMetrica` lee `cargarResumen(profesionalFiltrado)`:
  - valor: `formatearImporte(pendienteTotal)`;
  - matiz: `conPendiente`;
  - segunda línea: `deMas`;
  - con `{ ok: false }`, `AvisoDeError` (`cobros.errorPendientes`).
- `BloquePendientes`:
  - Lee `cargarResumen`, que está memoizado: la métrica y la lista hacen un solo viaje.
  - Calcula `ultima = max(1, ceil(filas / TAMANO_PAGINA))` y `pagina = min(contexto.pagina,
    ultima)`, y pide `cargarPendientes(filtro, pagina)`.
  - Si `filas > TAMANO_PAGINA`, pinta bajo la lista un
    `<nav aria-label={t('cobros.paginacion.nombre')}>` con:
    - el texto `tCon('cobros.paginacion.rango', { desde, hasta, total })`;
    - un `Link` de `next/link` «Anteriores» si `pagina > 1`;
    - un `Link` «Siguientes» si `pagina < ultima`.
  - El enlace que no aplica **no se pinta**. Los dos llevan `min-h-11` y un `href` que conserva
    `?profesional` cuando lo hay.
- B-H7: `FilaConAvatar` va **sin** `subtitulo`. Debajo, en el mismo `<li>`, va
  `<p className="ml-12 text-xs break-words text-muted-foreground">{subtituloDe(fila)}</p>`, como ya
  hace la línea de «sesiones sin precio». El `truncate` de `piezas.tsx` no cambia: el importe ya no
  pasa por él.

**`page.tsx`**
- `AccionRegistrar`: si `cargarPacientesParaCobro()` devuelve `{ ok: false }`, pinta
  `<AvisoDeError mensaje={t('cobros.errorPacientes')} />` **en lugar del botón**, sin diálogo vacío.
- `SelectorSiAdministrador` llama a `cargarOpcionesProfesional(profesionalFiltrado)`.

**`selector-profesional.tsx`** (B-H3)
- No cambia su interfaz. Como `elegido` llega siempre entre las opciones, el desplegable refleja el
  filtro activo.
- `alElegir` construye la URL **sin** `pagina`: al cambiar de profesional se vuelve a la página 1.

**`formulario-cobro.tsx`**
- B-H1: el cuerpo de la transición va en `try { … } catch { … } finally { … }`.
  - El `catch` llama a `setMensaje(t('cobros.resultadoDesconocido'))` y a `router.refresh()`, para
    que «Últimos cobros» enseñe la verdad.
  - El formulario sigue montado y conserva sus valores.
- B-H2: el botón pasa a `aria-disabled={enviando}`, nunca a `disabled`.
  - El envío se guarda con un `useRef<boolean>`: se pone a `true` antes de `iniciarTransicion` y a
    `false` en el `finally`. Un segundo envío mientras dura el primero no llama a la acción.
  - Tras errores de campo del servidor, el foco va al **primer** campo con error, en este orden:
    `pacienteId, importe, fecha, formaPago, referencia, motivo`. Se usa el patrón de
    `formulario-regenerar.tsx` (estado `campoConFoco` + `setFocus` en `useEffect`).
- B-H11: prop nueva `alCambiarEnvio: (enviando: boolean) => void`, que se llama en un `useEffect`
  sobre `enviando`.

**`registrar-cobro.tsx`** (B-H11)
- Guarda `enviando` (lo recibe por `alCambiarEnvio`) y su `alCerrar` es `() => { if (!enviando)
  setAbierto(false); }`. Mientras se envía, ni Escape, ni el clic fuera, ni la X cierran el
  diálogo, y el resultado no se pierde.
- El aviso de éxito deja de ser `sr-only`: pasa a `<p role="status" className="text-sm
  text-foreground empty:hidden">`, visible junto al botón hasta la siguiente apertura.

**`acciones.ts`** (A-H2)
- El paso 3 lee `select('centro_id, fusionado_en')`.
- Si `fusionado_en` no es nulo, devuelve `{ ...ESTADO_INICIAL, errores: { pacienteId:
  [t('cobros.pacienteFusionado')] } }` y **no inserta**.
- El cobro va siempre al `paciente_id` elegido, y el formulario solo ofrece supervivientes. Lo que se
  cobra al superviviente salda también lo que debía el absorbido, porque la vista suma los dos.
- Solo responde así a quien ya ve el paciente bajo RLS, así que no abre un oráculo nuevo.

**`lib/i18n/es.ts`**, claves nuevas del bloque `cobros` (texto fijado):
- `profesionalDesconocido: 'Profesional no encontrado'`
- `errorPacientes: 'No se ha podido cargar la lista de pacientes'`
- `resultadoDesconocido: 'No sabemos si el cobro se ha registrado. Mira «Últimos cobros» antes de repetirlo.'`
- `pacienteFusionado: 'Este paciente se unió a otro registro. Registra el cobro en el que se conserva.'`
- `paginacion: { nombre: 'Páginas de pacientes', rango: 'Del {desde} al {hasta} de {total}', anteriores: 'Anteriores', siguientes: 'Siguientes' }`

**Pruebas unitarias (jsdom)**
- `datos.test.ts`: G1-G5 viven en el banco; aquí solo se prueba el cableado.
  - (a) `cargarOpcionesProfesional` llama a `rpc('profesionales_del_pendiente')` y **nunca** a
    `from('perfiles')`. Con `elegido` fuera de la lista, lee `directorio_perfiles` y lo antepone.
  - (b) Para la página 2, `cargarPendientes` llama a `.range(50, 99)` y a los tres `.order` en ese
    orden; `.in` recibe 50 ids o menos.
  - (c) `cargarPacientesParaCobro` pide una segunda página cuando la primera trae 1000 filas, para
    con la página corta y devuelve `{ ok: false }` si falla la segunda.
  - (d) `cargarResumen` con dos filas o con un número no entero devuelve `{ ok: false }`.
- `bloques.test.tsx`:
  - con `filas = 120` en la página 2, «Del 51 al 100 de 120» y los dos enlaces;
  - en la página 1, sin «Anteriores»;
  - la métrica pinta el `pendienteTotal` del resumen aunque la página traiga menos filas;
  - el importe de la fila está en un nodo sin la clase `truncate`.
- `formulario-cobro.test.tsx`:
  - si la acción rechaza, aparece el mensaje `resultadoDesconocido` y se llama a `router.refresh`;
  - con doble envío, la acción se llama una sola vez, el botón tiene `aria-disabled="true"` y no
    `disabled`, y el foco sigue en él;
  - con errores del servidor en `fecha`, `document.activeElement.id === 'fecha'`;
  - con errores en `pacienteId` y en `fecha`, el foco va a `pacienteId`.
- `registrar-cobro.test.tsx`: con la acción pendiente, Escape no cierra el diálogo. Al resolverse,
  se cierra y «Cobro registrado» es visible (sin `sr-only`).
- `selector-profesional.test.tsx`: con `elegido` presente como opción, el desplegable lo muestra.
  Elegir otro navega a `/facturacion?profesional=<uuid>` sin `pagina`.
- `acciones.test.ts`: con un paciente con `fusionado_en`, error en `pacienteId` y sin llamar a
  `insert`.
- `page.test.tsx`: con `cargarPacientesParaCobro` en `{ ok: false }`, se pinta `AvisoDeError` y no
  hay ningún botón «Registrar cobro».

### R2.4 · `Pildora` y `Metrica` (B-H4, B-H8)

- `components/ui/piezas.tsx`:
  - Los estilos de `Pildora` pasan a una constante exportada, `ESTILOS_PILDORA`.
  - `success` pasa a **`'bg-muted text-primary'`** (7,95:1, el del prototipo). `info` y `warning`
    no cambian.
  - La matiz de `Metrica` pasa de `text-muted-foreground/70` a **`text-muted-foreground`** (5,33:1
    sobre `card`). Solo la usa Facturación.
- `lib/contraste/tokens.ts`: se añade a `PARES`
  `{ texto: 'primary', fondo: 'muted', donde: 'Píldora success de Pildora (components/ui/piezas.tsx): Cobrado, Firmada, Al día, Vigente…' }`.
- `components/ui/piezas.test.tsx`:
  - Un caso nuevo recorre `ESTILOS_PILDORA`. Para cada tono extrae `bg-<fondo>` y `text-<texto>`,
    exige que **no** lleven `/` (alfa, que `lib/contraste` no sabe medir) y exige que
    `{ texto, fondo }` esté en `PARES`.
  - Con el `success` antiguo cae por el `/`; con un par que no esté en la lista, por la pertenencia.
  - Otro caso: la matiz de `Metrica` no lleva `/`.
- El cambio llega a la vez a todas las pantallas de R2-V7, por decisión del propietario. El
  verificador las mira en CA12.

### R2.5 · Hallazgo por hallazgo

| Hallazgo | Qué se hace | Cómo se comprueba |
|---|---|---|
| **A-H1** ALTA | Opciones desde `profesionales_del_pendiente()` (nombre de `directorio_perfiles`) | Banco G1-G3 y M16; `grep -rn "from('perfiles')" "app/(app)/facturacion"` vacío; CA10 manual con datos |
| **A-H2** | Vista consolidada en el superviviente (R2.1 c); la acción rechaza un fusionado | Banco F1-F6, M11-M13; `acciones.test.ts` |
| **A-H3** (+B-H5, B-H10) | **Filtrado y agregado en la base + paginación**: métrica por `resumen_pendiente` (exacta), lista por `.range` de 50, nombres con ≤ 50 ids; selector por función; pacientes del formulario por páginas de 1000 | Banco G4-G5, M17; `datos.test.ts` (b)(c); `bloques.test.tsx` |
| **B-H1** | `try/catch/finally` con «resultado desconocido» y `router.refresh()` | `formulario-cobro.test.tsx` |
| **B-H2** | `aria-disabled` + guarda por ref; foco al primer campo con error del servidor | `formulario-cobro.test.tsx` |
| **B-H3** | El elegido siempre entre las opciones (nombre del directorio o «Profesional no encontrado») | `datos.test.ts` (a), `selector-profesional.test.tsx` |
| **B-H4** | `success` = `bg-muted text-primary`, par en `PARES` | `tokens.test.ts`, `piezas.test.tsx`; CA12 en las pantallas de R2-V7 |
| **B-H6** | Spec reescrito (R2.6) | `npx playwright test accesibilidad/facturacion.spec.ts` |
| **B-H7** | El importe en su propia línea, sin `truncate` | `bloques.test.tsx`; spec a 360 px |
| **A-H4** BAJA | **Se arregla**: E10 con Kiritimati y Pago Pago | Banco E10a-d y M15 |
| **A-H5** BAJA | **Se arregla**: A5a/A5b | Banco A5 y M14 |
| **A-H6** BAJA | **Se arregla**: los tres puntos a `docs/state.md` (R2.7) | Lectura de `docs/state.md` §Hallazgos |
| **B-H8** BAJA | **Se arregla**: matiz `text-muted-foreground` | `piezas.test.tsx` |
| **B-H9** BAJA | **Se arregla**: `{ ok: false }` → `AvisoDeError` en lugar del botón | `page.test.tsx` |
| **B-H11** BAJA | **Se arregla**: no se cierra mientras se envía; éxito visible | `registrar-cobro.test.tsx` |

Ningún hallazgo va solo a `state.md`: todos caben en el territorio ampliado.

### R2.6 · `accesibilidad/facturacion.spec.ts` (B-H6), reescrito

- Precondición, escrita en la cabecera: `npx supabase db reset && npm run seed`.
- El spec escribe **un** cobro en la base local sembrada: 0,01 € a «Márquez, Lucía», en efectivo,
  con referencia `T-023 spec <Date.now()>` para reconocerlo. Esa base se resetea a menudo; lo
  económico no se borra y no se intenta borrar.
- `entrar` como `admin@psicogestion.test` / `psico1234`, con el mismo flujo que `avisos.spec.ts` y
  `waitForURL('**/pacientes')`.
  - Si el administrador cae en `/primera-vez`, **no se esquiva**: es un BLOQUEO que el
    implementador devuelve. La siembra lo crea igual que a Ana (R2-V10).
- En serie, a 360 × 740:
  1. Sin desbordamiento horizontal. «Registrar cobro» mide ≥ 44 px y está dentro de la ventana. El
     selector de profesional se ve y está dentro de la ventana (es el administrador).
  2. Se abre el diálogo y se **envía vacío**. El foco va a «Paciente». Con los mensajes de error
     pintados, el diálogo sigue dentro de la ventana y la página no desborda.
  3. Se teclea `-5,00` en Importe: aparece «Motivo de la devolución» y el diálogo sigue dentro.
  4. Se rellena el cobro de 0,01 € y se envía. El diálogo se cierra, el foco vuelve a «Registrar
     cobro», «Cobro registrado» es **visible** y «Últimos cobros» contiene «Lucía Márquez».
  5. Se abre y se cierra con Escape: el foco vuelve al botón.
- No mide el contraste en el navegador (R2-V9).

### R2.7 · Textos para `docs/state.md` §Hallazgos (A-H6)

Se añaden tal cual. El implementador reescribe `state.md` respetando las 80 líneas.

- **Cita `realizada` → `cancelada` mueve el pendiente (T-023, juicio de A)**: medido, devengado
  6000 → 0 y quien ya había pagado pasa a `cobrado_de_mas` 6000. Queda rastro en `auditoria` (2
  filas, `auditar_citas`) y el técnico no puede hacerlo (UPDATE 0). Causa: R2.8 de T-021, falta una
  guarda de transición en `citas`. Ticket aparte, de agenda.
- **El técnico puede deducir el precio de una sesión (T-023, juicio de A)**: restando el pendiente
  antes y después de una cita realizada. Riesgo aceptado: el contrato pide «el mismo pendiente» y la
  vista no lleva sesiones, tipo ni fechas. Familia de R2-H1 de T-021.
- **Cobro a un paciente fusionado, abierto en la base (T-023, juicio de A)**: `cobros_alta` y
  `fn_validar_cobro` aceptan el `paciente_id` de un absorbido. Desde la ronda 2 la vista consolida
  en el superviviente y la acción lo rechaza, así que cerrarlo en la base ya no quita ninguna
  salida. Ticket aparte, con su banco.
- **«Últimos cobros» filtrado por profesional usa el del registro, no el del superviviente
  (T-023 ronda 2)**: con el filtro del administrador, el cobro hecho a un absorbido de otro
  profesional cuenta en la fila del superviviente pero no sale en la lista de los 20 últimos. No
  cambia ninguna cifra.
- En la línea existente **`directorio_perfiles` sin prueba RLS**: añadir «30-cobros la ejerce a
  través de `profesionales_del_pendiente()` (ADM, PRO1, rol nulo); sigue sin módulo propio».

### R2.8 · Lo que repite el verificador en la ronda 2

Antes de empezar:
- `npx supabase db reset && npm run seed && npm run tipos`;
- `select max(version) from supabase_migrations.schema_migrations` debe dar `20261013120000`.

| CA | Cómo |
|---|---|
| CA1, CA2, CA4, CA5 | `npm run test:rls`: bloques B y C del 30 en verde (valores sin cambios) |
| CA3 | Bloque E del 30 en verde |
| CA6, CA7 | Bloque D del 30 **y** F3-F6 en verde |
| CA9 | Manual como Ana: sin selector |
| **CA10** | Banco G en verde **y** prueba manual (detalle bajo la tabla) |
| CA11 | Manual: ningún control de editar o borrar |
| CA12 | Manual al lado de `/prototipo`, **más** la píldora success nueva en las pantallas de R2-V7 |
| CA13 | Manual por rol (la vista cambió) |
| CA14 | El spec de R2.6 en verde |
| CA15 | `npm run lint`, `npm run build`, `npm test`, `npm run lint:migraciones`, el spec de R2.6 y `npm run test:rls` con todos los módulos en verde salvo el 23 (T-050), que se anota y no cuenta |

Prueba manual de CA10:
1. Como administrador, registrar un cobro a un paciente de Ana y otro a uno de Bruno.
2. El selector ofrece «Ana Márquez» y «Bruno Ferrer» por su nombre.
3. Elegir a Ana mueve la métrica y la lista.
4. Poner a mano `?profesional=<uuid de Bruno>` muestra «Bruno Ferrer» en el desplegable.

CA8 sigue NO_VERIFICABLE (T-023b). Además, los mutantes M11-M17 se miden y su resultado va a
`tickets/T-023/mutantes.json`.

### R2.9 · Qué revisar (los dos revisores y la autoevaluación)

**Revisor A (base, RLS, dinero)**
- La vista:
  - ¿El absorbido no tiene fila (`p.fusionado_en is null`) y el superviviente sale una sola vez?
  - ¿Cada lateral suma el `union all` de absorbidos? ¿Ninguno suma por `fusionado_en` de más de un
    salto ni por `coalesce(fusionado_en, id)` sobre la fila de fuera?
  - ¿La tarifa se sigue resolviendo contra `c.paciente_id` (M13)? ¿El recorte por rol mira el
    `p.id` del superviviente?
- Decisión deliberada que hay que juzgar: **el técnico del centro del superviviente ve sumado lo del
  absorbido de otro centro, y el técnico del centro del absorbido deja de verlo** (F5, F6). Son solo
  importes, sin dato clínico. Si se juzga inaceptable, es un BLOQUEO para el propietario, no un
  arreglo silencioso.
- PRO2, profesional del absorbido, sigue leyendo en `cobros` los cobros de P30F
  (`es_profesional_asignado`), pero no tiene fila en la vista. Es coherente con la decisión «quien no
  está asignado al superviviente no ve el pendiente», y queda anotado.
- Las dos funciones:
  - ¿Son `security invoker`, con `search_path = ''` y sin `execute` para `anon`/`public`?
  - `p_profesional_id` solo estrecha (G5): ¿hay alguna forma de que amplíe?
  - ¿`profesionales_del_pendiente` no lee `perfiles` (M16) ni devuelve `motivo_estado`?
- `max_rows`:
  - ¿Queda alguna lectura de la vista o de `pacientes` sin `range`/`limit`, o que pueda pasar de
    1000 en silencio?
  - ¿Queda algún `.in()` con más de 50 ids?
- E10: ¿las dos zonas están en el **centro del paciente** y no en la sesión? Si se puede, comprobar
  M15 a dos horas distintas; si no, razonarlo con la tabla de R2.2.
- Las aserciones existentes no cambian de valor esperado; las acotadas por prefijo pasaron a lista.
- Cada negativa nueva lleva su gemela en la misma sesión (F4, F6, G5) y su código exacto (E10b/d).

**Revisor B (interfaz, foco, formularios)**
- El botón:
  - nunca es `disabled`;
  - con doble envío, la acción se llama una sola vez;
  - tras un error del servidor, el foco va al primer campo con error en el orden fijado, también
    cuando el error es de `motivo`, que solo existe con importe negativo.
- El `catch`:
  - no deja el formulario en un estado del que no se pueda salir;
  - su texto no afirma ni niega que el cobro exista.
- El cierre: Escape, el clic fuera y la X no cierran durante el envío. Fuera del envío sí cierran,
  y el foco vuelve al botón.
- La paginación:
  - el enlace que no aplica no se pinta (nada de controles sin acción);
  - el `href` conserva `?profesional`, y el selector lo quita junto con `pagina`;
  - `?pagina=999999` cae en la última página y `?pagina=abc` en la 1.
- `Pildora success`:
  - en las pantallas de R2-V7, ningún sitio dependía del verde lleno (`bg-primary`) para distinguir
    estados;
  - la prueba de `piezas.test.tsx` cae con el `success` antiguo por la razón correcta (el `/`).
- El importe de la fila del pendiente se lee entero a 360 px (paso 1 del spec y `bloques.test.tsx`).
- Cuando la lista de pacientes falla, `AvisoDeError` ocupa el sitio del botón: no queda un diálogo
  vacío ni un botón que no hace nada.

### R2.10 · Territorio

Todo cabe en el `territorio:` ampliado del contrato. **No falta territorio.** Se escribe en:
- la migración;
- `scripts/rls/30-cobros.sql` y `scripts/rls/README.md`;
- `lib/supabase/tipos-bd.ts` (regenerado);
- `app/(app)/facturacion/**`;
- `components/ui/piezas.tsx` y su prueba;
- `lib/contraste/**`;
- `lib/i18n/es.ts`;
- `accesibilidad/facturacion.spec.ts`;
- `tickets/T-023/**`, incluido `mutantes.json`;
- `docs/bitacora/T-023*.md` y `docs/state.md`.

No se tocan:
- `components/ui/dialogo.tsx` ni `lib/formularios.ts`: R2.3 resuelve B-H2 y B-H11 desde los
  ficheros de Facturación;
- `scripts/rls/26-economico.sql`: no necesita cambios en esta ronda.

### R2.11 · Delegable (ronda 2)

**Nada.** Todo lo que cambia es de la fábrica según `.claude/rules/pipeline.md`:
- RLS y dinero: la vista, las funciones y el banco;
- foco y formulario: B-H1, B-H2, B-H11;
- paginación con estado en la URL;
- contraste con su prueba.

Las claves de i18n van con el código que las usa.

### R2.12 · Riesgos de la ronda 2, por probabilidad

1. **Alta**: que un caso existente del 30 cuente filas por prefijo y los pacientes nuevos lo
   muevan. Mitigación: lista explícita, sin tocar valores esperados.
2. **Media**: que el administrador de la siembra no llegue a `/pacientes` sin segundo factor
   (R2.6). Se devuelve como BLOQUEO; no se esquiva.
3. **Media**: que el revisor A no comparta la decisión sobre el técnico (F5/F6). Está señalada en
   R2.9 para que se juzgue de frente.
4. **Media**: que un centro con zona propia en la fijación choque con algún disparador de pacientes
   o de pertenencia. Mitigación: la de R2.2 (fila en `perfiles_centros`).
5. **Baja**: el rendimiento del `in (… union all …)` en cada lateral. Usa el índice por
   `paciente_id` de `citas`, `bonos` y `cobros`, y el parcial de `fusionado_en`. Si el `explain` del
   verificador enseña un recorrido secuencial de `pacientes` por fila, se anota (no cambia el
   resultado).
6. **Baja**: en los empates el orden cambia respecto al anterior (ahora por `paciente_id`, antes
   por posición). Ningún criterio fija el orden de los empates.

### R2.13 · Lo que no entra en la ronda 2, y por qué

- **Impedir en la base el cobro a un fusionado**: va a `state.md` (R2.7). Con la vista consolidada
  ya no quita ninguna salida, pero es otro ticket con su banco.
- **Un buscador de pacientes en el formulario**, en lugar del desplegable: la paginación de 1000
  cierra B-H10, y buscar es interfaz nueva.
- **La guarda `realizada → cancelada`** y **la deducción del precio por el técnico**: van a
  `state.md`.
- **Que «Últimos cobros» siga al superviviente con el filtro de profesional**: no mueve ninguna
  cifra; va a `state.md`.
- **CA15 por el banco 23**: es de T-050.
- **Cambios en `Dialogo` o en `lib/formularios.ts`**: no hacen falta y están fuera de territorio.

## Anexo · Ronda 3 (07-10-2026)

Cierra `revision.json` de la ronda 2 (0 ALTA, 3 MEDIA, 7 BAJA) sobre la rama `worktree-agent-a65aa0bb5f872243e` (27cd231). Todo cabe en el territorio de R2.10. **No cambian la migración ni `tipos-bd.ts`.**

### R3.0 · Hechos verificados
- Next 16.3.1: si el fetch RSC de `router.refresh()` lanza, `fetch-server-response.js:237-242` devuelve la URL; si la respuesta no es 200, `:143-148` llama a `doMpaNavigation`. `ppr-navigations.js:1123` lo marca `exitStatus: 2` y `:997` pone `isHardRetry = true`: recarga completa. `next.config.ts` no activa el modo sin conexión. Que falle el POST de la acción solo rechaza la promesa (`reducers/server-action-reducer.js:85-98`), sin navegar.
- `cobros.id` es la clave primaria (`20261011120000_economico_esquema.sql:171`) y `authenticated` ya puede insertarlo (`:1255-1256`): la base ya impide dos filas con el mismo id.
- Zod 4.4.3, medido: `z.coerce.number().int().min(1)` acepta `'999999'` y rechaza `'1e21'`, `'9007199254740993'`, `'abc'`, `'0'` y `'2.5'`. El `superRefine` no corre si falla otro campo: con Paciente vacío no hay error de Motivo.
- `formulario-cobro.tsx:197` repite el patrón de B-H8: un `aria-live` con `empty:hidden`.

### R3.1 · B-H1 (MEDIA): el `catch` no refresca, y el reintento es seguro por clave de envío
- `formulario-cobro.tsx`: fuera `useRouter` y `router.refresh()`. El `catch` solo pinta `resultadoDesconocido`; el formulario sigue montado y con lo escrito.
  - `claveRef = useRef<{ huella: string; id: string } | null>(null)`. En `alSerValido`, antes de la transición: `huella = JSON.stringify(datos)`; si difiere de `claveRef.current?.huella`, `claveRef.current = { huella, id: crypto.randomUUID() }`. Se llama a `registrarCobro({ ...datos, id })`.
  - Con éxito, `claveRef.current = null` antes de `alRegistrar()`: un cobro igual registrado después es otro cobro.
- `acciones.ts`: antes del paso 2, `z.object({ id: z.uuid() }).safeParse(datos)`; si falla, `fallo()` sin insertar. El `insert` lleva `id` (cambia el comentario del paso 6).
  - Paso 7, antes del genérico: `23505` con `cobros_pkey` en el mensaje → `from('cobros').select('id').eq('id', id).eq('registrado_por', usuario.id).maybeSingle()`. Con fila: `revalidatePath` y `cobroRegistrado`. Sin fila o con error: `fallo()`. Solo confirma cobros propios y visibles: no abre oráculo.
- `es.ts`: `resultadoDesconocido: 'No sabemos si el cobro se ha registrado. Vuelve a pulsar «Registrar cobro» sin cambiar nada: si ya estaba registrado, no se duplica.'`
- Descartadas: refrescar solo con `navigator.onLine` (un 500 con el servidor caído recarga igual); remitir a «Últimos cobros» (B-H7); una columna `clave_envio` (la clave primaria ya lo es).
- Pruebas:
  - `formulario-cobro.test.tsx` (sustituye la de B-H1): si rechaza, aviso visible, `refresh` sin llamar e Importe intacto; un segundo envío igual lleva el mismo `id` (UUID); con el importe cambiado, `id` distinto; tras un éxito, el mismo envío lleva `id` distinto.
  - `acciones.test.ts`: el `insert` lleva el `id` (sustituye «sin id»); sin `id` o no UUID → `fallo()` sin `insert`; `23505` de `cobros_pkey` con fila propia → `cobroRegistrado` y `revalidatePath`; sin fila → `fallo()`; `23505` de otra restricción → `fallo()` sin `select`.
  - Banco 30, **E12** (E11 ya existe): como PRO1, dos `insert` con el mismo `id`: el segundo da `23505` y `count(*) = 1`. Gemela: otro `id` en la misma sesión entra.
  - El paso 4 del spec (R3.2), en Chromium. `grep -n refresh "app/(app)/facturacion/formulario-cobro.tsx"` sale vacío.

### R3.2 · B-H2 (MEDIA): `accesibilidad/facturacion.spec.ts`
- Cabecera: el paso 4 admite como mucho 18 filas «Lucía Márquez · 0,01 €» en «Últimos cobros»; con más, falla con «resetea: db reset && npm run seed».
- Paso 1: además, `getByRole('combobox', { name: 'Profesional' })` visible, con `x ≥ 0` y `x + width ≤ 360`.
- Paso 2: el `boundingBox` del diálogo se mide **después** del envío vacío y del foco en Paciente. Se añade el botón de envío del diálogo: tras `scrollIntoViewIfNeeded()`, dentro de 360 × 740. La página no desborda.
- Paso 3: con `-5,00` y Motivo a la vista, `fill('')` en Fecha, 121 caracteres en Referencia y envío. `[aria-invalid="true"]` del diálogo `toHaveCount(4)` (Paciente, Fecha, Forma de pago, Referencia), foco en Paciente y las tres medidas del paso 2.
- Paso 4, que prueba también B-H1:
  1. `antes` = filas de «Últimos cobros» con «Lucía Márquez» y «0,01». Se rellena el cobro como ahora.
  2. `page.route` del primer POST con cabecera `next-action`: `await route.fetch()` (el servidor inserta), `context.setOffline(true)` y `route.abort('internetdisconnected')`. Se cuentan los `framenavigated` del marco principal.
  3. Se pulsa Registrar: `resultadoDesconocido` visible. Tras `waitForTimeout(1500)`: cero navegaciones, el aviso sigue y el Importe vale `0,01`.
  4. `setOffline(false)`, `unroute` y otra pulsación: el diálogo se cierra, el foco vuelve a «Registrar cobro», «Cobro registrado» es visible y las filas valen `antes + 1`, no `+ 2`.
  5. En la región «Por paciente», la línea del importe de «Lucía Márquez» cumple `scrollWidth ≤ clientWidth` y `right ≤ 360`.
- Con el código de la ronda 2 cae el paso 4.3: el `refresh` sin red recarga la página.

### R3.3 · B-H3 (MEDIA): `formulario-cobro.test.tsx`
- Nuevo: el servidor devuelve `{ fecha: [fechaFutura] }` → `waitFor(() => document.activeElement?.id === 'fecha')`.
- Nuevo: `rellenar('-5,00')`, Motivo «Error de cobro» y el servidor devuelve `{ motivo: [devolucionNecesitaMotivo] }` → foco en `motivo`.
- Se queda el de `{ fecha, pacienteId }` → `pacienteId`. El mutante `if (estado.errores) setCampoConFoco({ campo: 'pacienteId' })` cae por los dos nuevos.

### R3.4 · Las siete BAJA: todas se arreglan
| Id | Cómo, y con qué prueba |
|---|---|
| A-H1, A-H2 | `docs/state.md` con el texto de R3.5. Prueba: su lectura |
| A-H3 (+B-H5) | `cargarOpcionesProfesional` → `{ ok: true; opciones } \| { ok: false }`. Fallo de la RPC o error del directorio → `{ ok: false }`; «Profesional no encontrado» solo sin fila y sin error. `page.tsx` pinta `AvisoDeError` (`cobros.errorProfesionales: 'No se ha podido cargar la lista de profesionales'`) en lugar del selector. `datos.test.ts`: sustituye la de `:362` y añade el error del directorio. `page.test.tsx`: con `{ ok: false }`, aviso y ningún combobox «Profesional» |
| B-H4 | `esquemaPagina = z.coerce.number().int().min(1)`, sin `max`. `datos.test.ts`: `'999999'` → 999999 (sustituye `'100001'` → 1); `'1e21'`, `'abc'` y `'0'` → 1. `bloques.test.tsx`: el contexto lleva 999999 y, con 120 filas, pinta «Del 101 al 120 de 120» y pide la página 3 |
| B-H6 | La `<nav>` pasa a `paginacion-pendientes.tsx` (`'use client'`; recibe `pagina`, el texto del rango y los dos `href` o `null`). El clic en un enlace pone a `true` una variable de módulo. Un efecto sobre `pagina` (también al montar), si la ve, la apaga y enfoca el `<p>` del rango (`tabIndex={-1}`). Prueba en `paginacion-pendientes.test.tsx`, con `next/link` como `<a>`: clic en «Siguientes» y nuevo render con la página siguiente → foco en el rango; lo mismo desmontando y montando; montar sin clic no mueve el foco |
| B-H7 | El texto de R3.1 ya no remite a «Últimos cobros». Lo prueban R3.1 y el paso 4 |
| B-H8 | Fuera `empty:hidden` de `registrar-cobro.tsx:41` y de `formulario-cobro.tsx:197`: las dos regiones existen, vacías, desde el montaje. Prueba: al pintar, la región existe y no lleva la clase. El paso 1 vigila el desbordamiento |

### R3.5 · `docs/state.md` (A-H1, A-H2): sustituye las líneas 26-31 de la rama
```
- **T-023, fuera de alcance (R2.7 y ronda 3)**:
  - una cita que pasa de `realizada` a `cancelada` rebaja el devengado (medido: 6000 → 0; quien ya había pagado pasa a `cobrado_de_mas` 6000). Queda rastro en `auditoria` (2 filas, `auditar_citas`) y el técnico no puede hacerlo (UPDATE 0). Falta una guarda de transición en `citas` (R2.8 de T-021). Ticket aparte, de agenda;
  - el técnico puede deducir el precio de una sesión restando el pendiente antes y después de una cita realizada. Riesgo aceptado: la vista no lleva sesiones, tipo ni fechas (familia de R2-H1 de T-021);
  - la base admite un cobro a un paciente fusionado (`cobros_alta`, `fn_validar_cobro`); la acción lo rechaza. Ticket aparte, con su banco;
  - «Últimos cobros» recorta por el paciente del registro y el pendiente consolida en el superviviente, así que no casan en tres casos: con el filtro de profesional del administrador; el técnico del centro del superviviente ve sumado el cobro hecho al absorbido de otro centro y no lo ve en la lista (`cobros_lectura`); el profesional del absorbido ve sus cobros en la lista y no tiene fila en el pendiente. No cambia ninguna cifra. Ticket aparte.
- **`directorio_perfiles` sin prueba RLS**: ningún módulo de `scripts/rls/` la prueba como vista; la usan tres pantallas admin (centros, dar de baja, TOTP) desde T-041/T-045. `30-cobros` la ejerce a través de `profesionales_del_pendiente()` (ADM, PRO1, rol nulo); sigue sin módulo propio.
```

### R3.6 · Verificador, mutantes y qué revisar
- El verificador repite R2.8 (sin `npm run tipos`) y anota en `mutantes.json`: M18, el `refresh` de vuelta en el `catch` (caen la prueba de `refresh` y el paso 4.3); M19, el foco siempre en `pacienteId` (R3.3); M20, un `id` nuevo en cada envío (R3.1, y el paso 4.4 da `+ 2`); M21, cualquier `23505` como éxito y sin `select` (`acciones.test.ts`); M22, el foco al rango sin la marca de módulo (la prueba «sin clic»).
- Revisor B: que ningún camino del `catch` navegue; que el `id` se renueve tras un éxito y con datos distintos, y en ningún otro caso; que el paso 4 cuente `+ 1` y no se conforme con «visible»; el foco tras paginar en los dos sentidos.
- Revisor A: que el `23505` solo se dé por bueno con `cobros_pkey` y fila propia bajo RLS; que E12 lleve su gemela; que nada nuevo lea `perfiles`.

### Lo que no entra en la ronda 3
- B-H6 en Chromium: la siembra no llega a 51 filas en el pendiente. Se prueba en jsdom, con el caso de remontaje.

## Anexo · Ronda 4 (07-10-2026)

Cierra `revision.json` de la ronda 3 (0 ALTA, 2 MEDIA, 6 BAJA) sobre la rama `worktree-agent-a875b9deffe28f1da` (e7c356f). **Sin migraciones y sin cambios en `tipos-bd.ts` ni en el banco 30**: la clave primaria de `cobros` sigue siendo la única guarda de base (E12). Nada nuevo escribe en tablas económicas aparte del `insert` que ya existe. Todo cabe en el `territorio:` del contrato. En cada punto se dice qué parte de R3 sustituye.

### R4.0 · Hechos verificados
- `components/ui/dialogo.tsx:45`: `if (!abierto) return null`. Al cerrarse, el diálogo desmonta `FormularioCobro` y, con él, `claveRef` (`formulario-cobro.tsx:52`). Se cierra con Escape (`foco.ts:108`), con la «X» o con un `mousedown` fuera. `registrar-cobro.tsx:48` solo lo impide con un envío en vuelo.
- `RegistrarCobro` no se desmonta al cerrar el diálogo. Tampoco al cambiar `searchParams`: `layout-router.js:549` crea la clave de estado del segmento con `createRouterCacheKey(segmento, true)`, sin parámetros de búsqueda.
- `lib/i18n/es.ts:1383-1384`: el aviso nombra «Registrar cobro». Ese es también el texto del disparador de la página (`registrar-cobro.tsx:38`) y el del envío del formulario (`formulario-cobro.tsx:197`).
- `esquemas.ts`: la salida de Zod deja `importe` recortado pero sin normalizar. `referencia` y `motivo` vacíos salen `undefined`. `aCentimos` (`lib/dinero/importe.ts`) da 6000 para `'60'`, `'60,00'`, `'60.00'` y `' 60,00 € '`.
- `acciones.ts:100-116`: si la relectura falla tras el 23505 de `cobros_pkey`, se devuelve `fallo()`. Las guardas de los pasos 3 y 4 (paciente visible, `fusionado_en` y zona) se ejecutan antes de mirar si la clave ya entró.
- La siembra no inserta cobros. `bloques.tsx`: «Últimos cobros» pinta `EstadoVacio` («Todavía no hay cobros», sin `<li>`) o un `<ul>` de 20 filas como mucho (`datos.ts:227-229`, `order fecha desc, registrado_en desc`). La fila no enseña la referencia. `Cargando` no pinta `<li>`.
- `paginacion-pendientes.tsx:25-39`: una marca booleana de módulo que se enciende con cualquier clic. `bloques.tsx:116-170` ya entrega `pagina` acotada, y los enlaces van a `pagina - 1` y `pagina + 1`.
- `AvisoDeError` (`components/ui/piezas.tsx`) admite `accion?: ReactNode`.

### R4.1 · B-H1 (MEDIA): la clave pasa a `RegistrarCobro`, con huella normalizada; el diálogo se puede cerrar
**Elegida: la primera opción, sola.** Sustituye en R3.1 el `claveRef` del formulario, la huella `JSON.stringify(datos)` y el texto de `resultadoDesconocido`.

- `esquemas.ts`, función pura nueva:
  ```ts
  /** La huella de un envío (R4.1): lo que la base guardaría, en orden fijo y con el importe en céntimos. */
  export function huellaDeCobro(datos: DatosCobro): string {
    const centimos = aCentimos(datos.importe);
    return JSON.stringify([datos.pacienteId, centimos, datos.fecha, datos.formaPago,
      datos.referencia ?? null, centimos < 0 ? (datos.motivo ?? null) : null]);
  }
  ```
  El motivo solo cuenta en una devolución, igual que en el `insert` de la acción.
- `registrar-cobro.tsx`:
  - `const claves = useRef(new Map<string, string>())`.
  - `claveDeEnvio(huella)` devuelve el id guardado para esa huella. Si no hay ninguno, crea uno con `crypto.randomUUID()`, lo guarda y lo devuelve.
  - Una clave solo se olvida con un éxito: `alRegistrar(huella)` hace `claves.current.delete(huella)` antes de cerrar y avisar.
  - **Es un `Map`, no una sola clave**: si se envían A, B y otra vez A, todos con resultado desconocido, A recupera su id.
  - Ninguna otra respuesta olvida una clave: ni `fallo()`, ni un error de campo, ni `resultadoDesconocido`.
  - A `FormularioCobro` le pasa `claveDeEnvio` y `alRegistrar: (huella: string) => void`.
- `formulario-cobro.tsx`:
  - Se quita `claveRef`.
  - En `alSerValido`: `const huella = huellaDeCobro(datos); const id = claveDeEnvio(huella);`.
  - Con éxito, `alRegistrar(huella)`.
  - Las props `claveDeEnvio` y `alRegistrar(huella)` son obligatorias.
  - No cambia nada más: ni el `catch`, ni el foco, ni la región `aria-live`.
- `es.ts`, `cobros.resultadoDesconocido` = `'No sabemos si el cobro se ha registrado. Envíalo otra vez con los mismos datos, aquí o al volver a abrir esta ventana, sin salir de la página: si ya estaba registrado, no se duplica.'`. Conserva el principio que busca el spec y no nombra ningún botón.
- **Descartado: impedir el cierre mientras el resultado sea desconocido.** Un diálogo que no se cierra sin red atrapa al usuario (WCAG 2.1.2), y una recarga lo esquiva igual. Con la clave fuera del diálogo, cerrar ya no duplica.
- **Descartado: la clave en `sessionStorage`** para que sobreviva a una recarga. Dejaría el paciente y el importe en el almacenamiento del navegador.
- Pruebas:
  - `esquemas.test.ts`, `huellaDeCobro`:
    - `'60'`, `'60,00'`, `'60.00'` y `' 60,00 € '` dan la misma huella;
    - el mismo objeto con las claves en otro orden da la misma huella;
    - un importe positivo con motivo y sin motivo dan la misma huella;
    - una devolución con motivo `'a'` y con `'b'` dan huellas distintas;
    - cambiar `pacienteId`, `fecha`, `formaPago` o `referencia` (de `undefined` a `'TR-1'`) cambia la huella.
  - **Nuevo `registrar-cobro-clave.test.tsx`**, con `RegistrarCobro`, `FormularioCobro` y `Dialogo` reales y `./acciones` simulado. El disparador se guarda antes de abrir, y el envío se busca con `within(dialogo)`.
    - **«Cerrar y reabrir con los mismos datos, mismo id»**:
      1. Se envía con `'60,00'`, la acción rechaza y aparece `resultadoDesconocido`.
      2. Se cierra con la «X» y el diálogo desaparece.
      3. Se reabre con el disparador y se rellena con `'60'`, lo demás igual. Esta vez la acción contesta con éxito.
      4. Los dos `id` son iguales y UUID. El diálogo se cierra y el estado dice «Cobro registrado».
      5. Se reabre y se envía otra vez `'60,00'`: el `id` es distinto, porque tras un éxito la clave se olvida.
    - **«Tras `resultadoDesconocido` del servidor (A-H1), mismo id»**: la acción devuelve `{ mensaje: t('cobros.resultadoDesconocido') }`, se cierra con Escape, se reabre y el reenvío lleva el mismo `id`.
    - **«A, B, A»**: la acción rechaza siempre. `60,00` da idA, `61,00` da idB ≠ idA, y `60,00` otra vez da idA.
    - **Gemela**: tras un rechazo, se cierra y se reabre con otra Referencia, y el `id` es distinto.
    - `t('cobros.resultadoDesconocido')` no contiene `t('cobros.registrarCobro')`.
  - `formulario-cobro.test.tsx`:
    - `pintar` pasa `claveDeEnvio = vi.fn(() => ID_FIJO)`, y la prueba de B-H8 también.
    - El `describe('R3.1')` se sustituye por dos pruebas:
      - `claveDeEnvio` se llama con `huellaDeCobro` de los datos validados, y `registrarCobro` recibe `id: ID_FIJO`;
      - con éxito, `alRegistrar` recibe esa misma huella.
  - `registrar-cobro.test.tsx`: el doble del formulario llama a `alRegistrar('huella-de-pega')`. Sin prueba nueva.
  - El paso 4 del spec (R4.4) cierra y reabre el diálogo entre el corte y el reintento.

### R4.2 · A-H1 (BAJA): si falla la relectura, la respuesta es `resultadoDesconocido`. Corrige R3.1, paso 7
Donde R3.1 decía «sin fila o con error: `fallo()`», ahora se distinguen dos casos:
- **con error de relectura**: `console.error('registrarCobro: falló la relectura tras 23505', errorRelectura.code)` y se devuelve `{ ...ESTADO_INICIAL, mensaje: t('cobros.resultadoDesconocido') }`, sin `revalidatePath`. Un error de lectura no depende de quién sea el dueño del cobro, así que no abre oráculo;
- **sin fila y sin error**: `fallo()`, como ahora. Es la respuesta sin oráculo: el id es de otro o no se ve.

El cliente lo pinta como cualquier `mensaje` y no olvida la clave (R4.1).

Cambios en `acciones.test.ts`:
- «con error al releer» espera `resultadoDesconocido`. La relectura falla con `{ code: '57014' }`;
- el registro contiene `'57014'` y no contiene el importe;
- `revalidatePath` no se llama.

### R4.3 · A-H2 (BAJA): se arregla buscando la clave propia antes de las guardas
Es barato y queda dentro de `acciones.ts`.
- La relectura de R3.1 pasa a ser un ayudante local no exportado, `leerCobroPropio(supabase, id, usuarioId)`: `from('cobros').select('id').eq('id', id).eq('registrado_por', usuarioId).maybeSingle()`.
- **Paso 2b**, nuevo. Va después de validar `pacienteId` como UUID y antes de leer `pacientes`:
  - con fila propia: `revalidatePath('/facturacion')` y `cobroRegistrado`, sin leer el paciente, sin zona y sin `insert`;
  - con error: `console.error('registrarCobro: fallo al buscar la clave de envío', code)` y se sigue, porque la autoridad es la clave primaria;
  - sin fila: se sigue.
- El paso 7 (23505 → relectura) se queda, para el caso en que el primer envío aún esté en vuelo. Si ese reintento cae en una guarda transitoria, el cliente conserva la clave y el tercer envío la encuentra en 2b. Tampoco duplica.
- La sonda S1-S2 de la revisión no cambia: el `registrado_por` impide confirmar un id ajeno.
- Cambios en `acciones.test.ts`:
  - `crearSupabaseFalso` gana `previa = { data: null, error: null }`, y `maybeSingleCobros` pasa a `.mockResolvedValueOnce(previa).mockResolvedValue(existente)`.
  - «otra restricción» cambia `selectCobros not.toHaveBeenCalled` por `toHaveBeenCalledTimes(1)`: solo cuenta la consulta previa.
  - Nueva, **clave propia ya registrada y paciente fusionado** (`previa` con fila, `paciente` con `fusionado_en`):
    - devuelve `cobroRegistrado` y llama a `revalidatePath`;
    - no llama al `select` de `pacientes`, a `rpc` ni a `insertar`;
    - `eqCobros` recibe `('registrado_por', USUARIO)`.
  - Nueva, **la consulta previa falla** (`57014`): sí se inserta, la respuesta es `cobroRegistrado` y el registro lleva `57014`.
  - «Un `pacienteId` que no es UUID no consulta nada» se queda tal cual, porque 2b va después.

### R4.4 · B-H2 + B-H3 (MEDIA + BAJA): paso 4 del spec, independiente de la base
Firma: `async ({ page, context, browser })`.

En la cabecera del fichero, el párrafo del tope pasa a decir: «El paso 4 pasa con "Últimos cobros" vacío (recién sembrado) y con hasta 18 filas: la lista enseña 20 y el paso puede añadir dos. Con más, falla y pide resetear».

Pasos exactos:
1. `entrar(page)`. Después, `const sesion = await context.storageState()`.
2. Se preparan los localizadores y el recuento inicial:
   - `lista = recientes.getByRole('listitem')`, `vacia = recientes.getByText('Todavía no hay cobros')` y `filasDeLucia = lista.filter({ hasText: 'Lucía Márquez' }).filter({ hasText: '0,01' })`;
   - `await expect(lista.or(vacia).first()).toBeVisible()`;
   - `totalAntes = await lista.count()` y `expect(totalAntes, '… más de 18 cobros en «Últimos cobros»: resetea con db reset && npm run seed').toBeLessThanOrEqual(18)`;
   - `antes = await filasDeLucia.count()`.
3. Se rellena como ahora: Lucía, `'0,01'`, Efectivo y `REFERENCIA`.
4. La ruta del primer POST con `next-action`:
   - pone `cortado = true` **antes** de cualquier `await`;
   - hace `const r = await route.fetch()` y guarda `primera = { estado: r.status(), cuerpo: await r.text() }`;
   - después, `context.setOffline(true)` y `route.abort('internetdisconnected')`.
   - Se cuentan los `framenavigated` del marco principal.
5. Se pulsa enviar. Como en R3: el aviso aparece, `waitForTimeout(1500)`, cero navegaciones, el aviso sigue y el Importe vale `0,01`.
6. **B-H3.** `expect(primera?.estado, 'el primer envío no llegó a la acción (¿500 de Turbopack recompilando?)').toBe(200)` y `expect(primera?.cuerpo).toContain('Cobro registrado')`.
7. **Recuento antes del reintento, en un contexto con red:**
   - `otro = await browser.newContext({ storageState: sesion })` y `testigo = await otro.newPage()`;
   - `testigo.goto(new URL('/facturacion', page.url()).href)`, con URL absoluta para no depender del `baseURL` del contexto nuevo;
   - en su «Últimos cobros», las filas de Lucía con 0,01 son `toHaveCount(antes + 1)`, con el mensaje «el primer envío no insertó: el paso no prueba la deduplicación»;
   - todas las filas son `toHaveCount(totalAntes + 1)`;
   - `otro.close()`.
8. **B-H1 · cerrar y reabrir:**
   - con `Escape`, el diálogo se oculta y el foco vuelve al disparador;
   - `context.setOffline(false)` y `page.unroute('**/*')`;
   - se reabre con el disparador y se rellena igual, salvo el Importe, que va como **`'0.01'`** para probar la normalización de la huella;
   - se envía.
9. El diálogo se oculta, el foco está en el disparador y se ve «Cobro registrado». En `page`, que se actualiza por el `revalidatePath`, `filasDeLucia` es `toHaveCount(antes + 1)` y `lista` es `toHaveCount(totalAntes + 1)`, no `+ 2`.
10. El paso 4.5 de R3 («Por paciente» a 360 px) no cambia.

Título: `'4 · un corte de red tras insertar no recarga ni pierde lo escrito, y reenviar tras cerrar y reabrir no duplica el cobro'`.

Con el orden de la lista, el cobro nuevo (fecha de hoy y el `registrado_en` más reciente) entra arriba. Con un máximo de 18 filas, ni un `+ 1` ni un `+ 2` echan ninguna por abajo.

### R4.5 · Resto de BAJA: todas se arreglan

**A-H3** (`docs/state.md`). Se sustituyen la línea 11 y el punto 1 de «Siguiente paso» (línea 21) por el texto exacto de abajo. Prueba: `sed -n '11p;21p' docs/state.md` y `wc -l` ≤ 80.

**A-H4 + B-H5** (`page.tsx`, `es.ts`). En `SelectorSiAdministrador`, cuando `!resultado.ok`:
- con `profesionalFiltrado === null`, lo de ahora;
- con filtro, `AvisoDeError` con `mensaje={t('cobros.errorProfesionalesConFiltro')}` y `accion={<Link href="/facturacion" className="inline-flex min-h-11 items-center text-sm font-medium text-destructive underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t('cobros.verTodosLosProfesionales')}</Link>}`. Es el mismo par de color que el mensaje del aviso, sin token nuevo.

Textos nuevos en `es.ts`:
- `errorProfesionalesConFiltro: 'No se ha podido cargar la lista de profesionales. Las cifras de abajo son solo las del profesional del enlace.'`
- `verTodosLosProfesionales: 'Ver las cifras de todos los profesionales'`

Pruebas en `page.test.tsx`:
- la de A-H3, con filtro en el contexto: el texto con filtro, ningún combobox y el enlace con ese nombre y `href="/facturacion"`;
- gemela con `{ ...contextoDe('administrador'), profesionalFiltrado: null }`: `errorProfesionales` y ningún enlace.

**B-H4** (`paginacion-pendientes.tsx`). `let destino: number | null = null` sustituye a `seguirFoco`.
- Cada enlace llama a `alHacerClic(pagina - 1)` o `alHacerClic(pagina + 1)` en su `onClick`. Si `evento.button !== 0` o el clic lleva `metaKey`, `ctrlKey`, `shiftKey` o `altKey`, no se marca nada. En otro caso, `destino = paginaDestino`.
- El efecto sobre `[pagina]` sale si `destino === null`. Si no, hace `const esperado = destino; destino = null;` y solo enfoca si `esperado === pagina`.

Pruebas nuevas:
- `it.each(['ctrlKey','metaKey','shiftKey','altKey'])`: se pinta la 2, clic modificado en «Siguientes» y `rerender` de la **3** → el foco no se mueve;
- «Navegación sustituida»: se pinta la 2, clic normal en «Siguientes» y `rerender` de la 1 → el foco no se mueve. Después, `rerender` de la 3 → tampoco.

Las seis pruebas actuales se quedan.

Texto exacto de `docs/state.md` (A-H3). La línea 11:
```
- **En curso**: T-023 **ronda 4 implementada** el 07-10 sobre la ronda 3 (clave de envío por huella guardada en `RegistrarCobro`, clave propia antes de las guardas, `resultadoDesconocido` si falla la relectura, paso 4 del spec sin depender de la base, foco de paginación por página de destino, aviso del filtro de profesional); falta verificación y revisión de la ronda 4. Los mutantes M18 en adelante son de TypeScript y del spec (`tickets/T-023/mutantes.json`, `ts_ronda_3` y `ts_ronda_4`); el banco 30 llega hasta M17. T-050 revisado (ronda 1, 6acbd3f), sin integrar.
```
La línea 21:
```
1. **T-023 ronda 4: verificador y dos revisores** sobre una copia `git archive <HEAD de la rama>`. Antes, `npx supabase db reset` y `npm run seed`: el paso 4 de `accesibilidad/facturacion.spec.ts` pasa con «Últimos cobros» vacío y con hasta 18 filas, y cada ejecución deja un cobro de 0,01 EUR a Lucía Márquez con referencia `T-023 spec <ts>` (no se borra). Después, la cola: T-026a → T-046 → T-023b → T-047.
```

### R4.6 · Verificador y mutantes nuevos (`mutantes.json` → `ts_ronda_4`)
El verificador repite R2.8 y añade dos comprobaciones:
- el spec dos veces seguidas, justo después de `db reset && npm run seed`: la primera con la lista vacía y la segunda con una fila, las dos en verde;
- `grep -n claveRef "app/(app)/facturacion/formulario-cobro.tsx"` sale vacío.

| Id | Mutación | Debe caer |
|---|---|---|
| M23 | La clave vuelve a un `useRef` de `FormularioCobro`, como en R3 | `registrar-cobro-clave.test.tsx` · cerrar y reabrir, mismo id. Spec, paso 9 (`+ 2`) |
| M24 | `huellaDeCobro` = `JSON.stringify(datos)`, sin normalizar | `esquemas.test.ts` · `'60'` y `'60,00'`. Cerrar y reabrir (`'60'`). Spec, paso 9 (`'0.01'`) |
| M25 | Una sola clave en lugar del `Map` | «A, B, A» |
| M26 | La clave se olvida con cualquier respuesta del servidor, no solo con un éxito | «Tras `resultadoDesconocido` del servidor, mismo id» |
| M27 | Relectura fallida tras 23505 → `fallo()` (lo de R3) | `acciones.test.ts` · 23505 con error al releer → `resultadoDesconocido` |
| M28 | Sin el paso 2b | `acciones.test.ts` · clave propia ya registrada y paciente fusionado |
| M29 | Paso 2b sin `.eq('registrado_por', …)` | La misma prueba, por `eqCobros` con `('registrado_por', USUARIO)`: ahí no hay 23505 ni relectura que lo llame |
| M30 | El `onClick` de la paginación no mira los modificadores | `paginacion-pendientes.test.tsx` · `it.each` de modificadores (`rerender` de la 3) |
| M31 | Una marca booleana en lugar de la página de destino | «Navegación sustituida» (`rerender` de la 1) |
| M32 | Sin el enlace «Ver las cifras de todos los profesionales» | `page.test.tsx` · A-H3 con filtro |
| M33 | En el spec, la ruta aborta sin `route.fetch()` y finge `primera = { estado: 200, cuerpo: 'Cobro registrado' }` | Spec, paso 7: «el primer envío no insertó» |
| M34 | `resultadoDesconocido` con el texto de R3 | La prueba de que no contiene «Registrar cobro» |

### R4.7 · Qué revisar en la ronda 4
**Revisor B (cliente y spec):**
- Las claves:
  - solo un éxito olvida una clave (`alRegistrar(huella)`); ninguna otra respuesta del servidor ni ningún cierre lo hace;
  - `huellaDeCobro` ignora el motivo en un importe positivo y lo cuenta en una devolución, igual que el `insert`;
  - el formulario no llama a `claveDeEnvio` durante el render;
  - el aviso no nombra ningún botón.
- El spec:
  - el paso 2 espera `lista.or(vacia)` y pone el tope sobre todas las filas;
  - el recuento del paso 7 se hace en otro contexto, con red y antes de reabrir;
  - el paso 8 cierra el diálogo de verdad y escribe `'0.01'`;
  - nada depende ya de filas de ejecuciones anteriores.
- La paginación: un clic modificado no enciende la marca, y un destino que no llega se apaga sin enfocar.
- El enlace del aviso mide 44 px y usa el mismo par de color que el mensaje.

**Revisor A (acción y constitución):**
- El paso 2b filtra por `registrado_por`, va después del UUID del paciente y no corta el flujo si da error.
- Un 23505 de otra restricción no relee.
- Una relectura fallida no llama a `revalidatePath` ni lleva importe ni paciente al registro.
- No hay oráculo nuevo: con un id ajeno, 2b no ve nada y el 23505 sigue en `fallo()`.
- No hay `UPDATE`, `DELETE` ni `upsert`, y la migración no cambia.

### Lo que no entra en la ronda 4
- Que la clave sobreviva a una recarga o a salir de la página: habría que guardar el paciente y el importe en el navegador. El aviso lo dice.

---

## Anexo · Ronda 5 (07-10-2026)

Cierra `revision.json` de la ronda 4 (0 ALTA, 0 MEDIA, 4 BAJA) sobre la rama `worktree-agent-af4665097e6d61770` (afcc774). **No hay migraciones ni cambios en `tipos-bd.ts` ni en el banco 30.** La acción no escribe nada nuevo: solo cambia el texto de dos respuestas que ya existían. Todo cabe en el `territorio:` de §6 y R2.10. Lo que no se nombra aquí no cambia respecto de R4.

### R5.0 · Hechos verificados (afcc774)
- `acciones.ts:61-64` (paso 2b) y `:131-134` (relectura propia tras el 23505) devuelven `cobros.cobroRegistrado`, el mismo texto que un alta nueva (`:142-143`).
- `formulario-cobro.tsx:100`: el éxito es `!estado.errores && estado.mensaje === t('cobros.cobroRegistrado')`. Cualquier otro mensaje se pinta en la región `aria-live` del formulario y no olvida la clave.
- `registrar-cobro.tsx:69-73`: `alRegistrar(huella)` hace `claves.current.delete(huella)`, cierra el diálogo y fija el aviso a `cobroRegistrado`, sin mirar qué contestó la acción.
- `page.tsx:25`: si falla `cargarPacientesParaCobro`, `AccionRegistrar` devuelve `<AvisoDeError>` **en lugar de** `<RegistrarCobro>`. En ese punto del árbol cambia el tipo del elemento, así que React desmonta la isla y su `useRef`.
- `page.test.tsx:141-151` exige justo eso («el aviso de error y ningún botón de registrar»), y `page.test.tsx:153-166` comprueba que `RegistrarCobro` recibe exactamente `{ pacientes, hoy }`.
- `registrar-cobro.test.tsx`: el formulario es un doble que llama a `alRegistrar('huella-de-pega')`, y las cinco pruebas pintan `pacientes={[]}`.
- `registrar-cobro-clave.test.tsx`: ninguna prueba combina un éxito de otra huella con un reenvío. Así lo midió B: el mutante `clear()` deja 207 pruebas en verde.
- `accesibilidad/facturacion.spec.ts:222` espera `getByRole('status').filter({ hasText: 'Cobro registrado' })` después del reintento. Ese reintento entra por el paso 2b. Y `:187` espera `'Cobro registrado'` en el cuerpo del **primer** envío, que es un alta nueva.
- `docs/state.md` (rama) tiene 60 líneas. §«Hallazgos anotados» agrupa lo de T-023 en el primer punto (líneas 26-30).

### R5.1 · A-H1 + B-H1: «ya estaba registrado» es un resultado propio, y el cliente lo trata como éxito y olvida la clave

**Catálogo** (`lib/i18n/es.ts`, sección `cobros`, justo después de `cobroRegistrado`):
```ts
cobroYaRegistrado: 'Este cobro ya estaba registrado; no se ha añadido otro. Si es un cobro nuevo con los mismos datos, regístralo otra vez.',
```
En minúsculas, el texto no contiene «cobro registrado». Por eso se distingue también con el `hasText` del spec, que no distingue mayúsculas y busca subcadenas. Tampoco nombra ningún botón.

**`acciones.ts`**: solo cambian dos líneas.
- En el paso 2b (`:63`) y en la relectura con fila propia (`:133`): `return { ...ESTADO_INICIAL, mensaje: t('cobros.cobroYaRegistrado') };`. Las dos conservan el `revalidatePath('/facturacion')` de la línea anterior.
- El alta nueva (`:143`) sigue con `cobroRegistrado`.
- No cambia ninguna otra rama: `errorPrevia` sigue adelante, la relectura sin fila da `fallo()` y la relectura con error da `resultadoDesconocido`.

**`formulario-cobro.tsx`**:
- Constante de módulo, junto a `OPCIONES_FORMA`:
  ```ts
  /** Las dos respuestas que confirman que el cobro existe (R5.1): las dos cierran y olvidan la clave. */
  const MENSAJES_DE_EXITO = [t('cobros.cobroRegistrado'), t('cobros.cobroYaRegistrado')];
  ```
- La línea 100 pasa a ser `if (!estado.errores && estado.mensaje !== undefined && MENSAJES_DE_EXITO.includes(estado.mensaje)) { alRegistrar(huella, estado.mensaje); return; }`.
- La prop pasa a ser `alRegistrar: (huella: string, aviso: string) => void`, con el JSDoc «Se llama cuando la acción confirma que el cobro existe, con la huella del envío y el texto que hay que anunciar».

**`registrar-cobro.tsx`**: `alRegistrar={(huella, avisoDeExito) => { claves.current.delete(huella); setAbierto(false); setAviso(avisoDeExito); }}`. El aviso visible (`role="status"`) dice cuál de los dos casos ha sido.

**Se cierra el diálogo y no se deja abierto.** El caso frecuente es el reintento tras un resultado desconocido, y ahí el usuario ha terminado. Un segundo cobro idéntico el mismo día es raro: le basta reabrir y volver a escribirlo, como le pide el aviso.

**No caduca la clave. Basta con el mensaje propio.** Motivos:
1. El daño de A-H1 era el silencio. Con el texto propio, el usuario ve que no se añadió nada y la clave ya está olvidada: un segundo envío entra con un id nuevo. Lo que queda es un clic más con aviso explícito, no un cobro perdido.
2. Una caducidad por tiempo vuelve a abrir el duplicado que la clave impide, precisamente en el caso para el que existe: el reintento tardío después de un corte largo. Además, obligaría a usar relojes falsos en las pruebas.
3. Caducar «al verse en la lista» exigiría mandar a la isla los ids de «Últimos cobros». Esa lista enseña 20 filas como mucho, recortadas por el filtro de profesional, así que la caducidad no alcanzaría las demás.
4. El tamaño del `Map` es despreciable (B, ronda 4). Que dure más por Activity ya no hace daño: lo único que puede pasar es que salga este aviso.

**Oráculo.** No hay ninguno nuevo. `cobroYaRegistrado` solo sale con una fila **propia** (`registrado_por = usuario.id`), y la sesión ya conoce sus propios ids. Con un id ajeno, la respuesta sigue siendo `fallo()`.

**Pruebas**
- `acciones.test.ts`:
  - «un 23505 de cobros_pkey con el cobro propio ya registrado…» espera `{ mensaje: t('cobros.cobroYaRegistrado') }` y añade `expect(supabase.insertar).toHaveBeenCalledTimes(1)`. Así se prueba la relectura y no el 2b, porque `previa` vale `null` por defecto. El título pasa a terminar en «…es "ya estaba registrado", sin duplicar».
  - «clave propia ya registrada y paciente fusionado» espera `{ mensaje: t('cobros.cobroYaRegistrado') }`.
  - «la consulta previa falla (57014)» **sigue** esperando `cobroRegistrado`: es la gemela, porque inserta.
  - Las demás que esperan `cobroRegistrado` son altas nuevas y no cambian.
- `formulario-cobro.test.tsx`:
  - En la línea 149, `toHaveBeenCalledWith(claveDeEnvio.mock.calls[0][0], t('cobros.cobroRegistrado'))`.
  - Prueba nueva, **«con "ya estaba registrado", alRegistrar recibe la huella y ese texto, y no se pinta como error»**: la acción resuelve `{ mensaje: t('cobros.cobroYaRegistrado') }`. `alRegistrar` se llama una vez, con `(huella, t('cobros.cobroYaRegistrado'))`, y la región `aria-live` del formulario está vacía.
- `registrar-cobro.test.tsx`: el doble llama a `alRegistrar('huella-de-pega', t('cobros.cobroRegistrado'))`. Sin pruebas nuevas por R5.1.
- `registrar-cobro-clave.test.tsx`:
  - Prueba nueva, **«"ya estaba registrado" cierra, lo anuncia y olvida la clave»**:
    1. `pintar()`. La primera llamada rechaza (`new Error('red')`): se abre, se rellena `'60,00'`, se envía y sale `resultadoDesconocido`.
    2. La segunda resuelve `{ mensaje: t('cobros.cobroYaRegistrado') }`: se envía otra vez en el mismo diálogo.
    3. `idDe(1)` es igual a `idDe(0)`. El diálogo desaparece, y `screen.getByRole('status').textContent` es **exactamente** `t('cobros.cobroYaRegistrado')`.
    4. La tercera resuelve `cobroRegistrado`: se reabre, se rellena `'60,00'` y se envía. `idDe(2)` es distinto de `idDe(0)`.
  - Junto a la prueba de M34: `expect(t('cobros.cobroYaRegistrado').toLowerCase()).not.toContain(t('cobros.cobroRegistrado').toLowerCase())` y `expect(t('cobros.cobroYaRegistrado')).not.toContain(t('cobros.registrarCobro'))`.
- **Spec, paso 9** (`facturacion.spec.ts:222`): se sustituye por `await expect(page.getByRole('status')).toHaveText('Este cobro ya estaba registrado; no se ha añadido otro. Si es un cobro nuevo con los mismos datos, regístralo otra vez.')`. El paso 6 (`:187`, el cuerpo del primer envío contiene `'Cobro registrado'`) no cambia. En `:186-187`, el mensaje de error del paso 6 tampoco cambia.

### R5.2 · B-H2: `RegistrarCobro` se monta siempre y pinta él el aviso de pacientes

**`page.tsx`, `AccionRegistrar`**: se quita el `if` de la línea 25. Queda una sola salida:
```tsx
// La isla se monta siempre, también sin lista de pacientes: su `Map` de claves de envío no puede
// perderse con un fallo pasajero en un render posterior (R5.2).
return <RegistrarCobro pacientes={pacientes.ok ? pacientes.pacientes : null} hoy={hoy} />;
```

**`registrar-cobro.tsx`**:
- `Props.pacientes` pasa a ser `{ id: string; nombre: string; apellidos: string }[] | null`, con el JSDoc «`null`: no se pudo cargar la lista. No se ofrece registrar a ciegas».
- Los hooks no cambian y van primero.
- Hay un solo `return`, con tres piezas en este orden:
  1. `{pacientes === null ? <AvisoDeError mensaje={t('cobros.errorPacientes')} /> : <Button …>…</Button>}`, con el import de `AvisoDeError` desde `@/components/ui/piezas`;
  2. el `<p role="status">`, **siempre montado**, como ahora (B-H8);
  3. `{pacientes !== null && <Dialogo …>…</Dialogo>}`.
- **No** se resetea `abierto` cuando `pacientes` es `null`. Solo la acción puede repintar la página con el diálogo abierto, por medio de `revalidatePath`. Y la acción solo revalida con `cobroRegistrado` o con `cobroYaRegistrado`, que cierran el diálogo en la misma transición. No hay ningún camino real que lo deje abierto, así que no se escribe una guarda sin prueba.
- **Descartado: un `Map` a nivel de módulo.** Sobreviviría a todo, también a un cambio de sesión sin recarga en la misma pestaña. Además, filtraría estado entre pruebas.
- **Descartado: subir el `Map` a un proveedor en el `layout`.** Toca ficheros fuera de territorio y no hace falta.

**Pruebas**
- `page.test.tsx`: la prueba «si no se pueden cargar los pacientes, el aviso de error y ningún botón de registrar» se **sustituye** por **«si no se pueden cargar los pacientes, la isla se monta igual, con pacientes null»**. Usa `cargarPacientesParaCobro.mockResolvedValue({ ok: false })`, y el resultado de `AccionRegistrar` cumple `isValidElement(r) && r.type === RegistrarCobro`, con `r.props` igual a `{ pacientes: null, hoy: '2026-10-06' }`.
- `registrar-cobro.test.tsx`: prueba nueva, **«con pacientes null: el aviso de pacientes, ningún disparador, ningún diálogo y la región de estado montada»**. Se pinta `pacientes={null}` y se comprueba:
  - `getByText(t('cobros.errorPacientes'))`;
  - `queryByRole('button', { name: t('cobros.registrarCobro') })` es `null`;
  - `queryByRole('dialog')` es `null`;
  - `getByRole('status')` existe.
- `registrar-cobro-clave.test.tsx`: `pintar()` devuelve `{ disparador, rerender }`, y las pruebas actuales desestructuran `disparador`. Prueba nueva, **«B-H2: la lista de pacientes falla en un render posterior y vuelve; el reenvío lleva el mismo id»**:
  1. La acción rechaza siempre. Se abre, se rellena `'60,00'`, se envía, sale `resultadoDesconocido` y se cierra con la «X».
  2. `rerender(<RegistrarCobro pacientes={null} hoy={HOY} />)`: aparece `t('cobros.errorPacientes')` y no hay ningún botón «Registrar cobro».
  3. `rerender(<RegistrarCobro pacientes={PACIENTES} hoy={HOY} />)`. El disparador **se vuelve a buscar**, porque es otro nodo. Se abre, se rellena `'60,00'` y se envía.
  4. `idDe(1)` es igual a `idDe(0)`.

### R5.3 · B-H3: «A desconocido, B con éxito, A otra vez → idA»
Prueba nueva en `registrar-cobro-clave.test.tsx`, **«solo se olvida la clave del envío que sale bien: A desconocido, B con éxito, A otra vez lleva idA»**:
1. `registrarCobro.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce({ mensaje: t('cobros.cobroRegistrado') }).mockRejectedValueOnce(new Error('red'))`.
2. Se abre, se rellena `'60,00'`, se envía y sale `resultadoDesconocido`.
3. En el mismo diálogo, el Importe pasa a `'40,00'` y se envía. Se espera a que el diálogo desaparezca y el estado diga `cobroRegistrado`.
4. Se reabre, se rellena `'60,00'` y se envía. Se espera la tercera llamada.
5. `idDe(1)` es distinto de `idDe(0)`, e `idDe(2)` es igual a `idDe(0)`.

Esta prueba mata `claves.current.clear()` dentro de `alRegistrar` (M42).

### R5.4 · A-H2: riesgo aceptado, sin diseño
Al implementador solo le toca anotarlo en `docs/state.md` §«Hallazgos anotados», como **último subpunto** del grupo «**T-023, fuera de alcance (R2.7 y ronda 3)**». En la misma línea, el título del grupo pasa a ser «**T-023, fuera de alcance (R2.7, ronda 3 y ronda 4)**». El subpunto, con este texto exacto:
```
  - **A-H2 de la ronda 4, riesgo aceptado**: si entre un envío con resultado desconocido y su reintento el usuario deja de ver al paciente (traspaso de `profesional_id`, cambio de centro del paciente o de los `centros_actuales` del técnico), el paso 2b no encuentra su propio cobro (`cobros_lectura` no tiene rama por `registrado_por`) y el reintento contesta «No se ha podido registrar el cobro» aunque el cobro exista; si otro lo registra de nuevo, queda duplicado y no se puede borrar. No se amplía `cobros_lectura` (daría datos económicos a quien ya no atiende al paciente). Exige un corte de red y un traspaso dentro de la vida de la página.
```
Las líneas 11 y 21 de `state.md` se sustituyen por estas:
```
- **En curso**: T-023 **ronda 5 implementada** el 07-10 sobre la ronda 4 («ya estaba registrado» como resultado propio que cierra y olvida la clave, `RegistrarCobro` montado siempre aunque falle la lista de pacientes, prueba de que un éxito solo olvida su clave); falta verificación y revisión de la ronda 5. Los mutantes M18 en adelante son de TypeScript y del spec (`tickets/T-023/mutantes.json`, `ts_ronda_3` a `ts_ronda_5`); el banco 30 llega hasta M17. T-050 revisado (ronda 1, 6acbd3f), sin integrar.
```
```
1. **T-023 ronda 5: verificador y dos revisores** sobre una copia `git archive <HEAD de la rama>`. Antes, `npx supabase db reset` y `npm run seed`: el paso 4 de `accesibilidad/facturacion.spec.ts` pasa con «Últimos cobros» vacío y con hasta 18 filas, y cada ejecución deja un cobro de 0,01 EUR a Lucía Márquez con referencia `T-023 spec <ts>` (no se borra). Después, la cola: T-026a → T-046 → T-023b → T-047.
```
Para comprobarlo: `sed -n '11p;21p' docs/state.md`, `grep -c "A-H2 de la ronda 4" docs/state.md` = 1 y `wc -l docs/state.md` ≤ 80.

### R5.5 · Verificador y mutantes nuevos (`mutantes.json` → `ts_ronda_5`)
El verificador repite lo de R4.6, con el spec dos veces seguidas justo después de `db reset && npm run seed`, y añade dos comprobaciones:
- `grep -n "cobroYaRegistrado" "app/(app)/facturacion/acciones.ts"` da exactamente 2 líneas;
- `grep -n "AvisoDeError" "app/(app)/facturacion/page.tsx"` ya no aparece dentro de `AccionRegistrar`: solo en `SelectorSiAdministrador`.

| Id | Mutación | Debe caer |
|---|---|---|
| M35 | El paso 2b devuelve `cobroRegistrado`, como en R4 | `acciones.test.ts` · clave propia ya registrada y paciente fusionado. Spec, paso 9 |
| M36 | La relectura propia tras el 23505 devuelve `cobroRegistrado` | `acciones.test.ts` · 23505 de `cobros_pkey` con el cobro propio ya registrado |
| M37 | El formulario solo da por éxito `cobroRegistrado` | `formulario-cobro.test.tsx` · «ya estaba registrado: alRegistrar recibe…». `registrar-cobro-clave.test.tsx` · «"ya estaba registrado" cierra…». Spec, paso 9 |
| M38 | `alRegistrar` ignora el aviso y pinta siempre `cobroRegistrado` | `registrar-cobro-clave.test.tsx` · «"ya estaba registrado" cierra…»: el estado no coincide exactamente. Spec, paso 9 |
| M39 | Con `cobroYaRegistrado` se cierra pero no se borra la clave (el `delete` solo se hace si el aviso es `cobroRegistrado`) | `registrar-cobro-clave.test.tsx` · «"ya estaba registrado" cierra…»: el tercer id sale igual que el primero |
| M40 | `AccionRegistrar` vuelve a devolver `<AvisoDeError>` si fallan los pacientes | `page.test.tsx` · «la isla se monta igual, con pacientes null» |
| M41 | `RegistrarCobro` delega en un hijo que solo se monta con pacientes (el `Map` vive en el hijo) | `registrar-cobro-clave.test.tsx` · «B-H2: la lista de pacientes falla… mismo id» |
| M42 | `alRegistrar` hace `claves.current.clear()` en lugar de `delete(huella)` | `registrar-cobro-clave.test.tsx` · «A desconocido, B con éxito, A otra vez lleva idA» |
| M43 | Con `pacientes === null`, la isla sigue pintando el disparador y el diálogo, con la lista vacía | `registrar-cobro.test.tsx` · «con pacientes null: …ningún disparador…» |
| M44 | `cobroYaRegistrado` = `'Cobro registrado (ya estaba)'` | `registrar-cobro-clave.test.tsx` · la prueba de catálogo en minúsculas |

### R5.6 · Qué revisar en la ronda 5
**Revisor A (acción y constitución):**
- `cobroYaRegistrado` sale **solo** de una fila propia: en el paso 2b con `previa && !errorPrevia`, y en la relectura con `propio`. Nunca sale de `errorPrevia`, de una relectura con error ni de una relectura sin fila.
- Las dos salidas «ya estaba» llaman a `revalidatePath('/facturacion')` y no insertan. El alta nueva sigue devolviendo `cobroRegistrado`.
- No hay un oráculo nuevo: con un id ajeno, la respuesta es la de R4 (`fallo()`).
- El texto de `state.md` de A-H2 está letra por letra, en su grupo, y `wc -l` ≤ 80.
- Sin `UPDATE`, `DELETE`, `upsert` ni migraciones. `supabase/`, `lib/supabase/` y `scripts/` no cambian.

**Revisor B (cliente, accesibilidad y spec):**
- `MENSAJES_DE_EXITO` tiene exactamente los dos textos. Un mensaje fuera de la lista (`fallo()` o `resultadoDesconocido`) no cierra el diálogo ni olvida la clave.
- `alRegistrar` borra **solo** su huella y anuncia el texto que recibe. El `role="status"` dice cuál de los dos casos ha sido, y con «ya estaba» no dice «Cobro registrado».
- `RegistrarCobro` mantiene los hooks antes de cualquier rama. Con `pacientes === null` no hay disparador ni `Dialogo`, pero sí `AvisoDeError` (que es `role="alert"`) y el `role="status"` montado. `page.tsx` monta la isla en los dos casos y nada en el árbol cambia su tipo ni su `key` entre renders.
- Las pruebas nuevas comprueban ids (`idDe`), no solo el número de llamadas. La de B-H2 vuelve a buscar el disparador después del `rerender`.
- Paso 9 del spec: `toHaveText` con el texto entero. El paso 6 sigue esperando `'Cobro registrado'` en el primer envío.
- El texto del catálogo no nombra ningún botón y no contiene «cobro registrado» en minúsculas.

### Lo que no entra en la ronda 5
- **La caducidad de la clave.** Está descartada en R5.1, con sus motivos.
- **A-H2 (visibilidad perdida entre el envío y el reintento).** Es un riesgo aceptado (R5.4). Ampliar la RLS es peor que el riesgo.
- **El residuo de B-H4 (recorte de página) y los efectos de Activity sobre la paginación.** Son notas de B, sin un camino real.
- **Cambiar `resultadoDesconocido` porque Activity conserva el `Map` al salir.** El texto se queda corto pero no causa daño, y M34 y el spec lo fijan.
- **Un límite de error (`error.tsx`) que desmonte el segmento si `cargarContexto` lanza.** Eso es un fallo de la página entera, no un fallo pasajero de la lista, y cae fuera del territorio.
