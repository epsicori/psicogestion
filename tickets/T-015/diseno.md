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
     «Una nota pendiente solo se cierra firmando la nota.» (E2; decisión P1).
   - Para los demás tipos (decisión P1, ver bloque J):
     - `old.estado = 'resuelta'` y cualquier cambio de `estado` o `resuelta_en`: 42501, con
       «Una alerta resuelta no se reabre.»;
     - `old.estado = 'abierta' and new.estado = 'resuelta'`: `new.resuelta_en := now()`. El
       reloj lo pone la base; el valor del cliente se ignora;
     - `old.estado = 'abierta' and new.estado = 'abierta'` con `resuelta_en` distinto de null:
       42501. El check de la tabla también lo impide, pero así el error es el mismo.

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
   Inserta una fila por cada **destinatario** y cada alerta que cumpla
   `estado = 'abierta' and tipo = 'nota_sin_firmar'` y `nivel_nota_pendiente(referencia_en, centro_id) = 3`.
   Los destinatarios salen de dos CTE (decisión P4):
   ```sql
   with designado as (
     select p.id from public.organizacion o
       join public.perfiles p on p.id = o.administrador_avisos_id
      where p.rol = 'administrador' and p.estado = 'activo'),
   destinatarios as (
     select id from designado
     union all
     select p.id from public.perfiles p
      where p.rol = 'administrador' and p.estado = 'activo'
        and not exists (select 1 from designado))
   ```
   - Si hay un designado y es administrador activo, va **solo a él**.
   - Si la columna está vacía, o la persona ya no es administrador activo, va a **todos los
     administradores activos**. El aviso nunca se pierde.
   - Si cambia el designado con una alerta todavía abierta, el nuevo la recibe en la siguiente
     pasada y el anterior conserva la suya. El índice de idempotencia es por destinatario.
     Se acepta: mejor dos avisos que ninguno.
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

**I. Administrador designado (decisión P4)**

1. Columna:
   ```sql
   alter table public.organizacion
     add column administrador_avisos_id uuid references public.perfiles (id) on delete set null;
   ```
   Es nula y no tiene valor por defecto: nula significa «todos los administradores activos».
2. Quién la escribe:
   - la política vigente `organizacion_modificacion_administrador` (solo el administrador;
     `20260822160000_rls_funciones_y_politicas.sql:773`). Sin política nueva;
   - mientras Ajustes no tenga pantalla, se fija por SQL. No hay acción ni control en la interfaz.
3. `fn_validar_administrador_avisos()`: definer, `search_path = ''`, en un disparador
   `before insert or update of administrador_avisos_id on public.organizacion`. Si el valor
   nuevo no es nulo y no es un perfil con `rol = 'administrador' and estado = 'activo'`, lanza
   23514 con «El administrador de avisos debe ser un administrador activo.». Se valida donde
   se escribe. Si esa persona pasa después a baja, no se toca la columna: el respaldo de G lo
   absorbe.
4. Comentario en la columna: «Destinatario del nivel 3 de la nota pendiente (T-015). Nula, o
   persona que ya no es administrador activo: se avisa a todos los administradores activos.»
5. La organización está auditada (T-004), así que el cambio de designado queda en `auditoria`.
   El implementador comprueba que `organizacion` está en el bucle de T-004; si no lo está, es
   un hallazgo, no se añade aquí.

**J. Resolver una alerta (decisión P1)**

No hace falta una función ni una política nuevas. Ya existen las cuatro piezas:

- **La política `alertas_documentacion_modificacion`** (H11) decide quién: el administrador,
  el profesional titular de la alerta (`profesional_id = uid`) y el profesional asignado al
  paciente. El técnico **no** tiene política de `update`.
  - Es lo que dice `docs/architecture.md` §Roles: la matriz no tiene fila propia para
    `alertas_documentacion`, que es tabla de Agenda. Lo que la matriz sí fija es que la
    documentación clínica del paciente es del profesional («Sus pacientes», «Autor o
    asignado») y que el administrador lo ve todo en Agenda.
  - Dar el `update` al técnico sobre `consentimiento_pendiente` sería una ampliación de
    permisos que la matriz no recoge. No entra (ver «Lo que no entra»).
  - Para el administrador y el profesional, el conjunto que puede leer es el mismo que puede
    modificar. Así que el botón nunca aparece sobre una alerta que la base le negaría.
- **El disparador de B.4**: congela la identidad, prohíbe cerrar una `nota_sin_firmar` y
  prohíbe reabrir, y fija `resuelta_en = now()`.
- **El check vigente** `estado = 'resuelta' ⇔ resuelta_en is not null`.
- **La auditoría**: el disparador genérico de T-004 en `alertas_documentacion` (H9) escribe el
  `UPDATE` con `actor_id = auth.uid()` (`20260829150000_auditoria_y_solo_adicion.sql`,
  cuerpo de `fn_auditar`).

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
- **Resolver una alerta** va en su propio fichero, porque es de Agenda y no del armazón. Ver §1.5b.

### 1.5b Resolver una alerta (decisión P1)

**`app/(app)/agenda/esquema-alertas.ts`** (sin `'use server'`; lo usan el formulario y la acción):
```ts
export const esquemaResolverAlerta = z.object({ alertaId: z.uuid() });
export type ResolverAlerta = z.infer<typeof esquemaResolverAlerta>;
```

**`app/(app)/agenda/acciones-alertas.ts`** (`'use server'`):
```ts
export type EstadoResolver = { ok: true } | { ok: false; error: 'invalida' | 'no_permitida' | 'fallo' } | null;
export async function resolverAlerta(_previo: EstadoResolver, datos: FormData): Promise<EstadoResolver>;
```
1. `exigirSesion()`.
2. `esquemaResolverAlerta.safeParse({ alertaId: datos.get('alertaId') })`. Si falla, devuelve
   `{ ok: false, error: 'invalida' }` sin llamar a Supabase.
3. Hace `update({ estado: 'resuelta', resuelta_en: new Date().toISOString() }).eq('id', id)
   .eq('estado', 'abierta').neq('tipo', 'nota_sin_firmar').select('id')`.
   - El `neq` es cinturón. La garantía es el disparador.
   - El valor de `resuelta_en` da igual, porque la base pone `now()`.
4. Resultados:
   - error con código 42501: `no_permitida`;
   - cero filas (alerta ajena, ya resuelta, inexistente o de tipo `nota_sin_firmar`):
     `no_permitida`. No se distingue cuál, para no hacer de oráculo;
   - otro error: `console.error` y `fallo`.
5. Si va bien: `revalidatePath('/agenda')` y `revalidatePath('/', 'layout')`. Devuelve `{ ok: true }`.

**`app/(app)/agenda/bloques.ts`** añade una función pura:
```ts
export function puedeResolverAlerta(rol: Rol | null, tipo: TipoAlerta): boolean;
// true solo si tipo !== 'nota_sin_firmar' y rol es 'administrador' o 'profesional_sanitario'
```

**Dónde se pinta:** `app/(app)/agenda/resolver-alerta.tsx` (`'use client'`), en cada
elemento del bloque «Documentación pendiente» (`documentacion.tsx`) **solo si**
`puedeResolverAlerta(rol, alerta.tipo)`.
- Es un `<form action={…}>` con `useActionState(resolverAlerta, null)`, un
  `<input type="hidden" name="alertaId">` y un botón secundario «Marcar como resuelta».
- El nombre accesible incluye el tipo: «Marcar como resuelta: {etiqueta del tipo}».
- Mientras va, el botón está deshabilitado y su texto es «Guardando…».
- Si devuelve error, un `AvisoDeError` (de `components/ui/piezas.tsx`) con `role="status"`
  junto al botón, con «No se ha podido marcar como resuelta.».
- Sin modal de confirmación: resolver no borra nada y queda auditado.
- **Hoy nadie genera alertas de otro tipo**, así que el botón no aparece en ninguna pantalla
  real hasta que exista su generador. Se prueba con fixtures (Vitest) y en el banco.
