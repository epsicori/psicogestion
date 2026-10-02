# T-015 · Diseño — avisos de sesión en curso, notificaciones y escalado de la nota pendiente

Arquitecto, 02-10-2026. Contrato: `tickets/T-015-avisos-sesion-y-escalado.md`. Riesgo medio
(`modelo: sonnet`) con revisión de Opus, porque toca políticas.

## Orden de lectura para el implementador

1. Este diseño, entero.
2. `supabase/migrations/20260830090000_cuentas_invitacion_baja_totp.sql:39-175`. Es la tabla
   `notificaciones` real, con su disparador y sus permisos.
3. `supabase/migrations/20260906120000_agenda_esquema.sql:440-500` (`fn_alertar_nota_sin_firmar`)
   y `supabase/migrations/20261002120000_nota_clinica_borrador_firma.sql:85-128`
   (`fn_resolver_alerta_nota_sin_firmar`).
4. `supabase/migrations/20260829120000_perfiles_centros_multicentro.sql:303-317`, la política
   de lectura vigente de `alertas_documentacion`.
5. `lib/citas/agenda.ts:209-253`, `app/(app)/agenda/bloques.ts:86-165` y
   `app/(app)/agenda/documentacion.tsx`.
6. `components/armazon/armazon.tsx`, `components/armazon/armazon-cliente.tsx`,
   `components/ui/emergente.tsx` y `app/(app)/acciones.ts` (el patrón de la cookie).
7. `scripts/rls/README.md`, y como molde de bloque `scripts/rls/13-cuentas.sql:228-270` y la
   alerta de `scripts/rls/15-agenda.sql`.
8. En `node_modules/next/dist/docs/`: `cookies.md`, `revalidatePath.md` y `connection.md`.

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | **`notificaciones` existe.** El contrato dice que no; se equivoca. Columnas: `id`, `perfil_id` (FK a perfiles, cascade), `tipo text` (no vacío; «no es un enum a propósito»), `detalle text` (no vacío), `creado_en`, `leida_en`. Índice `notificaciones_perfil_no_leidas_idx (perfil_id, creado_en desc) where leida_en is null`. | `20260830090000_cuentas_invitacion_baja_totp.sql:39-107` |
| H2 | Así se traducen las columnas del contrato a las reales: `destinatario_id` es `perfil_id`, `creada_en` es `creado_en` y `cuerpo` es `detalle`. Faltan `titulo`, `origen_tabla` y `origen_id`. | ídem |
| H3 | `fn_proteger_notificacion()` (definer, BEFORE UPDATE): lanza 42501 si cambia `perfil_id`, `tipo`, `detalle` o `creado_en`. **No** congela `id`. **No** impide devolver `leida_en` a null ni reescribirlo. | ídem |
| H4 | Políticas `notificaciones_lectura_propia` (select) y `notificaciones_marcar_leida_propia` (update): `perfil_id = (select auth.uid())`. **Sin** `rol_actual() is not null`, que sí llevan todas las demás tablas. | ídem; `scripts/rls/11-cobertura.sql:39` |
| H5 | Permisos: revoke all a public, anon y service_role; `select, update` a authenticated; truncate, trigger y references revocados. **Nadie tiene `insert`**: solo insertan las funciones definer. | ídem, `:100-107` y `:160` |
| H6 | `notificaciones` **no tiene disparador de auditoría**. El bucle de T-004 se ejecutó antes de que la tabla existiera. | ídem, `:174` (solo `codigos_recuperacion_totp`) |
| H7 | Hay tres sitios que ya insertan `(perfil_id, tipo, detalle)`: `registrar_reposicion_totp` (`totp_repuesto`), `canjear_codigo_recuperacion` (`totp_repuesto`) y `desbloquear_historia` (`pin_bloqueado`). T-038 añadirá dos más, `codigos_regenerados` y `regeneracion_codigos_bloqueada`. | ídem `:520`, `:702`, `:792`; `tickets/T-038/diseno.md` |
| H8 | T-038 lee `select('id, tipo, detalle, creado_en, leida_en')` filtrando por sus cuatro tipos, y «no marca como leído (T-015)». | `tickets/T-038/diseno.md:355-367` |
| H9 | `alertas_documentacion` tiene `id`, `paciente_id`, `profesional_id`, `centro_id`, `tipo` (enum: `nota_sin_firmar`, `borrador_abandonado`, `consentimiento_pendiente`, `informe_pendiente`, `evaluacion_sin_corregir`), `origen_tabla` (con check, que incluye `citas`), `origen_id`, `fecha_referencia date`, `estado` (`abierta` o `resuelta`), `resuelta_en` y `creada_en`. Tiene un índice único parcial `(origen_tabla, origen_id, tipo) where estado='abierta'`. La audita el bucle genérico de T-004. | `20260822094547_…:95-101`, `:863-885`; `20260906120000_agenda_esquema.sql:446-451` |
| H10 | Su lectura vigente: admin; **o** `profesional_id = uid`; **o** asignado; **o** técnico de un centro suyo, **sin filtro de tipo**. Ese último punto es la fuga anotada en `state.md` («T-014 → T-015»). | `20260829120000_perfiles_centros_multicentro.sql:303-317` |
| H11 | `alertas_documentacion_modificacion` (update) admite admin, `profesional_id = uid` o asignado, sin restricción de columnas. Con ella se puede cerrar una `nota_sin_firmar` sin firmar, mover `profesional_id` o cambiar `tipo`. `alertas_documentacion_alta` (insert) admite lo mismo. | `20260822160000_rls_funciones_y_politicas.sql:1328`; `20260906120000_agenda_esquema.sql:822` |
| H12 | `fn_alertar_nota_sin_firmar` (definer, AFTER UPDATE OF estado ON citas) solo abre la alerta si la cita pasa a `realizada` con `fin <= now()` y no tiene ninguna versión de nota. Inserta con `fecha_referencia = (new.fin at time zone 'UTC')::date` y `on conflict do nothing`. | `20260906120000_agenda_esquema.sql:453-499` |
| H13 | `fn_resolver_alerta_nota_sin_firmar` (definer, AFTER INSERT en `notas_clinicas_versiones`) es lo **único** que cierra una `nota_sin_firmar`. Corre como propietario. | `20261002120000_nota_clinica_borrador_firma.sql:85-128` |
| H14 | `agenda_citas_rango(desde, hasta)` es invoker y admite como máximo 62 días. Devuelve `en_curso` y `nota_pendiente`. **T-039 la recrea**, igual que `citas_agenda`. | `20260926120000_agenda_citas_rango.sql`; `tickets/T-039-…md` |
| H15 | `estaEnCurso(cita, ahora)` es una función pura en TypeScript, gemela de `cita_en_curso()` (ADR-045). | `lib/agenda/estados-cita.ts:75` |
| H16 | `leerCitasRango(sesion, desde, hasta)` devuelve `FilaAgenda[]` (con `pacienteId`, `profesionalId`, `inicio`, `fin`, `estado`, nombre, `enCurso` y `notaPendiente`). `leerAlertasNotaPendiente(sesion, {soloPropias, tipos})` lee alertas abiertas, ordenadas por `fecha_referencia` y `creada_en`. | `lib/citas/agenda.ts`, `:209-253` |
| H17 | `nivelDeAntiguedad(dias)` devuelve `'mas24' \| 'mas72' \| null` contando días de calendario, y un comentario dice «No es el escalado real (eso es T-015)». `criterioDocumentacion(rol)`: el admin ve solo lo propio, y el técnico solo los tipos de `VISIBLE_AL_TECNICO`. | `app/(app)/agenda/bloques.ts:86-165` |
| H18 | La ficha del paciente lee las alertas sin filtrar por rol ni por tipo: `select id, tipo, fecha_referencia, creada_en … where paciente_id = :id and estado='abierta'`. La usan `panel-resumen.tsx:86-98` y `panel-documentos.tsx:144-217`. | `app/(app)/pacientes/[id]/datos.ts:306-338` |
| H19 | `RUTA_NOTAS_DISPONIBLE = false`, y `rutaNotas(p, c)` lleva a `/pacientes/<p>/historia/notas?cita=<c>`. T-012 corte B (en implementación) crea la ruta y cambia la bandera. | `app/(app)/agenda/notas.ts` |
| H20 | El armazón: `Armazon` pasa ranuras envueltas en Suspense a `ArmazonCliente`. `SaludoYFecha` hace `await connection()` y después `new Date()` **en el servidor**: es el molde del instante resuelto en el servidor. La cabecera (`armazon-cliente.tsx:93-105`) es `h-20 justify-between`, con el botón de menú y el saludo a la izquierda, y **la derecha está vacía**. | `components/armazon/armazon.tsx`, `armazon-cliente.tsx` |
| H21 | La cookie de preferencia se escribe en una Server Action. `COOKIE_CENTRO` vive en un módulo aparte porque un fichero `'use server'` solo exporta funciones asíncronas. | `app/(app)/acciones.ts:33-62`, `components/armazon/centro.ts` |
| H22 | `Emergente` es un panel no modal anclado al disparador. Atrapa el foco mientras está abierto y lo devuelve al cerrarse. Recibe `disparador`, `titulo`, `children` y `etiqueta`. | `components/ui/emergente.tsx:8-56` |
| H23 | Existen `zona_horaria_centro(uuid)` y el patrón de herencia «organización not null, centro nullable, función efectiva que nunca da nulo» (`retencion_efectiva`). | `grep` en `supabase/migrations/` |
| H24 | `pg_cron` no se usa todavía en ninguna migración. ADR-024 admite «pg_cron en la instancia, o cron de Vercel contra una ruta que exige secreto». `eventos_salientes` existe, sin consumidor. | `grep cron` en `supabase/`; `docs/decisions/ADR-024.md` |
| H25 | Linter de migraciones. Regla 2: `set not null` sin `default` exige el comentario `-- destructivo:`. Regla 5: sellos estrictamente crecientes y únicos. | `scripts/lint-migraciones.ts:230-256` |
| H26 | Banco RLS: el 20 es de T-012 y el 21 está reservado por T-028a. **El 22 está libre.** Las identidades del banco son ADM, PRO1, PRO2, TEC1, TEC2 y PROBAJA, y P1 es de PRO1 en el centro A. | `scripts/rls/README.md`, `01-fijacion.sql`, `tickets/T-028a/diseno.md:375` |
| H27 | `sin-literales.test.ts` hace fallar cualquier texto visible fuera de `lib/i18n/es.ts`. El verificador de accesibilidad de T-009 es `npm run test:a11y` (Playwright, `accesibilidad/*.spec.ts`). | `lib/i18n/sin-literales.test.ts`; `package.json:19`; `playwright.config.ts:31` |
| H28 | Los layouts no se vuelven a pintar al navegar en el cliente. `revalidatePath(ruta, 'layout')` desde una Server Function refresca el layout y todo lo que cuelga de él. | `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:43`; `…/revalidatePath.md` |
| H29 | La cola de `supabase/` es T-035 (`20261004120000`), T-028a (`20261005120000`), T-039 y T-038 (sin sello). La última migración en `main` es `20261003120000`. Ni T-035 ni T-028a tocan `alertas_documentacion` ni `notificaciones`. T-039 recrea `agenda_citas_rango` y `citas_agenda`. T-038 inserta en `notificaciones`. | diseños de T-035, T-028a y T-038; contrato de T-039 |