- La ficha del paciente (`app/(app)/pacientes/**`) **no** lleva el botón en este ticket
  (ver «Lo que no entra»).

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
| `agenda.documentacion.resolver` | `Marcar como resuelta` |
| `agenda.documentacion.resolverEtiqueta` | `Marcar como resuelta: {tipo}` |
| `agenda.documentacion.resolviendo` | `Guardando…` |
| `agenda.documentacion.errorResolver` | `No se ha podido marcar como resuelta.` |

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
- `app/(app)/agenda/documentacion.test.tsx` (o la prueba que ya exista de ese bloque):
  - la píldora sale de `nivel` y no de los días;
  - con una alerta `consentimiento_pendiente` y rol profesional, aparece «Marcar como resuelta»;
  - con `nota_sin_firmar`, no aparece;
  - con rol técnico, no aparece en ningún tipo.
- `app/(app)/agenda/bloques.test.ts`: la tabla completa de `puedeResolverAlerta` (3 roles
  más null, por 5 tipos).
- `app/(app)/agenda/acciones-alertas.test.ts` (con `exigirSesion` y Supabase simulados):
  - un `alertaId` que no es UUID devuelve `invalida` sin tocar Supabase;
  - cero filas devuelve `no_permitida`, y 42501 también;
  - si va bien, devuelve `ok` y llama a `revalidatePath('/agenda')` y
    `revalidatePath('/', 'layout')`;
  - la consulta lleva `.eq('estado','abierta')` y `.neq('tipo','nota_sin_firmar')`.

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
| D6 | **Decisión P1.** «Resolver alerta» se construye solo para los tipos distintos de `nota_sin_firmar`. Usa la política de update vigente más el disparador de B.4: sin función ni política nuevas. El botón solo se pinta donde `puedeResolverAlerta` es cierta. Una `nota_sin_firmar` solo la cierra la firma (E2). | Una función definer `resolver_alerta()`: duplicaría la decisión de quién puede, que ya toma la RLS. Dar el update al técnico sobre `consentimiento_pendiente`: la matriz no lo recoge. Dejar reabrir: rompería el escalado y la lectura de la auditoría. |
| D7 | Los umbrales siguen el patrón de herencia: organización `not null default`, centro nulo y una función efectiva que nunca da nulo. | Ponerlos en `preferencias_usuario` o en una tabla aparte: el contrato pide «por centro» y que herede como `retencion_efectiva()`. |
| D8 | Un disparador invoker protege las columnas de identidad y `referencia_en` de la alerta. | Confiar en la política de update: deja mover `profesional_id`, `tipo` o el instante, y con eso se esquiva el escalado. Un disparador definer: no vería `current_user = authenticated`. |
| D9 | La franja va en el flujo, debajo de la cabecera, y no es fija. | `fixed` o `sticky` abajo: a 360 px tapa la acción primaria y el teclado virtual (criterio 9). |
| D10 | El descarte se guarda en una cookie de sesión, `httpOnly`, escrita por una Server Action y leída en el layout. | `sessionStorage`: el servidor no la ve, así que la franja aparecería un instante en cada recarga, y se pierde al abrir otra pestaña. Una tabla: persiste más allá de la sesión del navegador, y el contrato pide lo contrario. |
| D11 | El reloj del cliente es `ahoraServidor + (performance.now() - t0)`, con un `setTimeout` al próximo cambio. | `new Date()` en el cliente: el contrato lo prohíbe para el primer pintado, y un reloj del navegador desajustado desplazaría la franja. Un `setInterval` de 1 s: es trabajo inútil y no da más precisión que ir al próximo cambio. |
| D12 | Los datos de avisos se leen en el layout y se refrescan con `revalidatePath('/', 'layout')` desde las acciones. | Un sondeo con una Server Action periódica: una acción es una mutación y no se usa para leer. Realtime de Supabase: está fuera de alcance (ver «Lo que no entra»). |
| D13 | **Decisión P4.** El nivel 3 va al administrador designado en `organizacion.administrador_avisos_id` (uuid, FK a `perfiles` con `on delete set null`, nula). Si está vacía o esa persona ya no es administrador activo, va a todos los administradores activos. El `detalle` es «{profesional} tiene sin firmar la nota de la sesión del {dd/mm}.». | Una tabla de destinatarios: el propietario pidió una persona. Un admin por centro: hoy los administradores no tienen centro. Fallar o no avisar si el designado no vale: el aviso no puede perderse. Que el `detalle` lleve el paciente: lo prohíben la decisión 5 y ADR-038. |
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
| C5 | **Automático.** A las 72 h hay **una** fila para el admin, y su `cuerpo` no lleva paciente. | Como postgres, sobre la cita de 73 h: `select public.escalar_notas_pendientes()` **dos veces**. Después: `count(*) = 1` en `notificaciones` con `perfil_id = ADM` y `origen_id = alerta`; el `detalle` no contiene `P1.nombre` ni `P1.apellidos` (`position(... in detalle) = 0` para cada uno) ni el texto de ninguna nota; contiene `nombre_completo` de PRO1. | La alerta de nivel 2 no genera ninguna fila. Si la alerta está resuelta (vía firma, o como postgres), escalar no crea nada nuevo. **Destinatarios (P4)**, con un segundo administrador ADM2 propio del módulo 22 y una alerta de 73 h nueva por escenario (las aserciones se hacen sobre el `origen_id` de ese escenario, antes de pasar al siguiente): (i) designado ADM2 activo: ADM2 = 1, ADM = 0 y total = 1; (ii) columna nula: ADM = 1, ADM2 = 1, y el total es igual al número de administradores activos; (iii) designado ADM2 y después `estado = 'baja'` en ADM2: ADM = 1 y ADM2 = 0. Además, designar a PRO1 lanza 23514, y designar a ADM2 activo entra. | Quitar el `on conflict`: la segunda llamada falla con 23505. Quitar el predicado del índice en el `on conflict`: error 42P10. Meter `p.nombre` en el `format`: falla `position = 0`. Quitar el `not exists (designado)`: falla (i), porque ADM recibe. Quitar el filtro de rol y estado en `designado`: falla (iii), porque ADM2 de baja recibe y ADM no. Ir siempre a todos: falla (i). |
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
| E6 | Resolver (P1): quién. Con una `consentimiento_pendiente` de P1 (PRO1, centro A, `origen_tabla = 'consentimientos'`), insertada como postgres. | Como TEC1: la ve (`select` = 1) pero `update … set estado='resuelta' … returning id` afecta a 0 filas. Como PRO2 sin asignar a P1: 0 filas. | Como PRO1: 1 fila, `estado = 'resuelta'`, y en `auditoria` hay una fila `UPDATE` de `alertas_documentacion` con `registro_id` = esa alerta y `actor_id = PRO1`. Como ADM, sobre otra igual: 1 fila. Mutante: añadir una rama de técnico a la política hace que TEC1 afecte a 1 fila. |
| E7 | Resolver (P1): el reloj y la vuelta atrás. | Como PRO1, `set estado = 'resuelta', resuelta_en = '2000-01-01'`: queda `resuelta_en` ≈ `now()`. Después, `set estado = 'abierta', resuelta_en = null` lanza 42501. | La gemela de la vuelta atrás es la propia resolución de E6. Mutante: quitar `new.resuelta_en := now()` deja el año 2000. Quitar la guarda de reabrir hace que el update entre. |
| E8 | Resolver no abre la puerta a `nota_sin_firmar`. | Es E2: ni PRO1 ni ADM la cierran por `update` (42501). | La firma la cierra (módulo 20 en verde). |

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

- `resolverAlerta(alertaId)` (P1): con un UUID cualquiera, la RLS decide. El técnico nunca
  modifica nada, porque no tiene política de update. Una `nota_sin_firmar` lanza 42501 desde
  el disparador. Una alerta resuelta no se reabre. Comprueba que la acción no hace de oráculo:
  ajena, inexistente o ya resuelta dan la misma respuesta.