**Hallazgo para `state.md`** (el orquestador lo apunta, yo no lo edito): la línea «Siguiente paso:
Sin `supabase/`: T-015» es falsa. T-015 escribe una migración y entra en la cola de `supabase/`
(ver §1.1).

---

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/20261006120000_avisos_y_escalado.sql`

**Sitio en la cola:** después de T-028a y antes de T-039 y T-038.
- No pisa a T-039: no toca `agenda_citas_rango` ni `citas_agenda`.
- No pisa a T-038: sus `insert (perfil_id, tipo, detalle)` siguen valiendo, porque las columnas
  nuevas admiten nulo o tienen valor por defecto.
- T-039 y T-038 cogen `20261007…` en adelante.
- Si T-028a se retrasa y T-015 entra antes, el sello sigue siendo válido (mayor que
  `20261005120000`), con una condición: T-028a no puede integrarse después con un sello menor
  que el último de `main`, porque la regla 5 lo rechazaría.

La migración va por bloques, en este orden.

**A. `notificaciones`**

1. Columnas nuevas:
   ```sql
   alter table public.notificaciones
     add column titulo text check (titulo is null or length(trim(titulo)) > 0),
     add column origen_tabla text check (origen_tabla is null or length(trim(origen_tabla)) > 0),
     add column origen_id uuid,
     add constraint notificaciones_origen_completo
       check ((origen_tabla is null) = (origen_id is null));
   ```
2. Índice de idempotencia:
   ```sql
   create unique index notificaciones_origen_unico
     on public.notificaciones (perfil_id, tipo, origen_tabla, origen_id)
     where origen_id is not null;
   ```
3. `create or replace function public.fn_proteger_notificacion()`. Sigue siendo definer y con
   `search_path = ''`, y se mantiene el mismo disparador. Reglas:
   - Lanza 42501 si cambia cualquiera de `id`, `perfil_id`, `tipo`, `titulo`, `detalle`,
     `creado_en`, `origen_tabla` u `origen_id`. El mensaje se queda tal cual: «Una notificación
     solo se puede actualizar en su columna leida_en.»
   - Si `old.leida_en is null and new.leida_en is not null`, entonces `new.leida_en := now()`.
     El reloj lo pone la base, no el cliente.
   - Si `old.leida_en is not null and new.leida_en is distinct from old.leida_en`, lanza 42501
     con «Una notificación leída no vuelve a no leída.» Leída es para siempre.
4. Políticas: `drop` y `create` con **el mismo nombre**, para que `11-cobertura.sql` no cambie.
   Se añade `(select public.rol_actual()) is not null and` delante de `perfil_id = (select auth.uid())`,
   en la lectura y en el update (`using` y `with check`). Es el corte por baja de ADR-032.
5. Auditoría:
   ```sql
   create trigger auditar_notificaciones after insert or update or delete on public.notificaciones
     for each row execute function public.fn_auditar('id');
   ```
   La forma exacta del argumento se copia del bucle de T-004 (`20260829150000_auditoria_y_solo_adicion.sql`).
6. Comentarios (`comment on column`):
   - en `titulo`: «Lo escribe quien genera la notificación. Si es nulo, la interfaz usa la
     etiqueta del tipo»;
   - en `detalle`: «Es el `cuerpo` del contrato de T-015».

**B. `alertas_documentacion`: el instante de referencia**

1. `add column referencia_en timestamptz not null default now()`. Lleva valor por defecto, así que
   la regla 2 no salta.
2. Relleno de las filas existentes:
   - `origen_tabla = 'citas'`: `referencia_en := citas.fin`;
   - el resto: `referencia_en := creada_en`.
3. `fn_fijar_referencia_alerta()`: definer, `search_path = ''`, BEFORE INSERT.
   - Si `new.origen_tabla = 'citas'`, `new.referencia_en := (select fin from public.citas where id = new.origen_id)`.
   - Si no, o si la cita no existe, `new.referencia_en := now()`.
   - **Ignora siempre lo que mande el cliente.** Cierra la puerta de la política de alta (H11).
4. `fn_proteger_alerta_documentacion()`: **security invoker**, BEFORE UPDATE. Es invoker para
   que `current_user` sea el de quien escribe. El nombre del disparador debe ordenarse después
   de los de auditoría que existan; el implementador lo comprueba. Solo actúa si
   `current_user = 'authenticated'`. Las funciones definer (T-012, T-015) corren como
   propietario y no la activan.
   - Lanza 42501 si cambia `paciente_id`, `profesional_id`, `centro_id`, `tipo`, `origen_tabla`,
     `origen_id`, `fecha_referencia`, `referencia_en` o `creada_en`.
   - Si `old.tipo = 'nota_sin_firmar'` y cambia `estado` o `resuelta_en`, lanza 42501 con
     «Una nota pendiente solo se cierra firmando la nota.» (P1).

**C. Umbrales por centro**

1. `organizacion`: añadir `escalado_nivel2_horas smallint not null default 24` y
   `escalado_nivel3_horas smallint not null default 72`, con
   `check (escalado_nivel2_horas > 0 and escalado_nivel3_horas > escalado_nivel2_horas)`.
2. `centros`: las mismas columnas, nulas, con `check (x is null or x > 0)` en cada una.
3. Función:
   ```sql
   create function public.umbrales_escalado(p_centro uuid)
     returns table (nivel2_horas integer, nivel3_horas integer)
     language sql stable security definer set search_path = ''
   ```
   - Cada umbral es `coalesce(centro, organizacion, 24 / 72)`.
   - Después se aplica `nivel3 := greatest(nivel3, nivel2 + 1)`, porque el centro puede fijar
     un umbral y heredar el otro.
   - **Nunca devuelve nulo**, y siempre una fila, también con `p_centro` nulo.
   - Permisos: `revoke all … from public, anon` y `grant execute … to authenticated`.

**D. Nivel**

1. Función:
   ```sql
   create function public.nivel_nota_pendiente(p_referencia timestamptz, p_centro uuid)
     returns smallint language sql stable security invoker set search_path = ''
   ```
   - `null` si `p_referencia` es nula.
   - `1` si `now() - p_referencia < nivel2 horas`.
   - `2` si es menor que `nivel3 horas`.
   - `3` en el resto.
   - Usa `make_interval(hours => …)`.
   - Permisos: `grant execute` a authenticated, revoke a anon y public.
2. Vista:
   ```sql
   create view public.alertas_documentacion_nivel with (security_invoker = true) as
     select a.id, a.paciente_id, a.profesional_id, a.centro_id, a.tipo, a.origen_tabla, a.origen_id,
            a.fecha_referencia, a.referencia_en, a.estado, a.creada_en,
            case when a.tipo = 'nota_sin_firmar' and a.estado = 'abierta'
                 then public.nivel_nota_pendiente(a.referencia_en, a.centro_id) end as nivel
       from public.alertas_documentacion a;
   ```
   - Permisos: `revoke all … from public, anon`; `grant select … to authenticated`.
   - La RLS de la tabla base se aplica porque la vista es invoker.
   - Comentario: «Solo lectura. El nivel se calcula aquí y en ningún otro sitio.»

**E. Recuento de la cabecera**

```sql
create function public.recuento_notas_pendientes()
  returns table (nivel1 integer, nivel2 integer, nivel3 integer)
  language sql stable security invoker set search_path = ''