- `organizacion.administrador_avisos_id` (P4): solo la escribe el administrador (política
  vigente) o el propietario de la base. Comprueba que el disparador rechaza a un no
  administrador o a un administrador inactivo, y que el escalado **no** confía en la columna
  sin volver a comprobar el rol y el estado en el momento de enviar (escenario iii).

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
- **Botón sin acción:** «Marcar como resuelta» nunca se pinta para el técnico ni sobre una
  `nota_sin_firmar` (`puedeResolverAlerta`). Para el administrador y el profesional, lo que
  ven es lo que pueden modificar. Si alguien amplía la lectura sin ampliar el update, esto
  deja de ser cierto.
- **Designado borrado:** `on delete set null` hace que se avise a todos, nunca a nadie.
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
app/(app)/agenda/esquema-alertas.ts
app/(app)/agenda/acciones-alertas.ts
app/(app)/agenda/acciones-alertas.test.ts
app/(app)/agenda/resolver-alerta.tsx
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
| P1 | El contrato pide la Server Action «resolver una alerta». ¿La construimos? | **Resuelta (02-10-2026): sí, solo para tipos distintos de `nota_sin_firmar`.** Diseño en §1.1 J, §1.5b, D6 y E6-E8. |
| P2 | ¿El recuento destacado de la cabecera cuenta el nivel 1? | **No**: solo los niveles 2 y 3. El nivel 1 es la presencia discreta en Agenda y en la ficha de la cita. Encender la cabecera nada más acabar cada sesión sería la alerta que deja de leerse. |
| P3 | ¿El nivel 2 crea también una notificación `nota_pendiente` al profesional? | **No.** La cabecera ya lo destaca. El tipo queda en el catálogo, pero ninguna función lo genera. |
| P4 | ¿Qué administradores reciben el nivel 3? | **Resuelta (02-10-2026): un administrador designado** (`organizacion.administrador_avisos_id`), con respaldo a todos los activos. Diseño en §1.1 G e I, D13 y C5. |
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
9. **Auditoría de `alertas_documentacion` y de `organizacion`**: comprueba en
   `20260829150000_auditoria_y_solo_adicion.sql` que las dos están en el bucle de T-004. E6
   depende de la primera.
10. **`Rol` y `TipoAlerta`**: usa los tipos que ya existan en `lib/supabase/tipos-bd.ts` o en
    `bloques.ts`. No crees otros.
11. **ADM2 en el banco**: se crea en el módulo 22 con el molde de `01-fijacion.sql`
    (`auth.users` más `perfiles`), con un UUID propio del módulo.

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
  Por eso tampoco lleva el botón «Marcar como resuelta». Si el propietario lo quiere ahí, es
  una ampliación de territorio.
- **Que el técnico resuelva `consentimiento_pendiente`**: la matriz de `docs/architecture.md`
  no le da escritura sobre la documentación del paciente. Si se quiere, es una pregunta al
  propietario con su ADR, no una política de este ticket.
- **La pantalla de Ajustes para elegir el administrador designado**: se fija por SQL hasta
  que Ajustes la tenga (decisión P4).
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

---

## Adenda ronda 2 (03-10-2026)

Responde a la revisión de la ronda 1 (`tickets/T-015/revision.md` y `revision.json`, commit
`1faf4c4`: 0 ALTA, 7 MEDIA y 7 BAJA). Las secciones anteriores siguen vigentes **salvo en lo
que esta adenda sustituye de forma expresa** (§R1.4 C5, Riesgo 1 y §6). Si chocan, manda la
adenda.

### R0 · Hechos verificados contra el código

Los hechos de la rama se han comprobado en el worktree `.claude/worktrees/agent-a95f0ec47e63493e3`
(HEAD `1faf4c4`) y los de la base, con `psql` en `supabase_db_Psicogestion`, que tiene aplicada
la migración de la ronda 1.

| # | Hecho | Dónde |
|---|---|---|
| R0.1 | En la base, las restricciones de `estado` se llaman `alertas_documentacion_estado_check` (`estado in ('abierta','resuelta')`) y `alertas_documentacion_check` (`(estado='resuelta') = (resuelta_en is not null)`). `alertas_documentacion_origen_tabla_check` ya admite `'citas'`. | `pg_constraint`; DDL en `20260822094547_…:874-876` |
| R0.2 | Disparadores AFTER UPDATE sobre `citas`: `alertar_nota_sin_firmar` (OF estado) y `auditar_citas`. Sobre `alertas_documentacion`: `auditar_alertas_documentacion` (`fn_auditar('id')`, AFTER I/U/D), `proteger_alerta_documentacion` (BEFORE UPDATE, invoker) y `fijar_referencia_alerta` (BEFORE INSERT). La tabla no tiene `FORCE ROW LEVEL SECURITY`. | `pg_trigger`, `pg_class.relforcerowsecurity = f` |
| R0.3 | **Todos los lectores filtran `estado = 'abierta'`**: la ficha (`app/(app)/pacientes/[id]/datos.ts:328`), la bandeja (`lib/citas/agenda.ts:225`), el punto de la cita en `agenda_citas_rango` (`20260926120000_…:154-158`), la vista del nivel (el nivel solo se calcula si está `abierta`, migración `:283`), el recuento (`:308`) y el escalado (`:416`). Por tanto, un tercer estado no aparece en ninguna pantalla. | ídem |
| R0.4 | La siembra crea una `nota_sin_firmar` con `origen_tabla = 'notas_clinicas'`, además de las de `'citas'`. | `select … group by tipo, origen_tabla` en la base local; `supabase/seed-completo.sql` |
| R0.5 | `notificaciones_origen_unico` es `(perfil_id, tipo, origen_tabla, origen_id) where origen_id is not null`, y `origen_tabla` es texto libre (solo se exige que no esté vacío). | `pg_indexes`, `pg_constraint` |
| R0.6 | El escalado escribe `origen_tabla = 'alertas_documentacion', origen_id = a.id`. | migración `:404-405` |
| R0.7 | El proxy redirige a `/login` toda ruta no pública sin usuario (`proxy.ts:59-81`), y a `/primera-vez` si falta un paso del primer acceso (`:100-114`). Llama a `getUser()` en cada petición, y **«esta llamada es la que refresca el token»** (`proxy.ts:54-57`). | `proxy.ts` |
| R0.8 | **Decisión fundacional: «sesión de 30 min de inactividad»** (`docs/decisions/fundacionales.md:44`). En local es `inactivity_timeout = "30m"` y `jwt_expiry = 1800` (`supabase/config.toml:165`, `:283-291`): «sin actividad durante este tiempo, GoTrue invalida la sesión y el refresco falla». | ídem |
| R0.9 | `exigirSesion()` hace `redirect('/login')` y `obtenerUsuario()` devuelve `usuario: null` sin redirigir. | `lib/supabase/sesion.ts:9-27` |
| R0.10 | Next 16.3.1: los layouts no se vuelven a pintar al navegar (`01-getting-started/03-layouts-and-pages.md:43`). `template.tsx` no envuelve el layout de su segmento (`03-file-conventions/template.md`). Un GET de Route Handler con Cache Components se ejecuta en cada petición si toca `cookies()`, `connection()` o la base (`01-getting-started/15-route-handlers.md:89`, `:122`). `usePathname` puede suspender y necesita `<Suspense>` (`04-functions/use-pathname.md:70-77`). Hoy ya se usa así dentro de una ranura con `<Suspense>` (`components/armazon/navegacion.tsx:34`). | docs de `node_modules/next` |
| R0.11 | `router.refresh()` vuelve a pedir los layouts, pero si la petición falla (red, redirección o error del servidor) cae a una navegación MPA completa: la página se recarga entera. | `next/dist/client/components/router-reducer/reducers/refresh-reducer.js` y `ppr-navigations.js` (comprobado en la sesión anterior) |
| R0.12 | «If the Server Function inside `useTransition` throws, the error is forwarded to the nearest error boundary». `app/` no tiene `error.tsx` ni `global-error.tsx`. | `02-guides/interactive-apps.md:174`; `ls app` |
| R0.13 | En la campana, «Marcar como leída» se desmonta al marcar (`campana.tsx:53-58`) y «Marcar todas» desaparece con `sinLeer = 0` (`:119-125`). Las transiciones de `:77-80` y `:86-89` no llevan `try`. El panel del `Emergente` es `role="dialog"` con `tabIndex={-1}` y atrapa el foco (`components/ui/emergente.tsx:27-28`, `:56-63`). | ídem |
| R0.14 | `ResolverAlerta` pone `disabled={pendiente}` (`resolver-alerta.tsx:28`), y su `status` vive dentro del `<form>`, que se desmonta con la fila. `Documentacion` es un componente de servidor. `Marco` pinta `MarcoBloque` con `id="agenda-documentacion"`, que es el `id` del `<h2>` (`documentacion.tsx:23-29`, `marco.tsx`). | ídem |
| R0.15 | `useInstante` no reinicia `instante` cuando cambia `base` (`aviso-sesion.tsx:46-70`). `descartar` espera la acción sin `try` (`:111-118`). | ídem |
| R0.16 | Una spec de Playwright ya prepara datos en la base con `ejecutarSql` (`scripts/psql.mjs`) y `contenedorDelProyecto()`. | `accesibilidad/codigos-recuperacion.spec.ts:1-8`, `:139` |
| R0.17 | `scripts/rls/01-fijacion.sql:167` tiene un comentario que dice «solo tiene DOS estados reales». No es una aserción, así que no rompe nada; queda desfasado y está fuera del territorio. | ídem |
| R0.18 | Vitest corre en `jsdom` por defecto (`vitest.config.ts`). No existe `lib/citas/avisos.test.ts`. | ídem |
| R0.19 | `20261006120000` no está en `main` (la última es `20261005120000`), y la regla 6 del linter de migraciones solo compara las que ya están en `main`. **Se edita en su sitio.** | `git ls-tree main supabase/migrations`; `scripts/lint-migraciones.ts` |