```

- Hace `count(*) filter (where nivel = N)` sobre `public.alertas_documentacion_nivel`, con
  `estado = 'abierta' and tipo = 'nota_sin_firmar' and profesional_id = (select auth.uid())`.
- Siempre devuelve una fila (ceros si no hay nada).
- Permisos: `grant execute` a authenticated, revoke a anon y public.
- **El filtro `profesional_id = uid` es el contrato.** La RLS deja ver al coasignado y al admin
  alertas que no son suyas, y la cabecera cuenta las notas que **yo** tengo que firmar.

**F. Lectura de `alertas_documentacion`: la decisión del 01-10**

Se hace `drop policy` y `create policy alertas_documentacion_lectura` con el mismo nombre:

```sql
using ((select public.rol_actual()) is not null and (
  (select public.rol_actual()) = 'administrador'
  or ((select public.rol_actual()) <> 'tecnico_administrativo'
      and (profesional_id = (select auth.uid()) or public.es_profesional_asignado(paciente_id)))
  or ((select public.rol_actual()) = 'tecnico_administrativo'
      and tipo = 'consentimiento_pendiente'
      and centro_id in (select public.centros_actuales()))))
```

Con esto quedan cerradas la ficha (H18), el panel de resumen y el de documentos, sin tocar su
código.

**G. Escalado al nivel 3**

```sql
create function public.escalar_notas_pendientes()
  returns integer language plpgsql volatile security definer set search_path = ''
```

1. Una sola sentencia:
   `insert into public.notificaciones (perfil_id, tipo, titulo, detalle, origen_tabla, origen_id)`.
   Inserta una fila por cada **administrador activo** (`perfiles.rol = 'administrador' and
   estado = 'activo'`) y cada alerta que cumpla `estado = 'abierta' and tipo = 'nota_sin_firmar'`
   y `nivel_nota_pendiente(referencia_en, centro_id) = 3`.
   - `tipo = 'nota_pendiente_escalada'`.
   - `titulo = 'Nota sin firmar'`.
   - `detalle = format('%s tiene sin firmar la nota de la sesión del %s.', pr.nombre_completo,
     to_char(a.referencia_en at time zone public.zona_horaria_centro(a.centro_id), 'DD/MM'))`.
   - `origen_tabla = 'alertas_documentacion'` y `origen_id = a.id`.
   - Termina en `on conflict (perfil_id, tipo, origen_tabla, origen_id) where origen_id is not null do nothing`.
     El predicado del índice parcial se repite tal cual.
2. Devuelve `row_count`.
3. Permisos: `revoke execute … from public, anon, authenticated`. No se concede a nadie.
4. Comentario:
   - el cuerpo no lleva paciente, por la decisión 5 y ADR-038;
   - el escalado vive **solo** aquí, no en el outbox.

**H. Programación**

- `create extension if not exists pg_cron`. El esquema lo marca la imagen de Supabase; ver «Por
  confirmar».
- `select cron.schedule('escalar-notas-pendientes', '*/15 * * * *', $$select public.escalar_notas_pendientes()$$);`
- El retraso máximo es de 15 minutos sobre el umbral de 72 h. Se acepta.

**Lo que la migración no toca:**
- `fn_alertar_nota_sin_firmar` ni `fn_resolver_alerta_nota_sin_firmar`;
- `agenda_citas_rango` ni `citas_agenda` (son de T-039);
- `notas_clinicas*`, porque el contrato lo prohíbe expresamente.

### 1.2 Tipos

Hay que correr `npx supabase db reset` y después `npm run tipos`, con la base libre.
`lib/supabase/tipos-bd.ts` es generado y no se edita a mano.

### 1.3 Lectura en servidor: `lib/citas/avisos.ts` (nuevo)

Es un fichero de solo servidor.

```ts
export type NotificacionVista = {
  id: string; tipo: string; titulo: string | null; detalle: string;
  creadoEn: Date; leida: boolean;
};
export type RecuentoNotas = { nivel1: number; nivel2: number; nivel3: number };
export type SesionPropia = {
  citaId: string; pacienteId: string; nombrePaciente: string; inicio: string; fin: string; estado: EstadoCita;
};