### R1 · A-H2 — la alerta de una cita que deja de ser `realizada`

**Decisión.** Un tercer estado, **`anulada`**. Lo pone **solo la base**, cuando la cita sale de
`realizada`. Nada se borra y nada se marca como «resuelta», que sería falso: la nota no se ha
firmado. La alerta anulada queda como hecho histórico y auditado.

**R1.1 · Cambios en `20261006120000_avisos_y_escalado.sql` (editada en su sitio, bloque B)**

1. Dominio y columna, en este orden y antes de crear la vista del bloque D:
   ```sql
   alter table public.alertas_documentacion
     add column anulada_en timestamptz,
     drop constraint alertas_documentacion_estado_check,
     add constraint alertas_documentacion_estado_check
       check (estado in ('abierta', 'resuelta', 'anulada')),
     add constraint alertas_documentacion_anulada_check
       check ((estado = 'anulada') = (anulada_en is not null));
   ```
   - `alertas_documentacion_check` (la de `resuelta`) no se toca. Una `anulada` tiene
     `resuelta_en` nulo, así que la cumple.
   - Es una columna nula sin valor por defecto y un dominio que se amplía: nada destructivo.
   - La vista `alertas_documentacion_nivel` enumera sus columnas, así que no cambia.
2. Una función y un disparador nuevos:
   ```sql
   create function public.fn_anular_alerta_nota_sin_firmar()
   returns trigger language plpgsql security definer set search_path = '' as $$
   begin
     update public.alertas_documentacion
        set estado = 'anulada', anulada_en = now()
      where origen_tabla = 'citas' and origen_id = new.id
        and tipo = 'nota_sin_firmar' and estado = 'abierta';
     return null;
   end; $$;
   revoke execute on function public.fn_anular_alerta_nota_sin_firmar() from public, anon, authenticated;
   create trigger anular_alerta_nota_sin_firmar
     after update of estado on public.citas
     for each row
     when (old.estado = 'realizada' and new.estado is distinct from 'realizada')
     execute function public.fn_anular_alerta_nota_sin_firmar();
   ```
   - **Definer**, porque el técnico cambia el estado a través de `agenda_actualizar_cita`
     (definer) y el titular lo hace en directo. En los dos casos la guarda invoker de
     `alertas_documentacion` ve `current_user <> 'authenticated'` y deja pasar.
   - **No lee `notas_clinicas`** (contrato). Lleva su `comment on function`.
   - **Auditoría**: la escribe `auditar_alertas_documentacion` en la misma transacción que
     la de la cita, con `actor_id = auth.uid()`, es decir, quien corrigió la cita.
3. La guarda `fn_proteger_alerta_documentacion` (para `authenticated`) queda así:
   - La lista congelada suma **`id`** (A-H1) y **`anulada_en`**. Mismo mensaje: «Una alerta
     no cambia de identidad ni de instante.».
   - Nueva rama, la **primera** tras la lista congelada: si `new.estado = 'anulada'` y
     `old.estado is distinct from 'anulada'`, lanza 42501 con «Solo la corrección de la cita
     anula una alerta.».
   - La rama «resuelta no se reabre» pasa a ser «`old.estado <> 'abierta'` y cambia
     `estado` o `resuelta_en`», con el mensaje «Una alerta cerrada no se reabre.». Cubre
     `resuelta` y `anulada`.
   - Lo demás queda igual, incluida la rama de `nota_sin_firmar`.
4. El escalado (bloque G) cambia el origen de la notificación: **`origen_tabla = a.origen_tabla,
   origen_id = a.origen_id`**, es decir, *lo que falta*, no la fila de la alerta.
   - Así la idempotencia es por cita y destinatario. Si la cita se anula y vuelve a
     `realizada`, la alerta nueva no genera un segundo aviso al administrador por la misma
     sesión.
   - Es genérico a propósito: la `nota_sin_firmar` de la siembra con
     `origen_tabla = 'notas_clinicas'` (R0.4) sigue escalando una vez.
   - El `comment on function` se ajusta.

**R1.2 · Qué pasa en cada caso**

| Secuencia | Resultado |
|---|---|
| Cita `realizada` con alerta abierta, corregida a `no_asistida`, `cancelada`, `programada` o `confirmada` | La alerta pasa a `anulada` con `anulada_en = now()`. Sale del recuento, de la bandeja, de la ficha y del escalado (R0.3). Queda una fila `UPDATE` en `auditoria`. |
| Lo mismo, pero con la nota ya firmada (alerta `resuelta`) | No se toca: el `where estado = 'abierta'` la excluye. |
| La cita vuelve a `realizada` | `fn_alertar_nota_sin_firmar` (sin cambios) abre **una alerta nueva**: la anulada no está abierta y el índice parcial no choca. Si para entonces hay una versión de nota, no abre nada, como hoy. `referencia_en` vuelve a ser `citas.fin` (bloque B), así que el nivel cuenta desde la sesión, no desde la corrección. |
| La reabierta llega al nivel 3 y el administrador ya fue avisado por esa cita | `on conflict … do nothing`: cero filas nuevas. |
| La reabierta llega al nivel 3 y nunca se avisó | Una fila: es verdad que la nota de una sesión realizada lleva más de 72 h sin firmar. |
| Un usuario intenta poner `anulada` a mano, reabrir una anulada o tocar `anulada_en` | 42501. |
| El cron escala en el mismo instante en que se corrige la cita | Puede quedar una notificación emitida para una alerta que acaba de anularse. Se acepta: la notificación es un hecho fechado (ADR-038) y la corrección queda en la agenda y en la auditoría. |

**R1.3 · PREGUNTA AL PROPIETARIO (A-H2).** Si el administrador ya recibió el aviso de nivel 3
y después la cita se corrige a «no asistió», ¿hay que mandarle un aviso de rectificación?
**Recomendación: no, en este ticket.** El aviso decía algo cierto cuando se emitió, la
corrección queda auditada y un segundo aviso duplica ruido. Si se quiere, va en el ticket que
consuma el outbox. El diseño no depende de la respuesta.

**R1.4 · C5 cambia.** Donde §3 C5 dice `origen_id = alerta`, ahora es
`origen_tabla = 'citas' and origen_id = <cita>`. El resto de C5 sigue igual.

### R2 · B-H1 — cómo se mantienen al día la franja, el ancla, el recuento y la campana

**Diagnóstico aceptado.** El Riesgo 1 del diseño era falso. El layout del grupo `(app)` no se
vuelve a pintar al navegar (R0.10). Las acciones de la agenda solo revalidan `/agenda` y el
horizonte es de 12 h. Así que la lista de sesiones es una foto de la última vez que se pintó
el layout.