export async function leerNotificaciones(sesion: Sesion): Promise<NotificacionVista[]>;
export async function leerRecuentoNotas(sesion: Sesion): Promise<RecuentoNotas>;
export async function leerSesionesPropias(sesion: Sesion, ahora: Date): Promise<SesionPropia[]>;
```

- **`leerNotificaciones`** hace dos consultas:
  1. las no leídas (`leida_en is null`), por `creado_en` descendente, `limit 50`;
  2. las 10 últimas leídas.

  Concatena las no leídas primero. Selecciona `id, tipo, titulo, detalle, creado_en, leida_en`.
  No filtra por tipo: la campana enseña todas.
- **`leerRecuentoNotas`** llama a `rpc('recuento_notas_pendientes')`. Si hay error o no hay
  fila, devuelve ceros y registra el error con `console.error`. No inventa números.
- **`leerSesionesPropias`**:
  - llama a `leerCitasRango(sesion, ahora, ahora + 12 h)`;
  - filtra `profesionalId === sesion.usuario.id` y `estado ∉ {cancelada, no_asistida}`;
  - devuelve fechas ISO, porque el cliente las recibe serializadas;
  - el nombre del paciente es el de `FilaAgenda`.

`Sesion` es el tipo que ya devuelve `exigirSesion()` en `lib/supabase/sesion.ts`; si no está
exportado con nombre, se usa `Awaited<ReturnType<typeof exigirSesion>>`.

### 1.4 Funciones puras: `lib/agenda/avisos.ts` (nuevo)

```ts
export function sesionesEnCurso(sesiones: SesionPropia[], ahora: Date): SesionPropia[]; // usa estaEnCurso
export function proximoCambio(sesiones: SesionPropia[], ahora: Date): Date | null;     // menor inicio o fin > ahora
export function parsearDescartadas(valor: string | undefined): string[];               // solo UUID válidos, máx. 20
export function anadirDescartada(lista: string[], citaId: string): string[];           // sin duplicados, recorta a 20 (FIFO)
export function cuantasDestacadas(r: RecuentoNotas): number;                           // nivel2 + nivel3 (P2)
```

`SesionPropia` y `RecuentoNotas` se definen aquí y `lib/citas/avisos.ts` los importa. Así la
dirección del import va de `lib/citas` hacia `lib/agenda`, y no al revés.

### 1.5 Server Actions: `components/armazon/acciones-avisos.ts` (`'use server'`, nuevo)

La constante `COOKIE_FRANJAS_DESCARTADAS = 'franjas_descartadas'` va en
`components/armazon/avisos-constantes.ts`. Un fichero `'use server'` solo exporta funciones
asíncronas (H21).

```ts
export async function descartarFranja(citaId: string): Promise<void>;
export async function marcarNotificacionLeida(id: string): Promise<{ ok: boolean }>;
export async function marcarTodasLeidas(): Promise<{ ok: boolean }>;
```

- **Las tres** empiezan con `exigirSesion()` y validan con Zod (`z.uuid()`) en el servidor.
- **`descartarFranja`**:
  - lee la cookie y aplica `anadirDescartada`;
  - hace `cookies().set(COOKIE_FRANJAS_DESCARTADAS, lista.join(','), { httpOnly: true, sameSite: 'lax', secure: prod, path: '/' })`;
  - **sin `maxAge` ni `expires`**, para que sea una cookie de sesión del navegador;
  - sin `revalidatePath`, porque el cliente ya ha ocultado la franja.
  - No comprueba que la cita sea del usuario. Es una preferencia de presentación que solo
    oculta, y un id ajeno no da acceso a nada. Se deja anotado en el comentario.
- **`marcarNotificacionLeida`** hace
  `update({ leida_en: new Date().toISOString() }).eq('id', id).is('leida_en', null)`. El valor
  da igual, porque la base lo sustituye por `now()`. Después, `revalidatePath('/', 'layout')`.
- **`marcarTodasLeidas`** hace lo mismo con `.eq('perfil_id', usuario.id).is('leida_en', null)`.
  Después, `revalidatePath('/', 'layout')`.
- **Resolver una alerta: no se construye** (P1). Ver §2-D6.

### 1.6 Armazón

**`components/armazon/armazon.tsx`** añade dos ranuras en Suspense con `fallback={null}`:
`avisos` (la cabecera derecha) y `franja`. Las dos salen de un único componente asíncrono,
`DatosDeAvisos`, que:

- hace `await connection()` y después `const ahora = new Date()`, como `SaludoYFecha`;
- hace `exigirSesion()` (con `cache`), `Promise.all([leerSesionesPropias, leerRecuentoNotas, leerNotificaciones])`
  y lee la cookie de franjas descartadas;
- pinta `<AvisosCliente ahoraServidor={ahora.toISOString()} … />`.

Para no duplicar la carga, una sola ranura `avisos` monta un único componente cliente con dos
portales lógicos. Va en dos sitios del árbol de `ArmazonCliente`, la cabecera y encima del
contenido, mediante un contexto local `AvisosProvider`. Quien implemente puede elegir, como
**única** libertad de forma, entre pasar dos nodos o usar un contexto. El contrato visible es
el de abajo.

**`components/armazon/armazon-cliente.tsx`**:

- Prop nueva `avisos: ReactNode`, que se pinta a la derecha de la cabecera
  (`<div className="flex items-center gap-2">`).
- Prop nueva `franja: ReactNode`, que se pinta **en el flujo**, justo encima de `{children}`
  dentro del contenedor `max-w-[1480px]`. **Ni `fixed` ni `sticky`**: así no tapa la acción
  primaria ni el teclado virtual a 360 px. La empuja hacia abajo.
- A menos de `sm`, el saludo se trunca (`truncate`) para dejar sitio a los iconos.

**`components/armazon/aviso-sesion.tsx`** (`'use client'`). Exporta `FranjaSesion` y
`AnclaSesion`.

- **Estado inicial**: `sesionesEnCurso(sesiones, new Date(ahoraServidor))`, que es determinista.
  El servidor y la hidratación pintan lo mismo. **Ningún `new Date()` sin argumentos.**
- **Reloj**:
  - en `useEffect`, se fija `t0 = performance.now()`;
  - el instante estimado es `ahoraServidor + (performance.now() - t0)`;
  - un único `setTimeout` hasta `min(proximoCambio, 60 s)`, que se reprograma solo; se limpia
    al desmontar.
- **Franja**:
  - un contenedor `<div role="status" aria-live="polite" aria-atomic="true">` **siempre
    montado** (vacío si no hay franja visible). Un live region que nace con el contenido no
    se anuncia;
  - el contenido es el texto «Sesión en curso · {nombre} · {hora inicio}–{hora fin}», el
    botón «Notas» y el botón «Descartar»;
  - «Notas» es un `Link` a `rutaNotas(pacienteId, citaId)` **solo si `RUTA_NOTAS_DISPONIBLE`**;
    si no, no se pinta;
  - una sola animación de entrada, con `motion-safe:` y nada con `motion-reduce` (ADR-047);
  - si hay varias sesiones en curso, una franja por la primera (por `inicio`) y el ancla
    cuenta todas.
- **Descartar**: oculta en el estado local al momento y llama a `descartarFranja(citaId)` en
  una transición. El foco va al `AnclaSesion` (con `ref`), para que no se pierda en `body`.
- **Lo descartado** llega del servidor (cookie) y se suma al estado local. Una franja descartada
  no vuelve en esta pestaña ni en una recarga.
- **`AnclaSesion`**, en la cabecera: un `Link` a `rutaNotas` (o a `/agenda` si
  `!RUTA_NOTAS_DISPONIBLE`), con un punto de color y el texto «En sesión» (solo para lectores
  a menos de `sm`). Se ve **mientras haya una sesión en curso**, esté o no descartada la franja.
- **Nada de `autoFocus`, `focus()` al aparecer, `role="alert"`, `alertdialog` ni `<dialog>`.**

**`components/armazon/aviso-notas.tsx`** (servidor o cliente sin estado, a elegir):

- Si `cuantasDestacadas(recuento) > 0`, un `Link` a `/agenda` con la píldora `warning` y el
  número.
- Nombre accesible: «{n} notas sin firmar desde hace más de un día» (con plural en el
  catálogo).
- Si es 0, no se pinta nada: ningún control sin dato.
- El técnico siempre ve 0, porque nunca es `profesional_id`.

**`components/armazon/campana.tsx`** (`'use client'`):

- Usa `Emergente`. El disparador es un botón con un icono `Bell` y la etiqueta «Notificaciones,
  {n} sin leer», con un contador visible si n > 0.
- El panel es una lista `<ul>`. Cada elemento lleva:
  - el título: `titulo ?? t('notificaciones.tipos.<tipo>')`, con la etiqueta genérica
    `notificaciones.tipos.otro` si el tipo no está en el catálogo;
  - el `detalle`;
  - la fecha corta, formateada con `lib/fechas`;
  - si no está leída, el botón «Marcar como leída».
- Arriba, «Marcar todas como leídas» si hay alguna sin leer.
- Sin avisos, «No tienes notificaciones.»
- **Nada de borrar, archivar ni ninguna acción destructiva.**
- Tras marcar: la Server Action revalida el layout. Mientras tanto, el elemento se marca como
  leído con `useOptimistic`.

### 1.7 Agenda: el nivel sale de la base

- **`lib/citas/agenda.ts`**: `leerAlertasNotaPendiente` lee de `alertas_documentacion_nivel`
  (las mismas columnas más `nivel`). `AlertaPendiente` gana `nivel: 1 | 2 | 3 | null`. Los
  filtros siguen iguales.
- **`app/(app)/agenda/bloques.ts`**: se **borra** `nivelDeAntiguedad` y su prueba. Se mantienen
  `diasPendiente` y `VISIBLE_AL_TECNICO`, que ahora son defensa en profundidad, porque la
  garantía es la RLS.
- **`app/(app)/agenda/documentacion.tsx`**: la píldora sale de `alerta.nivel`:
  - nivel 2: `t('agenda.documentacion.nivel2')`;
  - nivel 3: `t('agenda.documentacion.nivel3')`;
  - nivel 1 y null: sin píldora. El nivel 1 es la presencia discreta en la lista.
- Las claves `agenda.documentacion.mas24` y `mas72` se borran del catálogo.

### 1.8 Catálogo: `lib/i18n/es.ts`

Los textos, con ADR-054 (frase corta, verbo activo, sin jerga):

| Clave | Texto |
|---|---|
| `avisos.sesion.franja` | `Sesión en curso · {paciente} · {desde}–{hasta}` |
| `avisos.sesion.notas` | `Notas` |
| `avisos.sesion.descartar` | `Descartar aviso` |
| `avisos.sesion.ancla` | `En sesión` |
| `avisos.notas.etiqueta` | `{n} nota sin firmar desde hace más de un día` / `{n} notas sin firmar desde hace más de un día` |
| `notificaciones.boton` | `Notificaciones, {n} sin leer` / `Notificaciones` |
| `notificaciones.titulo` | `Notificaciones` |
| `notificaciones.vacio` | `No tienes notificaciones.` |
| `notificaciones.marcarLeida` | `Marcar como leída` |
| `notificaciones.marcarTodas` | `Marcar todas como leídas` |
| `notificaciones.tipos.nota_pendiente` | `Falta firmar una nota` |
| `notificaciones.tipos.nota_pendiente_escalada` | `Nota sin firmar` |
| `notificaciones.tipos.acceso_emergencia` | `Acceso de emergencia a una historia` |
| `notificaciones.tipos.pin_bloqueado` | `PIN bloqueado` |
| `notificaciones.tipos.totp_repuesto` | `Segundo factor repuesto` |
| `notificaciones.tipos.codigos_regenerados` | `Códigos de recuperación nuevos` |
| `notificaciones.tipos.regeneracion_codigos_bloqueada` | `Regeneración de códigos bloqueada` |
| `notificaciones.tipos.otro` | `Aviso` |
| `agenda.documentacion.nivel2` | `Atrasada` |
| `agenda.documentacion.nivel3` | `Muy atrasada` |

La forma exacta de plurales e interpolación es la que ya use `lib/i18n/index.ts`; no se inventa
una nueva.

**Coordinación con T-038**: `notificaciones.tipos.*` es **el** sitio de las etiquetas por tipo.
T-038 integra después y debe reutilizarlas en `lista-avisos.tsx` en vez de crear `cuenta.*`
paralelas. El orquestador se lo pasa al implementador de T-038.

### 1.9 Pruebas

**Banco RLS: `scripts/rls/22-avisos.sql`** (nuevo), más una fila en `scripts/rls/README.md`.
Sus fixtures son propios: una cita de PRO1 con P1 en el centro A y otra de PRO2. Las
inserciones como `postgres` siguen el patrón de alerta de `15-agenda.sql`. Las aserciones están
en §3.

`scripts/rls/11-cobertura.sql` no cambia, porque los nombres de las políticas son los mismos.
Si la vista o las funciones nuevas obligan a declarar algo, se declara ahí.

**Vitest:**

- `lib/agenda/avisos.test.ts`: las cinco funciones puras, con los bordes de `estaEnCurso`
  (inicio incluido y fin excluido).
- `components/armazon/aviso-sesion.test.tsx` (jsdom, temporizadores falsos):
  - un `<input>` enfocado sigue siendo `document.activeElement` cuando aparece la franja;
  - la franja vive dentro de `role="status"` y no hay ningún `role="alert"`;
  - el live region existe antes de que haya contenido;
  - tras descartar, la franja no vuelve al pasar el tiempo, el ancla sigue y el foco queda en el
    ancla;
  - «Notas» no se pinta si `RUTA_NOTAS_DISPONIBLE` es falso;
  - en todo el fichero no se llama a `Date` sin argumentos (se espía `globalThis.Date`).
- `components/armazon/campana.test.tsx`:
  - las no leídas van primero;
  - «Marcar como leída» solo aparece en las no leídas;
  - no hay ningún botón con `destructiva`;
  - con un tipo desconocido sale «Aviso».
- `components/armazon/acciones-avisos.test.ts` (con `exigirSesion` y `cookies` simulados):
  - un id que no es UUID se rechaza sin llamar a Supabase;
  - la cookie se escribe sin `maxAge` ni `expires`;
  - `revalidatePath('/', 'layout')` se llama en las dos de marcar.
- `app/(app)/agenda/documentacion.test.tsx` (o la prueba que ya exista de ese bloque): la
  píldora sale de `nivel` y no de los días.

**Accesibilidad:** `accesibilidad/avisos.spec.ts` revisa con axe la cabecera, con la campana
abierta y con la franja a 360 px. El inicio de sesión se hace como lo haga la spec de T-012
corte B si ya está en `main`; si no, ver «Por confirmar».

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartado, y por qué |
|---|---|---|
| D1 | Se reutiliza `notificaciones` tal como existe: `detalle` es el `cuerpo`, `perfil_id` el `destinatario_id` y `creado_en` el `creada_en`. | Renombrar las columnas: es destructivo (regla 2), rompe tres funciones ya en `main` y el diseño de T-038, y no cambia ningún comportamiento. |
| D2 | Se añade `titulo`, nulo, y la interfaz cae a la etiqueta del tipo cuando falta. | Que no haya `titulo`: el criterio 7 dice `set titulo = 'x'`. Sin columna fallaría con 42703 (no existe), no por la protección, y la prueba no demostraría nada. Que sea `not null`: obligaría a reescribir las tres funciones de T-006a y las dos de T-038. |
| D3 | El escalado vive **solo** en una función de Postgres programada con pg_cron. | Que lo calcule el consumidor del outbox: ese consumidor no existe, y el contrato prohíbe que el escalado esté en dos sitios. Cron de Vercel: añade una ruta con secreto y una clave de servicio en el servidor, para algo que la base hace sola. |
| D4 | El nivel se calcula en la base (`nivel_nota_pendiente` y la vista invoker) a partir de `referencia_en` = `citas.fin`. | Días de calendario en TypeScript (`nivelDeAntiguedad`): son dos fuentes de verdad, y además no cuadran con «a las 24 h». Leer `citas.fin` con un join en la vista: la RLS de `citas` podría dejar el nivel nulo según el rol. `fecha_referencia`: es una fecha en UTC, demasiado gruesa para 24 h. |
| D5 | El recuento de la cabecera son **mis** notas: `profesional_id = uid`, para todos los roles, incluido el admin. Se destacan los niveles 2 y 3. | Contar todo lo que deja ver la RLS: el coasignado y el admin verían notas que no tienen que firmar, y el criterio 8 lo prohíbe expresamente. El admin se entera de las ajenas por el nivel 3. Es coherente con `criterioDocumentacion` de T-014 (el admin ve solo lo propio). |
| D6 | No hay acción «resolver alerta», y la base impide cerrar una `nota_sin_firmar` a mano (P1). | Construirla: la única alerta que hoy se genera es `nota_sin_firmar`, y cerrarla sin firmar desactiva el escalado. Las demás alertas no las genera nadie, así que sería un control sin acción real detrás (`CLAUDE.md`). |
| D7 | Los umbrales siguen el patrón de herencia: organización `not null default`, centro nulo y una función efectiva que nunca da nulo. | Ponerlos en `preferencias_usuario` o en una tabla aparte: el contrato pide «por centro» y que herede como `retencion_efectiva()`. |
| D8 | Un disparador invoker protege las columnas de identidad y `referencia_en` de la alerta. | Confiar en la política de update: deja mover `profesional_id`, `tipo` o el instante, y con eso se esquiva el escalado. Un disparador definer: no vería `current_user = authenticated`. |
| D9 | La franja va en el flujo, debajo de la cabecera, y no es fija. | `fixed` o `sticky` abajo: a 360 px tapa la acción primaria y el teclado virtual (criterio 9). |
| D10 | El descarte se guarda en una cookie de sesión, `httpOnly`, escrita por una Server Action y leída en el layout. | `sessionStorage`: el servidor no la ve, así que la franja aparecería un instante en cada recarga, y se pierde al abrir otra pestaña. Una tabla: persiste más allá de la sesión del navegador, y el contrato pide lo contrario. |
| D11 | El reloj del cliente es `ahoraServidor + (performance.now() - t0)`, con un `setTimeout` al próximo cambio. | `new Date()` en el cliente: el contrato lo prohíbe para el primer pintado, y un reloj del navegador desajustado desplazaría la franja. Un `setInterval` de 1 s: es trabajo inútil y no da más precisión que ir al próximo cambio. |
| D12 | Los datos de avisos se leen en el layout y se refrescan con `revalidatePath('/', 'layout')` desde las acciones. | Un sondeo con una Server Action periódica: una acción es una mutación y no se usa para leer. Realtime de Supabase: está fuera de alcance (ver «Lo que no entra»). |
| D13 | Las notificaciones de nivel 3 van a **todos los administradores activos**, y su `detalle` es «{profesional} tiene sin firmar la nota de la sesión del {dd/mm}.». | Que vayan al admin del centro: hoy los administradores son de toda la organización. Que lleven el paciente: lo prohíben la decisión 5 y ADR-038. |
| D14 | Se añade `rol_actual() is not null` a las dos políticas de `notificaciones`. | Dejarlas como están: serían las únicas del esquema sin el corte por baja de ADR-032. |
| D15 | `leida_en` lo fija la base (`now()`) y, una vez puesto, no cambia. | Aceptar el valor del cliente: permitiría fechar la lectura hacia atrás, y volver a no leída rompería la auditoría. |

---

## 3 · Cómo se cierra cada criterio de aceptación

El banco es `scripts/rls/22-avisos.sql` (`npm run test:rls`). Cada negativa lleva su gemela
positiva y un mutante que la tumba. Los mutantes se ejecutan a mano, de uno en uno, y se apuntan
al final del módulo como hace el 20.

| # | Criterio | Comprobación | Gemela | Mutante que debe hacerla fallar |
|---|---|---|---|---|
| C1 | **Manual.** La franja aparece sin robar el foco. | El guion, pasos 1 y 2. En automático lo respalda `aviso-sesion.test.tsx`: `activeElement` no cambia. | Sin cita en curso no hay franja. | Poner `autoFocus` en el botón «Notas»: la prueba Vitest falla. |
| C2 | **Manual.** Al descartar y navegar, el ancla sigue y la franja no vuelve. | El guion, paso 3. En Vitest: descartar y avanzar los temporizadores. Tras recargar, la cookie la oculta. | El ancla desaparece al pasar el `fin`. | Que el ancla dependa de `!descartada`: falla el Vitest. |
| C3 | **Manual.** El lector de pantalla la anuncia una vez. | NVDA o VoiceOver. En Vitest: `role="status"` y `aria-live="polite"` existen antes que el contenido, y no hay `role="alert"`. | — | Cambiar a `role="alert"`: falla el Vitest. |
| C4 | **Automático.** Una cita `realizada` de ayer sin firmar da nivel 2 y sube el recuento. | En el banco: (a) como PRO1, `r0 := recuento_notas_pendientes().nivel2`; (b) como postgres, cita de PRO1 y P1 con `fin = now() - interval '25 hours'`, que se pasa a `realizada`; (c) como PRO1, `nivel = 2` en `alertas_documentacion_nivel` para esa cita, y el `nivel2` del recuento es `r0 + 1`. | Una cita con `fin = now() - 2 h` da `nivel = 1` y no suma a `nivel2`. Otra con `fin = now() - 73 h` da `nivel = 3`. Con `centros.escalado_nivel2_horas = 48` en el centro A, la de 25 h baja a nivel 1 (umbral por centro). Con el umbral del centro a null, vuelve a 2 (herencia que nunca da nulo). | Fijar `umbrales_escalado` a 72/24 o quitar el `coalesce`: falla C4 o su gemela de herencia. Comprobar `referencia_en` con `now()` en vez de `citas.fin`: falla `nivel = 2`. |
| C5 | **Automático.** A las 72 h hay **una** fila para el admin, y su `cuerpo` no lleva paciente. | Como postgres, sobre la cita de 73 h: `select public.escalar_notas_pendientes()` **dos veces**. Después: `count(*) = 1` en `notificaciones` con `perfil_id = ADM` y `origen_id = alerta`; el `detalle` no contiene `P1.nombre` ni `P1.apellidos` (`position(... in detalle) = 0` para cada uno) ni el texto de ninguna nota; contiene `nombre_completo` de PRO1. | La alerta de nivel 2 no genera ninguna fila. Un admin con `estado = 'baja'` no recibe nada. Si la alerta está resuelta (vía firma, o como postgres), escalar no crea nada nuevo. | Quitar el `on conflict`: la segunda llamada falla con 23505. Quitar el predicado del índice en el `on conflict`: error 42P10. Meter `p.nombre` en el `format`: falla `position = 0`. |
| C6 | **Automático.** Como `profesional_sanitario`, cero notificaciones ajenas. | Se inserta como postgres una notificación para PRO2 y otra para PRO1. Como PRO1: `count(*) where perfil_id = PRO2 = 0`, y un `update` sobre la de PRO2 afecta a 0 filas. | Como PRO1, `count(*) where perfil_id = PRO1 = 1`. Como PROBAJA, ve 0 de las suyas (D14). | Quitar `perfil_id = uid` de la política: PRO1 ve 1. Quitar `rol_actual() is not null`: PROBAJA ve la suya. |
| C7 | **Automático.** `update … set titulo = 'x'` falla y marcar `leida_en` entra. | Como PRO1, sobre su propia fila: `assert_lanza('update … set titulo = ''x''', '42501')`, y lo mismo para `detalle`, `tipo`, `origen_id` e `id`. | Sobre la misma fila, `update set leida_en = '2000-01-01'` entra, y queda `leida_en` ≈ `now()`, **no** el año 2000. Después, `set leida_en = null` lanza 42501. | Quitar `titulo` de la lista congelada del disparador: el `update` entra y la aserción falla. |
| C8 | **Automático.** El recuento de un profesional no incluye alertas de otro. | Se asigna PRO2 a P1 (es coasignado y la RLS le deja ver la alerta de PRO1). Como PRO2: la alerta de 25 h de PRO1 **es visible** en la vista (`count = 1`), pero `recuento_notas_pendientes()` no la cuenta. | Como PRO1, el mismo recuento sí la cuenta. | Quitar `profesional_id = auth.uid()` de la función: PRO2 la cuenta. |
| C9 | **Manual.** A 360 px la franja no tapa nada. | DevTools a 360 px con el teclado virtual del emulador. En automático, `avisos.spec.ts`: la franja no tiene `position: fixed` ni `sticky`, y no hay desbordamiento horizontal. | — | — |
| C10 | **Manual.** `/agenda` y la cabecera al lado del prototipo. | Comparación visual. Se usan las mismas palabras del prototipo donde existan. No hay controles sin acción. | — | — |
| C11 | **Automático.** `npm run lint && npm run build` limpios, y `npm run test:a11y` en verde. | Las tres salidas, más `npm test` y `npm run lint:migraciones`. | — | — |

Aserciones que el contrato no pide pero que este diseño necesita:

| # | Qué | Negativa | Gemela |
|---|---|---|---|
| E1 | La decisión del 01-10: el técnico solo ve `consentimiento_pendiente`. | Como TEC1, **la consulta exacta de `datos.ts:320`** sobre P1 (centro A) no devuelve ninguna `nota_sin_firmar`. | La misma consulta devuelve la `consentimiento_pendiente` de P1, insertada como postgres en el centro A. Mutante: quitar `tipo = 'consentimiento_pendiente'` hace que TEC1 vea la `nota_sin_firmar`. |
| E2 | Nadie cierra a mano una nota pendiente. | Como PRO1, `update alertas_documentacion set estado = 'resuelta', resuelta_en = now()` sobre su `nota_sin_firmar` lanza 42501. | Como PRO1, el mismo update sobre una `consentimiento_pendiente` suya entra. Firmar (molde del 20) la resuelve. |
| E3 | El instante no se mueve. | Como PRO1, `set referencia_en = now()` lanza 42501, y `set profesional_id = PRO2` y `set tipo = 'consentimiento_pendiente'` también. | Como postgres, el `update` de relleno entra, porque el disparador solo actúa con `authenticated`. |
| E4 | El insert no fija el instante. | Como PRO1, insertar una alerta con `origen_tabla = 'citas'` y `referencia_en = '2000-01-01'` hace que la fila quede con `referencia_en = citas.fin`. | — |
| E5 | Están los permisos y el cron. | `has_function_privilege('authenticated', 'public.escalar_notas_pendientes()', 'execute') = false`, y lo mismo para `anon` en las cuatro funciones nuevas. `has_table_privilege('authenticated', 'public.notificaciones', 'insert') = false`. | `select count(*) from cron.job where jobname = 'escalar-notas-pendientes' = 1`. |

---

## 4 · Riesgos, por probabilidad

1. **Alta: la cabecera se queda atrás.** El layout no se repinta al navegar, así que el recuento
   y la campana se quedan con los datos del último pintado completo o de la última acción que
   revalidó el layout. Las acciones de otros tickets revalidan solo `/agenda` o `/pacientes`.
   Se mitiga así: la franja y el ancla viven en el cliente con su propio reloj, y lo único que
   se queda atrás son los números. Si molesta, el arreglo es que firmar (T-012) haga
   `revalidatePath('/', 'layout')`. Queda anotado, y no se toca aquí.
2. **Alta: pg_cron no está disponible o se instala en otro esquema** en la imagen local o en
   el alojado. Se mitiga con «Por confirmar» y con la prueba E5. Si no está, es un BLOQUEO del
   implementador, no una vuelta a otro mecanismo.
3. **Media: alertas que no se abren nunca.** Una cita marcada `realizada` antes de su `fin`, o
   que nunca se marca, no abre la alerta (H12). El escalado no ve lo que no existe. Es anterior
   a este ticket y queda en «Lo que no entra».
4. **Media: carrera con T-012 corte B y con T-038** por `lib/i18n/es.ts` y por `armazon.tsx`
   (T-038 convierte la identidad en un enlace). Son conflictos de texto, no de diseño, y se
   resuelven al integrar.
5. **Media: al admin no se le dice el paciente, pero en la agenda puede verlo**, porque ve
   todas las citas según la matriz. La notificación no expone más de lo que ya puede ver. Es
   coherente con la decisión 5, que habla de la historia y no de la agenda.
6. **Baja: hidratación distinta** si alguien añade un `new Date()` en el render del cliente.
   Lo cubre la prueba que espía `Date`.
7. **Baja: hora de la sesión en la notificación.** `to_char` en la zona del centro con
   `zona_horaria_centro()`: un centro sin zona hereda la de la organización.

---

## 5 · Qué revisar

**Entradas que elige el llamante, y su efecto:**
- `descartarFranja(citaId)`: un UUID cualquiera. Solo oculta franjas en el navegador de quien
  llama. Comprueba que se valida el formato, que la cookie tiene como máximo 20 entradas y que
  no tiene `maxAge`.
- `marcarNotificacionLeida(id)`: un UUID ajeno afecta a 0 filas, por la RLS. El valor de
  `leida_en` que manda el cliente se ignora, porque lo pone la base.
- El `update` directo sobre `notificaciones` por PostgREST: solo puede tocar `leida_en`, y solo
  de null a `now()`. Prueba cada columna del contrato: `titulo`, `detalle`, `tipo`,
  `origen_tabla`, `origen_id`, `perfil_id`, `creado_en` e `id`.
- El `insert` y el `update` directos sobre `alertas_documentacion`: `referencia_en` lo fija la
  base; la identidad, `tipo` y el instante no se mueven; una `nota_sin_firmar` no se cierra.

**Pruebas que deben fallar, y por qué motivo exacto:**
- C7 debe fallar con **42501 y el mensaje del disparador**. Si falla con 42703, la columna
  `titulo` no existe y la prueba no prueba nada.
- C5: la segunda llamada debe dar 0 filas y **ningún error**. Si da 23505, falta el `on conflict`.
- E1 debe usar **literalmente** la consulta de `datos.ts:320`, no una equivalente.

**Invariantes que podrían saltarse por otra puerta:**
- **Null:** `umbrales_escalado(null)` y un centro sin umbrales tienen que dar 24/72. Una
  `referencia_en` nula da `nivel` nulo, y esa alerta no escala ni cuenta. Comprueba que la
  columna es `not null`.
- **Duplicados:** dos ejecuciones del cron en paralelo chocan con el índice parcial, y el
  `on conflict` las absorbe. Un admin activado más tarde recibe la suya en la siguiente pasada
  (es lo deseado).
- **Concurrencia:** firmar mientras corre el escalado. Si la notificación ya se creó, se queda.
  Es histórica, no un error.
- **Permisos de tabla entera:** `notificaciones` sigue sin `insert`, `delete` ni `truncate`
  para `authenticated`. La vista nueva no tiene permisos para `anon`.
  `escalar_notas_pendientes()` no la ejecuta nadie más que el propietario (el cron). Revisa
  también los permisos por defecto que Supabase concede a las funciones nuevas (`revoke` explícito).
- **Seguridad de la vista:** `alertas_documentacion_nivel` **tiene que** llevar
  `security_invoker = true`. Sin eso, el técnico vería todas las alertas por la vista, aunque la
  tabla esté cerrada.
- **Disparador de protección:** tiene que ser **invoker**. Si es definer, `current_user` nunca
  es `authenticated` y no protege nada. Comprueba que el resolver de T-012 sigue cerrando la
  alerta (la prueba del módulo 20 sigue en verde).
- **`notas_clinicas`:** ni una referencia en la migración, en `lib/citas/avisos.ts` ni en los
  componentes (`grep notas_clinicas` sobre el diff).
- **Reloj:** ningún `new Date()` sin argumentos en `aviso-sesion.tsx` ni en `lib/agenda/avisos.ts`.
- **Foco:** nada de `autoFocus`, `.focus()` al aparecer, `role="alert"`, `alertdialog` ni
  `<dialog>` en los avisos. El único `.focus()` permitido es el del ancla, tras descartar.
- **Contenido clínico:** el `detalle` de `nota_pendiente_escalada` lleva solo el nombre del
  profesional y la fecha. El `titulo` es fijo.

---

## 6 · Territorio

```
supabase/migrations/20261006120000_avisos_y_escalado.sql
lib/supabase/tipos-bd.ts
lib/citas/avisos.ts
lib/citas/agenda.ts
lib/agenda/avisos.ts
lib/agenda/avisos.test.ts
lib/i18n/es.ts
components/armazon/armazon.tsx
components/armazon/armazon-cliente.tsx
components/armazon/aviso-sesion.tsx
components/armazon/aviso-sesion.test.tsx
components/armazon/aviso-notas.tsx
components/armazon/campana.tsx
components/armazon/campana.test.tsx
components/armazon/acciones-avisos.ts
components/armazon/acciones-avisos.test.ts
components/armazon/avisos-constantes.ts
app/(app)/agenda/bloques.ts
app/(app)/agenda/bloques.test.ts
app/(app)/agenda/documentacion.tsx
app/(app)/agenda/documentacion.test.tsx
scripts/rls/22-avisos.sql
scripts/rls/README.md
scripts/rls/11-cobertura.sql        # solo si hay que declarar algo nuevo
accesibilidad/avisos.spec.ts
docs/bitacora/T-015.md
docs/state.md
docs/interfaz.md                    # solo §Armazón: la campana y los avisos ya existen
```

`app/(app)/pacientes/**` queda **fuera**: la ficha se cierra con la RLS. Si el implementador
cree que tiene que tocarla, es un hallazgo, no una edición.

---

## 7 · Delegable (`delegable: volumen`)

- Las claves de `lib/i18n/es.ts` de §1.8, con los textos ya fijados.
- La presentación de cada elemento de la lista de la campana (título, detalle y fecha), como
  componente sin estado que recibe las props.
- Los fixtures de `lib/agenda/avisos.test.ts`.

**No es delegable:** la franja (foco, live region y reloj), la campana (Emergente y acciones),
las Server Actions, la migración ni el banco.

---

## Preguntas al propietario, con recomendación

| # | Pregunta | Recomendación |
|---|---|---|
| P1 | El contrato pide la Server Action «resolver una alerta». ¿La construimos? | **No.** Solo firmar cierra una `nota_sin_firmar`, y la base lo impone (E2). Hoy ningún otro tipo de alerta se genera, así que el botón no tendría ninguna acción real detrás. Volverá con el ticket que genere `consentimiento_pendiente`. |
| P2 | ¿El recuento destacado de la cabecera cuenta el nivel 1? | **No**: solo los niveles 2 y 3. El nivel 1 es la presencia discreta en Agenda y en la ficha de la cita. Encender la cabecera nada más acabar cada sesión sería la alerta que deja de leerse. |
| P3 | ¿El nivel 2 crea también una notificación `nota_pendiente` al profesional? | **No.** La cabecera ya lo destaca. El tipo queda en el catálogo, pero ninguna función lo genera. |
| P4 | ¿Qué administradores reciben el nivel 3? | **Todos los activos.** Hoy los administradores no tienen centro. |
| P5 | La pregunta heredada de T-011a sobre qué significa «entregado» en el outbox. | **Se aplaza al ticket que escriba el consumidor del outbox.** T-015 no lo escribe (D3), así que no hay barrido que pueda saltarse eventos. |
| P6 | ¿pg_cron o cron de Vercel? | **pg_cron** (ADR-024 admite los dos). |
| P7 | ¿Columna `titulo` o etiqueta derivada del tipo? | **Las dos.** La columna existe y la escribe quien genera; si es nula, se usa la etiqueta del tipo (D2). |
| P8 | ¿El administrador sigue viendo todas las alertas en la RLS? | **Sí.** Así lo dice la matriz, y le hace falta para la agenda. Lo que cambia es su cabecera, que solo cuenta las suyas (D5). |

---

## Por confirmar al implementar

1. **pg_cron**: con la base libre, `select * from pg_available_extensions where name = 'pg_cron'`.
   Mira con qué esquema lo instala la imagen local de Supabase (`with schema pg_catalog` o
   `extensions`) y si `cron.schedule` funciona dentro de `db reset`. Si no está disponible:
   BLOQUEO al orquestador.
2. **`fn_proteger_cita_pasada`** (T-011a): comprueba que, como postgres, el banco puede pasar a
   `realizada` una cita con `fin` en el pasado. Si no, copia el molde exacto de
   `15-agenda.sql`, que ya lo hace.
3. **Firma de `fn_auditar`**: el argumento exacto se copia del bucle de T-004. Comprueba que no
   hay ya un disparador `auditar_notificaciones` en `main` (H6 dice que no).
4. **Orden de los disparadores** BEFORE UPDATE en `alertas_documentacion`, si hay más de uno.
5. **El número 22 del banco**: comprueba que sigue libre cuando T-028a integre el 21.
6. **Inicio de sesión en Playwright**: si la spec de T-012 corte B no está en `main`, la spec
   de avisos se limita a lo que se puede comprobar sin sesión. Lo que no se pueda cubrir
   queda como criterio manual en la bitácora, y se dice.
7. **Plurales en `lib/i18n/index.ts`**: usa el mecanismo que exista. Si no hay plurales, dos
   claves (`…uno` y `…varios`).
8. **`Sesion`**: si `lib/supabase/sesion.ts` exporta ya el tipo, se usa ese.

---

## Lo que no entra, y por qué

- **El consumidor del outbox y la semántica de «entregado»**: el escalado no lo necesita (D3,
  P5).
- **Abrir alertas cuando una cita se marca `realizada` antes del `fin`, o no se marca nunca**:
  es un cambio en `fn_alertar_nota_sin_firmar` (T-010) que merece su propio ticket. Se anota
  en `state.md` §Hallazgos.
- **Notificaciones de acceso de emergencia**: el tipo está en el catálogo, pero lo genera el
  ticket del acceso de emergencia.
- **`pin_bloqueado` y `totp_repuesto`**: ya se generan (H7). Aquí solo se enseñan.
- **Tiempo real (Supabase Realtime) o sondeo**: los números de la cabecera se refrescan con las
  acciones y la navegación completa (riesgo 1).
- **Que firmar revalide el layout**: es de T-012. Se anota.
- **Una pantalla para configurar los umbrales**: el contrato pide que sean configurables por
  centro, no una pantalla. Se fijan por SQL hasta que la configuración del centro tenga la
  suya.
- **La ficha del paciente**: se cierra con la RLS (F), sin tocar `app/(app)/pacientes/**`.
- **Correo o push**: ADR-038, nunca.

---

## Decisiones del propietario (02-10-2026)

Se le explicaron antes los tres niveles (fin de cita → 24 h → 72 h, desde `citas.fin`) y el
impacto de cada opción.

| # | Decisión | Qué cambia respecto al diseño |
|---|---|---|
| P1 | **Sí se construye «resolver alerta», solo para tipos distintos de `nota_sin_firmar`.** La base sigue impidiendo cerrar a mano una nota pendiente (E2 intacto). | D6 deja de aplicar en su primera mitad: hay Server Action y botón. El botón solo se pinta sobre una alerta real de otro tipo; hoy nadie las genera, así que no aparece en ningún sitio hasta que exista el generador. |
| P2 | **El recuento de la cabecera cuenta solo los niveles 2 y 3.** | Ninguno (era la recomendación). |
| P3 | **El nivel 2 no notifica al profesional**: basta la cabecera. | Ninguno. El tipo `nota_pendiente` queda en el catálogo sin generador. |
| P4 | **El nivel 3 va a un administrador designado, con respaldo a todos los activos.** Un campo en `organizacion` (se fija por base hasta que Ajustes tenga pantalla). Si está vacío, o la persona ya no es `administrador` activo, se notifica a todos los administradores activos: el aviso nunca se pierde. | D13 cambia. Nueva columna y nueva gemela en C5. |
| P5–P8 | Se aceptan las recomendaciones: P5 aplazada al consumidor del outbox; P6 pg_cron; P7 columna `titulo` con respaldo a la etiqueta del tipo; P8 el administrador sigue viendo todas las alertas en la RLS. | Ninguno. |