**Restricción que manda (R0.7, R0.8).** La sesión caduca a los **30 minutos sin actividad**.
Cada petición pasa por el proxy, que llama a `getUser()` y renueva el token. Un sondeo con
temporizador mantendría viva la sesión de una pestaña abierta en una consulta vacía, y eso va
contra la decisión fundacional. **Por eso no hay temporizador de red**: los avisos se refrescan
con **actividad del usuario**, que ya hace peticiones por sí misma.

**R2.1 · El mecanismo**

1. **Route Handler `app/api/avisos/route.ts`, solo `GET`** (de lectura; ninguna mutación, D12
   intacta).
   - Primera línea: `await connection()`.
   - Después, `obtenerUsuario()`. **No** `exigirSesion()`: un `redirect` en un `fetch` no
     sirve de nada. Sin usuario, devuelve `401` con cuerpo `{}`.
   - Con usuario: `ahora = new Date()`, la lectura común `leerAvisos(sesion, ahora)` (R2.2) y
     la cookie `franjas_descartadas`.
   - Si **cualquiera** de las tres lecturas falla, devuelve `503` y el cliente conserva lo que
     tenía. Así una caída momentánea de la base no apaga una franja en curso.
   - Si todo va bien, `200` con `Response.json(DatosAvisos)`.
   - Cabeceras siempre: `Cache-Control: private, no-store`. Nunca `Access-Control-Allow-*`.
     Sin `use cache` de ningún tipo (ADR-043).
2. **Lectura común en `lib/citas/avisos.ts`.**
   - Los tres lectores pasan a devolver `null` si hay error, en vez de ceros o `[]`:
     `leerSesionesPropias(...): Promise<SesionPropia[] | null>`,
     `leerRecuentoNotas(...): Promise<RecuentoNotas | null>` y
     `leerNotificaciones(...): Promise<NotificacionVista[] | null>`.
   - Nueva `leerAvisos(sesion, ahora)`, que los lanza en paralelo y devuelve
     `{ ahoraServidor, sesiones, recuento, notificaciones }` con los `null` tal cual.
   - El layout (`cargarAvisos` en `armazon.tsx`) usa `leerAvisos` y traduce cada `null` al
     valor por defecto de hoy, así que se comporta igual que en la ronda 1. El Route Handler
     traduce cualquier `null` a `503`.
3. **Tipos y validación en `lib/agenda/avisos.ts`** (puro, sin `server-only`).
   - Se mueve aquí la definición de `NotificacionVista`, y `lib/citas/avisos.ts` la vuelve a
     exportar, como ya hace con `SesionPropia` y `RecuentoNotas`.
   - Nuevos `esquemaDatosAvisos` (Zod) y
     `type DatosAvisos = { ahoraServidor: string; sesiones: SesionPropia[]; recuento: RecuentoNotas; notificaciones: NotificacionVista[]; descartadas: string[] }`.
   - Nueva `combinarAvisos(inicial: DatosAvisos, fresco: DatosAvisos | null): DatosAvisos`:
     devuelve `fresco` solo si existe y su `ahoraServidor` es **estrictamente posterior** al
     de `inicial`. Si no, devuelve `inicial`. Así gana siempre la foto más reciente, venga
     del layout (por ejemplo, tras el `revalidatePath('/', 'layout')` de «marcar como leída»)
     o del refresco.
4. **Cliente `components/armazon/avisos-vivos.tsx`** (`'use client'`).
   - `ProveedorAvisosVivos`: contexto con `fresco: DatosAvisos | null` y `refrescar()`. Va en
     `Armazon`, junto a `ProveedorAvisosSesion`, envolviendo `ArmazonCliente`.
   - `refrescar()`:
     - no hace nada si ya hay una petición en curso o si la última empezó hace menos de
       `REFRESCO_MINIMO_MS = 30_000` (medido con `performance.now()`);
     - si no, hace `fetch('/api/avisos', { cache: 'no-store', redirect: 'manual', headers: { accept: 'application/json' } })`;
     - **solo acepta** `res.status === 200`, con `content-type` que empiece por
       `application/json` y un cuerpo que pase `esquemaDatosAvisos`;
     - todo lo demás (rechazo de red, `opaqueredirect` del proxy, 401, 503, HTML, forma
       inválida) **se ignora en silencio** y se conserva lo que había. Un refresco de fondo
       no anuncia nada;
     - lleva un `AbortController` que se aborta al desmontar.
   - **Disparadores**, y no hay más (en particular, ningún `setInterval` ni `setTimeout` de red):
     1. **Cambio de ruta**: `RefrescoPorNavegacion`, un componente sin salida (`return null`)
        que llama a `usePathname()` y, cuando la ruta cambia respecto a la anterior (no en el
        primer montaje), llama a `refrescar()`. Va **dentro** de la ranura `avisos`, junto a
        `AnclaSesion` en `AvisosDeCabecera` y bajo su `<Suspense>`, para que `usePathname`
        no rompa el prerenderizado (R0.10).
     2. **Vuelta a la pestaña**: `visibilitychange` con `document.visibilityState === 'visible'`
        llama a `refrescar()`. El mínimo de 30 s ya filtra los vaivenes.
   - Los envoltorios de presentación `AnclaSesionViva`, `FranjaSesionViva`, `AvisoNotasVivo` y
     `CampanaViva` reciben `inicial: DatosAvisos`, hacen
     `const d = combinarAvisos(inicial, useContext(...).fresco)` y pintan el componente de
     siempre con sus props de siempre. **`AnclaSesion`, `FranjaSesion`, `AvisoNotas` y
     `Campana` no cambian de props.**
   - En `armazon.tsx`, `AvisosDeCabecera` y `FranjaDeSesion` pasan
     `inicial = await cargarAvisos()` (con `descartadas`) a los envoltorios.
5. **`useInstante` se resincroniza** (`aviso-sesion.tsx`). Cuando cambia `base` (llega otra
   foto), `instante` vuelve a `base` **en el mismo render**, con el patrón de «estado del
   render anterior»: `const [baseVista, setBaseVista] = useState(base); if (base !== baseVista) { setBaseVista(base); setInstante(base); }`.
   - **No** se hace con `key`, que remontaría la franja y perdería `ocultas`.
   - El efecto conserva `[base, sesiones]` como dependencias.
   - Como `combinarAvisos` solo admite fotos más nuevas, `base` nunca retrocede. Como mucho
     hay un salto atrás de la latencia de la red (segundos), y se acepta.
6. **Las franjas descartadas** que trae el refresco se suman a `ocultas` (la franja ya hace
   `descartadas ∪ ocultas`).

**R2.2 · Qué se invalida, cuándo y con qué coste**

| Disparador | Qué se vuelve a pedir | Coste por disparo |
|---|---|---|
| Navegación en el cliente (como mucho uno cada 30 s) | Solo `/api/avisos`: ni el layout ni la página. | Una petición: el proxy (`getUser` + `primerAccesoPendiente`) y el handler (`getUser` + `agenda_citas_rango` en 12 h + `recuento_notas_pendientes` + 2 lecturas de `notificaciones` + `organizacion`). Del mismo orden que la navegación que lo provoca. |
| Pestaña visible otra vez (como mucho uno cada 30 s) | Lo mismo. | Lo mismo. |
| «Marcar como leída» o «Marcar todas» | El layout entero, por su `revalidatePath('/', 'layout')`, que ya estaba en la ronda 1. | Sin cambios. |
| Pestaña quieta, sin tocarla | **Nada.** El reloj local sigue moviendo la franja y el ancla entre los inicios y fines **ya conocidos**. | Cero peticiones: la sesión caduca a los 30 min, como manda la decisión fundacional. |

**R2.3 · Retraso que queda (dicho, no escondido).** Una cita que alguien crea o cancela para
el profesional **después** de su última navegación no se ve hasta que vuelva a navegar o a la
pestaña. Las acciones de la agenda (`app/(app)/agenda/acciones.ts`, fuera del territorio)
siguen revalidando solo `/agenda`: marcar `realizada` desde la agenda no actualiza el recuento
de la cabecera hasta la siguiente navegación. Queda en `docs/state.md`.

**R2.4 · PREGUNTA AL PROPIETARIO (B-H1).** ¿Quiere que los avisos se refresquen **solos cada
pocos minutos**, aunque nadie toque la pantalla? Eso cubriría la cita creada «para dentro de
diez minutos» mientras el profesional no navega. El precio es que una pestaña abierta haría
peticiones sin parar, y **la sesión dejaría de caducar a los 30 minutos de inactividad**
(decisión fundacional). **Recomendación: no.** Refresco por actividad del usuario, como en
R2.1. Si dijera que sí, haría falta un ADR que matice la decisión fundacional y otro ticket
que separe el refresco de la renovación del token (toca `proxy.ts` y `lib/supabase/**`).

### R3 · B-H2 y B-H5 — fallos de las Server Actions: el patrón común

Regla para las tres piezas (campana, franja y resolver):

1. **Ninguna llamada a una Server Action puede rechazar hacia React.** Cada llamada va en
   `try { … } catch { resultado = { ok: false } }`. Así ningún fallo de red llega a una
   frontera de error (R0.12). No se añade `error.tsx`: está fuera del territorio y además
   sustituiría la pantalla, que es justo lo que no se quiere.
2. **Reversión visible**: si el resultado es `ok: false`, por rechazo o por la respuesta, el
   estado optimista vuelve atrás **y se anuncia**.
3. **Anuncio**: cada pieza tiene un `role="status"` **siempre montado** y fuera de lo que se
   desmonta.
   - El texto va en `<span key={n}>{texto}</span>`, y `n` sube con cada anuncio. Así un
     segundo fallo idéntico cambia el nodo y se vuelve a anunciar.
   - Nunca `role="alert"`: un fallo al marcar no interrumpe (ADR-047, como en la ronda 1).
4. **El `catch` no se traga una redirección de Next.** Si la sesión ha caducado, una acción
   con `exigirSesion()` sigue llevando a `/login`. Hay que comprobarlo a mano: Riesgo R6.2.

Aplicación a cada pieza:

| Pieza | Al fallar | Al acertar |
|---|---|---|
| Campana, una notificación | Vuelve a no leída. `status`: `notificaciones.errorMarcar` («No se ha podido marcar como leída.»). | `status`: `notificaciones.marcadaLeida` («Marcada como leída.»). |
| Campana, todas | Vuelven a no leídas las que se marcaron. `status`: `notificaciones.errorMarcarTodas` («No se han podido marcar como leídas.»). | `status`: `notificaciones.todasMarcadas` («Todas las notificaciones están marcadas como leídas.»). |
| Franja, «Descartar» | **Ni reversión ni anuncio.** Descartar es una preferencia de presentación. La franja sigue oculta en esta pestaña (`ocultas`) y el foco ya está en el ancla. Si la cookie no se guardó, la franja solo vuelve con una recarga completa. Enseñarla otra vez justo después de que alguien la haya quitado sería peor que el fallo. | Sin anuncio, como en la ronda 1. |
| Resolver alerta | `status` de la fila: `agenda.documentacion.errorResolver`, que se vuelve a anunciar con `n`. | `status` **del bloque**: `agenda.documentacion.resuelta` («Marcada como resuelta.»). Ver R4. |

- El `status` de la campana es un `<p role="status" className="sr-only">` **fuera** del
  `Emergente`, para que siga montado aunque se cierre el panel.
- `descartarFranja` pasa a devolver `Promise<{ ok: boolean }>`, como las otras dos acciones.
  Da `ok: false` si el id no es válido.
- `ResolverAlerta` deja de pasar `resolverAlerta` directamente a `useActionState`. Le pasa una
  función cliente que la envuelve en `try` y devuelve `{ resultado, intento }`, con
  `intento = (previo?.intento ?? 0) + 1`, y el `key` del `status` es `intento`. Se pierde la
  mejora progresiva sin JavaScript, que en esta aplicación no existe.

### R4 · B-H3 y B-H4 — adónde va el foco

| Caso | Destino del foco | Cómo |
|---|---|---|
| Campana: «Marcar como leída» y quedan otras sin leer | El botón «Marcar como leída» de la **siguiente** no leída en el orden que se veía al pulsar. Si era la última, la **anterior**. | El destino se calcula **antes** de cambiar el estado, sobre `ordenadas`, y se guarda en estado (`destinoFoco: id | 'panel' | null`). Un `useLayoutEffect` lo enfoca tras el commit. Cada botón lleva `data-marcar={id}`, y se busca dentro del diálogo con `closest('[role="dialog"]')` desde el botón pulsado. |
| Campana: «Marcar como leída» de la única sin leer | El **panel** (`role="dialog"`, ya tiene `tabIndex={-1}`, R0.13). | Igual, con `'panel'`. |
| Campana: «Marcar todas» | El **panel**. | Igual. |
| Campana: falla y revierte | El foco **no se mueve** del destino ya elegido. El fallo se anuncia (R3). | — |
| Resolver: mientras se envía | **Se queda en el botón.** | `aria-disabled={pendiente}` en lugar de `disabled`, y `onClick={(e) => { if (pendiente) e.preventDefault(); }}` para que un segundo Intro o clic no envíe dos veces. |
| Resolver: éxito (la fila desaparece) | El **contenedor del bloque**: `<div role="group" aria-labelledby="agenda-documentacion" tabIndex={-1}>`, con el anuncio «Marcada como resuelta.» en el `status` del bloque. | Nuevo `ProveedorResolucion` (cliente, en `resolver-alerta.tsx`) que pinta ese contenedor, el `status` del bloque y un contexto con `alResolver()`. Lo pinta `Marco` en `documentacion.tsx` **dentro** de `MarcoBloque` y **en todas las ramas** (lista, vacío y error), para que la posición en el árbol sea la misma y no pierda el estado cuando la última alerta pasa a «vacío». La función cliente de R3 llama a `alResolver()` tras un `ok: true`, y el proveedor enfoca el contenedor en un efecto. Da igual si ese commit llega antes o después de que desaparezca la fila: el contenedor no se desmonta. |
| Resolver: fallo | **Se queda en el botón**, ya habilitado. Anuncio en el `status` de la fila. | — |

No se toca `components/ui/emergente.tsx` (fuera del territorio): se usa el `tabIndex={-1}`
que ya tiene el panel.

### R5 · El resto de hallazgos

| Hallazgo | Arreglo |
|---|---|
| A-H1 | `id` entra en la lista congelada (R1.1.3). Además, con el origen = cita (R1.1.4), ni cambiando la clave primaria saldría un aviso doble. |
| A-H3 | E1 comprueba, como TEC1 y con una alerta de **cada uno** de los cinco tipos en el centro A (insertadas como postgres), que ve exactamente 1 (`consentimiento_pendiente`) y 0 de cada uno de los otros cuatro, con una aserción por tipo. |
| A-H4 | E3 tiene un `assert_lanza` por columna congelada, **once** en total: las nueve de antes más `id` y `anulada_en`. Todos con el fragmento «no cambia de identidad ni de instante». |
| A-H5 | Dos negativas nuevas en C5. (iv) Designar a un administrador **inactivo** (`estado = 'baja'`) lanza 23514; mata al mutante sin `p.estado = 'activo'` en el validador. (v) Designado ADM2 activo, después `perfiles.rol` de ADM2 pasa a `profesional_sanitario` (como postgres), y una alerta nueva de 73 h da ADM = 1 y ADM2 = 0; mata al mutante sin `p.rol = 'administrador'` en `designado`. Al final se restaura el rol de ADM2. |
| A-H6 | Una `consentimiento_pendiente` insertada como postgres, con `referencia_en` llevada a `now() - interval '4 days'` por `update` como postgres (la guarda solo actúa con `authenticated`). `escalar_notas_pendientes()` no crea ninguna notificación con ese `origen_id`, y el total de notificaciones no cambia. |
| B-H6 | `accesibilidad/avisos.spec.ts` añade una prueba **con contenido**. En `beforeAll`, como postgres con `ejecutarSql`, busca una cita no cancelada de Ana que abarque `now()`. Si no la hay, inserta una de 5 min que empiece hace 1 min, copiando paciente, centro y tipo de una cita existente de Ana. Ante una violación de exclusión (`23P01`), escoge otro hueco o usa la que choca, que también está en curso. A 360 px comprueba: la franja visible y con texto; el enlace «Notas» y «Descartar» dentro de la ventana (`x + width ≤ 360`) y con una altura de al menos 44 px; ningún ascendente `fixed` ni `sticky`; y que no hay desbordamiento horizontal. En `afterAll` pasa la cita **insertada** a `cancelada` (no se borra). Se mide con el mutante `whitespace-nowrap` en el párrafo de la franja, que debe hacer fallar la prueba. |
| B-H7 | **Lo aplica el orquestador, no el implementador** (`tickets/**`): la línea `territorio:` del contrato queda **sin comentario** (se pasa a la línea anterior como `# territorio: del diseño §6 y de la adenda ronda 2`) y la lista pasa a ser exactamente la de R7. Después, `node ~/.claude/pipeline/territorio.mjs T-015` tiene que listarla. |
| B-H8 | Se reescribe `docs/state.md` (sin ampliarlo, como mucho 80 líneas), con estos cambios. (a) La línea 6 y «En curso» dicen el estado real de T-015. (b) Se cierra el hallazgo de la ficha que leía todas las alertas, porque la RLS lo cierra (lo comprueba E1). (c) Notas nuevas: firmar una nota debería revalidar el layout (sin ticket); una cita marcada `realizada` antes de su fin no abre alerta; intermitencia de `16-series.sql`; el retraso de R2.3; y el comentario desfasado de `01-fijacion.sql:167` (R0.17). |

### R6 · Riesgos, por probabilidad

1. **La base local tiene aplicada la migración de la ronda 1.** Al editarla en su sitio,
   `supabase db reset` es obligatorio antes de `npm run seed`, del banco y de Playwright. Si
   no, el banco corre contra el esquema viejo.
2. **Un `catch` que se trague la redirección a `/login`.** Comprobación manual: borrar las
   cookies de sesión con la app abierta, pulsar «Marcar como leída» y ver que lleva a
   `/login`. Si no lleva, el `catch` hace `throw` cuando el error sea de redirección de Next
   (se identifica con lo que exporte `next/navigation` en 16.3.1; hay que leer la guía
   antes).
3. **`usePathname` fuera de un `<Suspense>`** rompe el build con
   `blocking-prerender-client-hook`. Va dentro de la ranura `avisos` (R2.1.4).
4. **Foco en la campana**: si el destino se calcula después de cambiar el estado, el orden
   ya ha cambiado (la leída baja al final) y el foco cae en la equivocada.
5. **Spec B-H6**: insertar una cita en curso puede chocar con la exclusión de solapes. Va
   resuelto en la propia spec (R5).
6. **Carrera entre el cron y la corrección de la cita**: aceptada (R1.2).
7. **`Response` en jsdom**: la prueba del Route Handler declara
   `// @vitest-environment node` en la primera línea.

### R7 · Territorio de la ronda 2 (lista exacta; sustituye a §6)

```
supabase/migrations/20261006120000_avisos_y_escalado.sql      # editada en su sitio (R0.19)
lib/supabase/tipos-bd.ts                                       # + anulada_en en alertas_documentacion
lib/citas/avisos.ts
lib/citas/avisos.test.ts                                       # nuevo
lib/citas/agenda.ts
lib/citas/agenda.test.ts                                       # ya tocado en la ronda 1, se regulariza
lib/agenda/avisos.ts
lib/agenda/avisos.test.ts
lib/i18n/es.ts
app/api/avisos/route.ts                                        # nuevo
app/api/avisos/route.test.ts                                   # nuevo
components/armazon/armazon.tsx
components/armazon/armazon-cliente.tsx
components/armazon/avisos-vivos.tsx                            # nuevo
components/armazon/avisos-vivos.test.tsx                       # nuevo
components/armazon/aviso-sesion.tsx
components/armazon/aviso-sesion.test.tsx
components/armazon/aviso-notas.tsx
components/armazon/aviso-notas.test.tsx                        # ya tocado en la ronda 1, se regulariza
components/armazon/campana.tsx
components/armazon/campana.test.tsx
components/armazon/acciones-avisos.ts
components/armazon/acciones-avisos.test.ts
components/armazon/avisos-constantes.ts
app/(app)/agenda/bloques.ts
app/(app)/agenda/bloques.test.ts
app/(app)/agenda/documentacion.tsx
app/(app)/agenda/documentacion.test.tsx
app/(app)/agenda/esquema-alertas.ts
app/(app)/agenda/acciones-alertas.ts
app/(app)/agenda/acciones-alertas.test.ts
app/(app)/agenda/resolver-alerta.tsx
app/(app)/agenda/resolver-alerta.test.tsx                      # nuevo
scripts/rls/22-avisos.sql
scripts/rls/README.md
scripts/rls/11-cobertura.sql        # solo si hay que declarar algo nuevo (no se prevé: no hay políticas nuevas)
accesibilidad/avisos.spec.ts
docs/bitacora/T-015.md
docs/state.md
docs/interfaz.md                    # solo §Armazón
```

Queda **fuera**, y tocarlo es un hallazgo y no una edición: `proxy.ts`, `next.config.ts`,
`components/ui/**`, `app/(app)/agenda/acciones.ts`, `app/(app)/agenda/marco.tsx`,
`app/(app)/pacientes/**`, `scripts/rls/01-fijacion.sql` y cualquier otra migración.

### R8 · Cómo se cierra cada hallazgo (prueba y mutante que debe matar)

| Hallazgo | Prueba | Mutante que debe hacerla fallar, y por qué |
|---|---|---|
| A-H2 | **22.E9.** Como PRO1, `update citas set estado='no_asistida'` sobre su cita realizada de 73 h con alerta abierta. Comprueba: la alerta queda `anulada` con `anulada_en` no nulo y `resuelta_en` nulo; `recuento_notas_pendientes()` baja en 1; `escalar_notas_pendientes()` no crea nada para esa cita; y hay una fila `UPDATE` en `auditoria` de esa alerta con `actor_id = PRO1`. **22.E10.** Como PRO1: `set estado='anulada', anulada_en=now()` sobre una `consentimiento_pendiente` da 42501 «Solo la corrección de la cita»; sobre la anulada, `set estado='abierta', anulada_en=null` da 42501 «no cambia de identidad». **22.E11.** Escalar (1 fila para ADM), anular, volver a `realizada` como PRO1: hay 2 alertas de la cita (1 `anulada` y 1 `abierta`, con `referencia_en = citas.fin`), y otro `escalar` deja el total de ADM para `('citas', cita)` en 1. **22.E12.** Una cita con la alerta ya `resuelta`, corregida a `cancelada`: la alerta sigue `resuelta`. **22.E5** suma: `fn_anular_alerta_nota_sin_firmar` es definer, tiene `search_path=''` en `proconfig` y `authenticated` no la ejecuta. | Sin el disparador: E9 ve `abierta`. Sin la rama `anulada` en la guarda: E10 entra. Con el origen `a.id`: E11 da 2. Sin `estado = 'abierta'` en el `where`: E12 falla (y además salta `alertas_documentacion_check`). Invoker en vez de definer: la guarda ve `authenticated` y E9 da 42501. |
| A-H1 / A-H4 | 22.E3 con once `assert_lanza`. | Quitar cualquier columna de la lista: falla su aserción. |
| A-H3 | 22.E1 con cinco aserciones por tipo. | Política `tipo <> 'nota_sin_firmar'`: TEC1 ve `borrador_abandonado` y falla. |
| A-H5 | 22.C5 (iv) y (v). | Los dos de la revisión. |
| A-H6 | 22.C5 consentimiento de 4 días. | Quitar `a.tipo = 'nota_sin_firmar'`: aparece una notificación. |
| C5 (cambio) | Las aserciones de C5 sobre `origen_tabla = 'citas' and origen_id = cita`. | Volver a `'alertas_documentacion', a.id`: el filtro da 0 y falla. |
| B-H1 | **`avisos-vivos.test.tsx`** (con `vi.mock('next/navigation')` para `usePathname`, `fetch` simulado y temporizadores falsos). (1) Al montar no hay `fetch`. (2) Cambiar la ruta hace 1 `fetch`, y otro cambio a los 10 s no hace ninguno. (3) Una respuesta con `ahoraServidor` posterior y una sesión que abarca ese instante pinta la franja; una anterior se ignora. (4) `fetch` rechaza: nada se rompe y la franja anterior sigue. (5) `status 401`, `type 'opaqueredirect'`, `content-type text/html` o un cuerpo sin `sesiones`: se ignoran. (6) `visibilitychange` a visible a los 31 s hace 1 `fetch`. (7) **Avanzar 2 h sin eventos: 0 `fetch`.** **`aviso-sesion.test.tsx`**: volver a pintar `FranjaSesion` con un `ahoraServidor` 31 min posterior, que cae dentro de una sesión, la muestra **sin avanzar los temporizadores**. **`route.test.ts`**: 401 sin usuario y sin ninguna lectura; 200 con `Cache-Control: private, no-store` y la forma de `DatosAvisos`; 503 si un lector da `null`; nunca `Access-Control-Allow-Origin`. **`lib/agenda/avisos.test.ts`**: `combinarAvisos` (más nueva, igual y más vieja) y `esquemaDatosAvisos`. **`lib/citas/avisos.test.ts`**: cada lector da `null` ante error. | Añadir un `setInterval` de red: falla (7). Quitar el mínimo de 30 s: falla (2). Aceptar cualquier `res.ok` sin mirar `content-type`, o seguir redirecciones: falla (5). Quitar la resincronización de `useInstante`: la franja no aparece hasta el temporizador. `combinarAvisos` con `>=`, o siempre `fresco`: falla el caso de la foto vieja. |
| B-H2 / B-H5 | **`campana.test.tsx`**: la acción **rechaza** y da `ok:false` (por separado, en una y en todas). Comprueba que no se lanza nada, que la notificación vuelve a no leída y que el `status` dice el error. Un segundo fallo idéntico cambia el nodo del `span` (`not.toBe(anterior)`). **`aviso-sesion.test.tsx`**: `descartarFranja` rechaza y la franja sigue oculta, el foco en el ancla y nada se lanza. **`resolver-alerta.test.tsx`**: rechaza y da `ok:false`, con anuncio, y el segundo fallo vuelve a anunciarse. | Quitar las reversiones: falla (B-H5, el mutante de la revisión). Quitar el `try`: la prueba recibe el rechazo. Quitar el `key`: falla la identidad del nodo. |
| B-H3 | `campana.test.tsx`: con dos sin leer, marcar la primera deja el foco en el botón de la otra; con una, en el `dialog`; con «Marcar todas», en el `dialog`. Nunca en `body`. | Quitar el `useLayoutEffect` del foco: `document.activeElement === body`. |
| B-H4 | `resolver-alerta.test.tsx`: mientras está pendiente el botón tiene `aria-disabled="true"`, **no** `disabled`, y sigue con el foco; un segundo clic no llama otra vez a la acción. Con éxito, y quitando la fila al volver a pintar, el foco va al `role="group"` y el `status` del bloque dice «Marcada como resuelta.». | Volver a `disabled`: pierde el foco. Quitar `preventDefault`: 2 llamadas. Poner el `status` dentro de la fila: el anuncio desaparece con ella. |
| B-H6 | `avisos.spec.ts` con contenido (R5). | `whitespace-nowrap` en el párrafo: desborda. |
| B-H7 | `node ~/.claude/pipeline/territorio.mjs T-015` lista la R7 y la rama no se sale. | — |
| B-H8 | `docs/state.md` como mucho 80 líneas y con los puntos de R5. | — |

Cierre de la ronda: `npx supabase db reset && npm run seed`, `npm run test:rls` (banco 22
completo), `npm test`, `npm run lint`, `npm run build` y
`PUERTO=… npx playwright test accesibilidad/avisos.spec.ts`.

### R9 · Qué revisar (lista de comprobación de esta ronda)

- **Base**:
  - ¿puede `authenticated` llegar a `anulada` por alguna puerta? Directa (E10), por la
    política de update o por una función definer que no sea el disparador;
  - ¿algún lector nuevo o viejo deja de filtrar `estado = 'abierta'` (R0.3)?;
  - ¿el disparador nuevo lee `notas_clinicas` (prohibido)?;
  - ¿el `when` del disparador abarca **toda** salida de `realizada`?;
  - ¿el escalado usa `a.origen_tabla, a.origen_id` y no un literal `'citas'`? (R0.4).
- **Migración editada en su sitio**: el linter pasa; no hay migración nueva; el `drop
  constraint` va en el mismo `alter` que su `add`.
- **Route Handler**:
  - sin `use cache`, con `connection()` lo primero, con `Cache-Control: private, no-store` y
    sin CORS;
  - no escribe nada: ni `cookies().set`, ni acceso a la historia, ni auditoría;
  - no expone más que lo que ya llevaba la carga útil RSC del layout.
- **Cliente**:
  - no hay **ningún** temporizador que haga peticiones (decisión fundacional de 30 min);
  - `redirect: 'manual'`;
  - la validación Zod de la respuesta;
  - una foto vieja nunca pisa a una nueva.
- **Fallos**:
  - ninguna Server Action se espera sin `try`;
  - todo `status` está montado **fuera** de lo que se desmonta;
  - ningún `role="alert"` nuevo;
  - el `catch` no se traga la redirección (R6.2, manual).
- **Foco**: ningún camino deja `document.activeElement === document.body` con el panel abierto
  o tras resolver; el destino de la campana se calcula **antes** de cambiar el estado.
- **Territorio**: la R7 exacta; nada en `proxy.ts`, `components/ui/**` ni `app/(app)/agenda/acciones.ts`.

### R10 · Delegable

- Las claves nuevas de `lib/i18n/es.ts` (R3 y R4), con los textos ya fijados.
- Volver a generar `lib/supabase/tipos-bd.ts` tras el `db reset`.
- Nada más: lo demás es foco, ARIA, red o base.

### R11 · Lo que no entra en la ronda 2, y por qué

- **Refresco periódico sin actividad del usuario**: va contra la decisión fundacional de
  sesión (R2.4, pregunta al propietario).
- **`router.refresh()`**: si falla la red, recarga la página entera y se pierde lo que
  hubiera sin guardar (R0.11). Además vuelve a pedir la página completa en cada disparo.
- **`template.tsx`**: no envuelve el layout, así que la cabecera y la franja no se vuelven a
  pintar (R0.10). Además reiniciaría el estado de los hijos.
- **Supabase Realtime**: abre un canal persistente con la clave anónima en el navegador, es
  otra superficie de RLS que probar y mantiene la conexión viva. Merece su propio ticket y
  quizá un ADR.
- **`revalidatePath('/', 'layout')` en las acciones de la agenda y en la firma de nota**:
  esos ficheros están fuera del territorio y la medida vuelve a pintar el árbol entero. Queda
  anotado (R2.3, B-H8).
- **Aviso de rectificación al administrador** tras una anulación: pregunta R1.3.
- **`error.tsx` o `global-error.tsx`**: fuera del territorio. Con R3, ningún fallo de estas
  piezas llega a una frontera.
- **Actualizar el comentario de `01-fijacion.sql:167`**: fuera del territorio. Se anota.

## Decisiones del propietario sobre la adenda (03-10-2026)

- **R1.3 · rectificación al administrador:** no, en este ticket. La alerta pasa a `anulada` y deja de contar
  y de escalar. El aviso de 72 h ya enviado se queda como registro histórico. Si hace falta rectificar, irá
  en un ticket aparte.
- **R2.4 · refresco con temporizador:** no. Los avisos se refrescan al navegar o al volver a la pestaña. Se
  mantiene el cierre de sesión a los 30 min de inactividad (decisión fundacional) y no hace falta ADR.
- **B-H7:** hecho en el contrato. La línea `territorio:` ya no lleva comentario y la lista es la de R7.
