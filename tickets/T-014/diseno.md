# T-014 · Diseño — Calendario: vista semanal, estados y ficha de cita

Arquitecto, 24-09-2026. Riesgo alto (`modelo: opus`). Contrato: `tickets/T-014-calendario-semanal.md`
(el `territorio:` lo añade este diseño; es lo único que se ha tocado del contrato).

> **BLOQUEO PARCIAL (lo decide el propietario en el gate; lo demás no espera).** El arrastre de una
> cita de serie con «esta y las siguientes» no puede hacer lo que su nombre promete con lo que T-011
> dejó en la base (§0, H9). Pregunta y opción recomendada en §2, D6. Todo el resto del diseño se
> implementa sin esa respuesta; solo la rama `esta_y_siguientes` de §1.6 espera.

---

## 0 · Hechos verificados contra el código

Leídos en `main` (`f9175e0`) y en la rama `T-014a-estado-cita` (`13373fe`).

| # | Hecho | Dónde |
|---|---|---|
| H1 | `esta_en_curso(p_cita_id uuid)`: `sql stable`, **security invoker** y sin `search_path`. Lee `public.citas`. Su comentario dice que «preguntar por una cita que no se puede ver devuelve falso». | `supabase/migrations/20260906120000_agenda_esquema.sql:312-336` |
| H2 | El técnico **no tiene política SELECT sobre `citas`**. Su única puerta es la vista `citas_agenda` (`security_invoker=false`, `security_barrier=true`), que no trae `tipo_terapia_id` ni `nota_operativa` y filtra con `rol_actual()='tecnico_administrativo' and centro_id in centros_actuales()`. **Consecuencia:** `esta_en_curso(id)` le devuelve siempre `false` al técnico, y llamarla cita a cita es N+1. | misma migración `:515-541` |
| H3 | `citas.motivo_desviacion` es del tipo `public.motivo_desviacion_cita` (`reprogramada`, `anomalia_horaria`, `festivo`, `ausencia`), con `check (desviada = (motivo_desviacion is not null))`. | `:50`, `:194`, `:202` |
| H4 | `agenda_actualizar_cita(p_cita_id, p_estado, p_sala, p_inicio, p_fin)` es security definer y autoriza a administrador, dueño y técnico de sus centros. Todo `update` de `citas` queda auditado por `auditar_citas`; `series_cita` y `propuestas_cita`, por `auditar_series_cita` y `auditar_propuestas_cita`. | `20260906120000:649-661`; `20260910120000:141` |
| H5 | `fn_proteger_cita_pasada()`: con `old.fin <= now()` no se puede mover (`42501`, mensaje con «pasada»). **No impide llevar una cita futura a un instante pasado.** | `20260910120000_series_materializacion_desviaciones.sql` |
| H6 | `fn_marcar_cita_desviada()`: si una cita de serie cambia `inicio`, `fin` o `zona` sin la marca `app.agenda_origen='serie'`, queda `desviada=true` con `motivo='reprogramada'`. | ídem |
| H7 | `agenda_editar_serie(..., 'esta', ...)` delega en `agenda_actualizar_cita`, así que la cita queda desviada. Con `'esta_y_siguientes'` **no mueve nada**: actualiza `series_cita` y llama a `agenda_propuestas_de_evento`. Con la cita suelta, `esta_y_siguientes` da `22023`. | ídem `:867-955` |
| H8 | `fn_evento_regla_serie` mete en el evento **todas** las citas de la serie con `inicio > now()`, en estado `programada` o `confirmada` y no desviadas. No parte de la cita elegida. | ídem `:503-509` |
| H9 | Con el motivo `regla_cambiada`, `agenda_propuestas_de_evento` propone para cada cita **su misma fecha de calendario** con la hora nueva: `v_local := (inicio at time zone zona)::date + hora_local`. El cambio de `dia_semana` y la duración nueva **no se aplican** a las citas ya materializadas. | ídem `:1031-1043` |
| H10 | `agenda_confirmar_propuesta` mueve la cita con la marca de origen `serie`, así que **no** queda desviada. Si la propuesta no tiene hora, falla con `22023`. | ídem `:1082-1175`; `lib/citas/tipos.ts:30-40` |
| H11 | `propuestas_cita` tiene política SELECT para administrador, dueño y técnico de su centro, y ninguna de escritura. `listarPropuestasPendientes(sesion)` ya la lee. | `lib/citas/propuestas.ts:33` |
| H12 | `alertas_documentacion`: `tipo='nota_sin_firmar'`, `origen_tabla='citas'`, `origen_id=cita.id`, `estado 'abierta'|'resuelta'` y `fecha_referencia date`. La rellena el disparador **solo** al pasar a `realizada` con `fin <= now()`. `fecha_referencia` se calcula en **UTC** (`(fin at time zone 'UTC')::date`). La lectura la tienen: administrador, `profesional_id = uid`, profesional asignado y técnico de sus centros. | `20260906120000:447-499`; `20260829120000_perfiles_centros_multicentro.sql:303-317` |
| H13 | Lectura de `pacientes` por el técnico: `centro_id in centros_actuales()`. `directorio_perfiles` (`id`, `nombre_completo`, `rol`, `estado`, `centro_id`) la lee todo perfil activo. `centros_lectura`: cualquier `rol_actual()` no nulo. `tipos_terapia` la leen los tres roles. | `20260829120000:291-297`; `20260822160000_rls_funciones_y_politicas.sql:779,1390-1405` |
| H14 | `zona_horaria_centro(p_centro_id uuid) returns text`: security definer; `coalesce(centro, organización, 'Europe/Madrid')`; **nunca nula**. Con `null` devuelve la de la organización. | `20260822094547…sql:1009` |
| H15 | **No hay color por profesional en la base.** `perfiles` tiene `id`, `nombre_completo`, `rol`, `creado_en`, más columnas de estado y centro; el único `color` es el de `tipos_terapia`. Tampoco hay columna de **modalidad** de la cita (`modalidad_relacional` es clínica, bajo el candado). | grep en `supabase/migrations/` |
| H16 | `colocarEnRejilla(citas, fecha, zona)` devuelve `{id, dia 0-6 lunes primero, inicioMinutos ABSOLUTOS, duracionMinutos, columna, columnasEnGrupo}`. Parte las citas que cruzan la medianoche y lanza si la fecha o la zona no son válidas. El domingo de marzo tiene 23 h: una cita a las 10:00 cae en el minuto 540. | `lib/agenda/rejilla.ts` |
| H17 | `formatearFechaSinZona` valida `AAAA-MM-DD` **y que el día exista** con un viaje de ida y vuelta por `Date.UTC`, pero no exporta el validador. `clasificarHoraLocal(fecha, hora, zona)` da `normal`, `inexistente` o `ambigua` con los instantes candidatos. | `lib/fechas/relativo.ts:13-40`; `lib/fechas/anomalias.ts:49` |
| H18 | `esquemaEditarSerie`: con `esta` no admite campos de regla y con `esta_y_siguientes` no admite `estado`, `sala`, `inicio` ni `fin`. `editarSerie()` devuelve `{alcance, propuestaIds}`. `esquemaDesplazarCita` usa `z.iso.datetime({offset:true})`. | `lib/citas/esquemas.ts:76-136`; `lib/citas/series.ts:96` |
| H19 | T-014a (`13373fe`, sobre `b7aeea2`) toca 4 ficheros: `components/ui/estado-cita.tsx` (con `EstadoVisibleCita` de seis valores, `PuntoEstadoCita({estado, conEtiqueta})` que **siempre** pasa `late` y `LeyendaEstadosCita`), su prueba, `app/globals.css` (`latido-estado`, `halo-estado`, `prefers-reduced-motion`) y `lib/i18n/es.ts` (`agenda.estados.*`, `agenda.leyendaEstados`). Desde `b7aeea2`, `main` no ha tocado esos ficheros: la mezcla no tiene conflictos. | `git show --stat 13373fe` |
| H20 | Hay **otro** `EstadoVisibleCita` en `lib/agenda/estados-cita.ts`, con `pasada_sin_marcar` y un `estadoVisible(cita, ahora)` que recibe el reloj de fuera. Sus claves de i18n son `agenda.estado.*` (en singular) y no existen en `es.ts`. | `lib/agenda/estados-cita.ts` |
| H21 | `Button` ya mide 44 px (`min-h-11` en `sm` y `md`). El hallazgo «Button 40 px» de `state.md` está **desfasado**. | `components/ui/button.tsx:19-20` |
| H22 | `Emergente` no sirve como panel del calendario: es su propio disparador con estado interno, va `absolute left-0 mt-2` y no se recoloca. `foco.ts` exporta `enfocables`, `useDevolucionDeFoco`, `useFocoAtrapado`, `useCierreExterior` (que cierra con Escape y con un `mousedown` fuera) e `indiceSiguiente` (que da la vuelta al llegar al final). | `components/ui/emergente.tsx`; `components/ui/foco.ts` |
| H23 | `app/page.tsx` ya redirige a `/agenda`; solo su comentario («`/agenda` todavía no existe») queda falso. En `modulos.ts`, Agenda tiene `disponible: false`. No existe `app/(app)/agenda/`. | `app/page.tsx`; `components/armazon/modulos.ts` |
| H24 | La cookie `centro_activo` la escribe el selector del armazón y **no la lee ninguna pantalla**. El armazón hace `await connection()` antes de `new Date()` y formatea la hora en servidor. | `components/armazon/armazon.tsx:118-128,160-190` |
| H25 | Next 16: en `page.tsx`, `searchParams` es una **Promise**. Tras una mutación, `revalidatePath` (patrón ya usado en `app/(app)/pacientes/acciones.ts`). | `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:67-79`; `…/01-getting-started/07-mutating-data.md:425` |
| H26 | El verificador de T-009 tiene dos partes. `lib/contraste/tokens.ts::PARES` es la lista **manual** de pares de tokens pintados; se amplía cuando una pantalla usa un par nuevo. `npm run test:a11y` (Playwright, `accesibilidad/`) solo cubre `/login`. | `lib/contraste/tokens.ts:36-58`; `playwright.config.ts` |
| H27 | La ruta de «Notas» (`/pacientes/<uuid>/historia/notas`) **no existe**: es de T-012, que va detrás de T-014 según `state.md`. | árbol de `app/(app)/pacientes/[id]` |
| H28 | `scripts/territorio.mjs` cuenta también los ficheros **no rastreados**. En el árbol principal hay tres que no son de este ticket: `.claude/agent-memory/`, `docs/metricas/` y `scratchpad_factor_resp.json`. | `~/.claude/pipeline/territorio.mjs`; `git status` |

---

## 1 · Piezas y contratos

### 1.0 · Rama e integración de T-014a (lo primero, antes de escribir nada)

```
git worktree add ../Psicogestion-T014 -b T-014-calendario main
cd ../Psicogestion-T014
git merge --no-ff T-014a-estado-cita -m "T-014: integra T-014a (punto de estado, leyenda y latido, 13373fe)"
```

- Se usa **merge** y no cherry-pick: conserva el commit de MiniMax con su historia de revisión (`minimax/revisiones/T-014a.md`). Según H19 no hay conflictos.
- La rama `T-014a-estado-cita` y su worktree se retiran al integrar T-014, no antes.
- **Todo el trabajo va en ese worktree.** En el árbol principal, el guardarraíl de territorio lee los no rastreados de H28 y sale en rojo.

### 1.1 · Migración `supabase/migrations/20260924180000_agenda_citas_rango.sql`

Hacia delante y sin destruir nada. Tres objetos.

**(a) La regla de «en curso», escrita una sola vez (ADR-045)**

```sql
create function public.cita_en_curso(p_inicio timestamptz, p_fin timestamptz, p_estado public.estado_cita)
returns boolean language sql stable security invoker set search_path = ''
as $$ select now() >= p_inicio and now() < p_fin and p_estado not in ('cancelada','no_asistida') $$;
```

- `revoke all … from public, anon` y `grant execute … to authenticated`.
- Comentario: es la única copia de la regla; el intervalo es semiabierto.

**(b) `esta_en_curso(uuid)` se reescribe para delegar en (a)**

- Misma firma, mismo tipo de retorno, sigue **invoker**.
- Cuerpo: `select coalesce((select public.cita_en_curso(c.inicio, c.fin, c.estado) from public.citas c where c.id = p_cita_id), false)`.
- El comentario conserva el «devuelve falso si no la puedes ver» y añade «delega en `cita_en_curso`».

**(c) La lectura de la agenda por rango**

```sql
create function public.agenda_citas_rango(p_desde timestamptz, p_hasta timestamptz)
returns table (
  id uuid, paciente_id uuid, profesional_id uuid, centro_id uuid, serie_id uuid,
  inicio timestamptz, fin timestamptz, zona_horaria text, estado public.estado_cita,
  sala text, desviada boolean, motivo_desviacion public.motivo_desviacion_cita,
  tipo_terapia_nombre text,   -- NULL en la rama del técnico, por construcción
  nota_operativa text,        -- NULL en la rama del técnico, por construcción
  paciente_nombre text, paciente_apellidos text,   -- NULL si la RLS de pacientes no deja
  profesional_nombre text, centro_nombre text,
  en_curso boolean,           -- public.cita_en_curso(...)
  reprogramable boolean,      -- inicio > now() and estado in ('programada','confirmada')
  nota_pendiente boolean      -- NULL en la rama del técnico; si no, hay alerta abierta
)
language sql stable security invoker set search_path = ''
```

Cuerpo, en este orden:

1. **Guarda.** Si `p_desde` o `p_hasta` son nulos, si `p_hasta <= p_desde` o si `p_hasta - p_desde > interval '62 days'`, se lanza `22023`. Como la función es `language sql`, la guarda se escribe con una CTE que llame a una función auxiliar plpgsql `pg_temp`-free, o se hace **toda la función plpgsql con `return query`**. El implementador elige la segunda forma, que es más legible.
2. **CTE `visibles`**, un `union all` de dos ramas:
   - `from public.citas c`, donde la RLS da filas al administrador y al dueño, y **cero al técnico** (no tiene política). Trae `c.tipo_terapia_id` y `c.nota_operativa`.
   - `from public.citas_agenda a`, que da filas **solo al técnico** porque su `where` exige ese rol. Trae `null::uuid as tipo_terapia_id`, `null::text as nota_operativa` y una marca `true as rama_tecnico`; la otra rama lleva `false`.
   - Las dos filtran por solape: `inicio < p_hasta and fin > p_desde`. Así entran las citas que cruzan la medianoche o el borde del rango.
3. **Select final** con `left join` a `public.tipos_terapia` (por `tipo_terapia_id`), `public.pacientes`, `public.directorio_perfiles` (por `profesional_id`) y `public.centros`. Todos los joins pasan por la RLS de quien llama, porque la función es invoker.
4. **`nota_pendiente`** = `case when v.rama_tecnico then null else exists(select 1 from public.alertas_documentacion al where al.origen_tabla='citas' and al.origen_id=v.id and al.tipo='nota_sin_firmar' and al.estado='abierta') end`.
5. **Grants:** `revoke all … from public, anon, service_role` y `grant execute … to authenticated`.
6. **Comentario:** que las ramas son disjuntas por rol; que es invoker a propósito, porque en definer el técnico leería la organización entera; y que el tipo y la nota son NULL literales en la rama del técnico (choque 4 e invariante 3).

**Después:** `npx supabase db reset && npm run tipos`, lo que regenera `lib/supabase/tipos-bd.ts`.

### 1.2 · Pruebas de RLS `scripts/rls/18-agenda-rango.sql` (y una fila en `scripts/rls/README.md`)

Siguen el patrón de `15-agenda.sql`: `como()`, `assert`, `assert_lanza` y la fijación propia. Hacen falta dos centros, dos profesionales, un técnico del centro A y citas en los dos centros, entre ellas una que abarca `now()`, una cancelada que también lo abarca y una con alerta abierta.

| # | Aserción | Qué fallo detecta |
|---|---|---|
| R1 | El técnico ve solo las citas del centro A, y en todas `tipo_terapia_nombre is null` y `nota_operativa is null`. | Una rama del técnico que junte `tipos_terapia` a través de `citas`, o una función en definer. |
| R2 | El técnico recibe `en_curso = true` en la cita que abarca `now()`. | La regresión del H2: `esta_en_curso(id)` le daba falso. |
| R3 | El técnico recibe `nota_pendiente is null` aunque haya una alerta abierta. | Que la rama del técnico adelante estado documental por la puerta de la cita. |
| R4 | El profesional ve solo sus citas, con el tipo y la nota. | |
| R5 | El administrador obtiene el mismo número de filas que `select count(*) from citas` en el rango, leído como `postgres`. | Filas duplicadas por el `union all`. |
| R6 | `en_curso` es falso para la cancelada que abarca `now()`, falso con `now() = fin` y verdadero con `now() = inicio`. Se fija con citas colocadas relativas a `now()`. | La regla semiabierta mal copiada. |
| R7 | `esta_en_curso(id)` da el mismo resultado que antes para el profesional dueño (regresión de (b)). | |
| R8 | `assert_lanza`: un rango de 63 días y un rango invertido dan `22023`. | La guarda del rango. |
| R9 | En `pg_proc`, `agenda_citas_rango` tiene `prosecdef = false` y `anon` no tiene `execute`. | Que alguien la pase a definer «para que el técnico vea». |

### 1.3 · `lib/citas/` (fábrica, `server-only`)

**`lib/citas/agenda.ts`**

- `leerCitasRango(sesion: Sesion, desde: Date, hasta: Date): Promise<ResultadoCitas<{ filas: FilaAgenda[] }>>`: una llamada `rpc('agenda_citas_rango')`. Mapea a camelCase y convierte `inicio` y `fin` a `Date`. El error pasa por `mapearErrorCitas`.
- `leerCita(sesion, citaId): Promise<ResultadoCitas<{ cita: FilaCitaMinima }>>` para la acción:
  - primero `from('citas').select('id, inicio, fin, serie_id, desviada, centro_id, zona_horaria, estado').eq('id', citaId).maybeSingle()`;
  - si no hay fila, lo mismo sobre `citas_agenda`;
  - si tampoco, `no_autorizado`.
  - No se decide por el rol: la RLS ya separa las dos puertas (H2), y así no queda acoplado al ADR-065.
- `zonaDeCentro(sesion, centroId: string | null): Promise<ResultadoCitas<{ zona: string }>>`: `rpc('zona_horaria_centro', { p_centro_id })`. **Única** fuente de la zona en T-014.
- `leerAlertasNotaPendiente(sesion): Promise<ResultadoCitas<{ alertas: AlertaPendiente[] }>>`:
  - lee `alertas_documentacion` con `estado='abierta'`, ordenadas por `fecha_referencia` y después `creada_en`, las dos ascendentes;
  - columnas `id, paciente_id, tipo, fecha_referencia, creada_en`;
  - el nombre del paciente sale de un segundo `select` a `pacientes` con `in(ids)`.
- `estadoParaPunto(estado: EstadoCitaBd, enCurso: boolean): EstadoVisibleCita` (el tipo de `@/components/ui/estado-cita`): si `enCurso`, `'en_curso'`; si no, `estado`. **No se usa `lib/agenda/estados-cita.ts`** (ver D3).
- Tipos exportados: `FilaAgenda` (todas las columnas de 1.1c), `FilaCitaMinima`, `AlertaPendiente`.

**`lib/citas/esquemas.ts`: se añade `esquemaReprogramarCita`**, compartido por el diálogo y la acción:

```ts
z.object({
  citaId: z.uuid('Cita no válida.'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(esFechaDeCalendario, 'Ese día no existe.'),
  hora: z.string().regex(HHMM, 'La hora debe tener forma HH:MM.'),
  zona: z.string().min(1),
  alcance: esquemaAlcance.optional(),   // obligatorio si la cita es de serie: lo comprueba la acción
})
```

`esFechaDeCalendario` viene de `lib/fechas/calendario.ts` (§1.4).

**`lib/citas/tipos.ts` y `errores.ts`: nuevo motivo `destino_pasado`**

- Mensaje: «No se puede mover una cita a un momento que ya ha pasado.»
- `mapearErrorCitas` no lo produce: solo lo emite la acción.

**`lib/citas/reprogramar.ts`: `reprogramarCita(sesion, datos: DatosReprogramarCita, ahora: Date): Promise<ResultadoCitas<{ movida: boolean; propuestasPendientes: number }>>`**

1. `leerCita`.
2. Si `cita.fin <= ahora`, devuelve `cita_pasada` (la base también lo impediría; se adelanta por el mensaje).
3. Si `datos.zona !== (await zonaDeCentro(sesion, cita.centro_id)).zona`, devuelve `parametro_invalido`. Mensaje: «La vista estaba en otra zona horaria; recarga la agenda.»
4. `clasificarHoraLocal(datos.fecha, datos.hora, zona)`:
   - con `inexistente`, `parametro_invalido`: «Esa hora no existe ese día por el cambio de hora.»
   - con `ambigua`, `parametro_invalido`: «Esa hora se repite ese día por el cambio de hora; elige otra.»
   - con `normal`, `inicio` es el único candidato y `fin = inicio + (cita.fin − cita.inicio)`. **La duración se conserva.**
5. Si `inicio <= ahora`, `destino_pasado`.
6. Según la cita y el alcance:
   - **Cita suelta** (`serie_id` nulo): si viene `alcance`, `parametro_invalido`; si no, `desplazarCita(sesion, { citaId, inicio: iso, fin: iso })`.
   - **Cita de serie sin `alcance`**: `parametro_invalido`, con el mensaje «Elige solo esta, o esta y las siguientes.»
   - **Cita de serie con `esta`**: `editarSerie(sesion, { citaId, alcance: 'esta', inicio, fin })`. La cita queda desviada (H6, H7).
   - **Cita de serie con `esta_y_siguientes`**: **rama BLOQUEADA hasta D6.** Con la opción A:
     - si `cita.desviada`, o si `datos.fecha` no es la fecha local de `cita.inicio`, devuelve `parametro_invalido`;
     - `editarSerie(sesion, { citaId, alcance: 'esta_y_siguientes', horaLocal: datos.hora })`;
     - entre las propuestas pendientes con `id` en `propuestaIds`, se busca la que tiene `citaId === datos.citaId` y se hace `confirmarPropuesta`. Si falla (por ejemplo `hueco_ocupado`), se devuelve `{ ok: true, movida: false, propuestasPendientes: n }` y un mensaje que lo dice;
     - `propuestasPendientes` = las demás.
7. Nunca `.from('citas').update(...)`. Solo RPC `agenda_*`.

### 1.4 · Funciones puras (carril de Kimi; delegables, §7)

**`lib/fechas/calendario.ts`** (fechas `AAAA-MM-DD`, sin zona, sin reloj)

- `esFechaDeCalendario(fecha: string): boolean`: formato más ida y vuelta por `Date.UTC`, igual que `relativo.ts:25-35`. `'2026-02-30'` da `false`.
- `sumarDias(fecha: string, n: number): string` y `sumarMeses(fecha: string, n: number): string`. `sumarMeses` recorta al último día: `'2026-01-31' + 1` da `'2026-02-28'`.
- `diasEntre(desde: string, hasta: string): number`, en días de calendario.
- `diaDeLaSemana(fecha: string): 1..7` (ISO, lunes = 1).

**`lib/agenda/mes.ts`**

- `diasDelMes(fecha: string): { fecha: string; delMes: boolean }[]`: siempre **42** días, del lunes de la semana que contiene el día 1 del mes de `fecha` en adelante.
- `lunesDeLaSemana(fecha: string): string`.

Pruebas de las dos: febrero de 2027 (que empieza en lunes: la primera fila es del mes y la sexta es del vecino), meses de 28, 30 y 31 días, cambios de año y los inválidos.

### 1.5 · Primitivas con comportamiento en `components/ui/`

**`colocacion.ts`, pura**

```ts
export type Rect = { top: number; left: number; width: number; height: number };
export type Colocacion = { top: number; left: number; lado: 'arriba' | 'abajo'; picoX: number; altoMax: number };
export function colocarPanel(a: {
  ancla: Rect; panel: { width: number; height: number }; limites: Rect; margen?: number; pico?: number;
}): Colocacion
```

- **Lado:** `abajo` si caben `height + pico + margen` bajo el ancla; si no, `arriba` si caben encima; si no caben en ninguno, el lado con más hueco, y entonces `altoMax` = ese hueco (el panel hace scroll por dentro).
- **Posición horizontal:** centrado en el ancla y recortado a `[limites.left + margen, limites.left + limites.width − margen − panel.width]`.
- **Pico:** `picoX` = centro del ancla − `left`, recortado a `[radio + pico, panel.width − radio − pico]`.
- **Pruebas:** ancla en la última fila (sale arriba); en la última columna (el panel queda entero y el pico apunta al ancla); ventana de 360×640 con un panel más alto que ambos huecos (`altoMax`); ancla más ancha que el panel.

**`panel-anclado.tsx`** (`'use client'`)

```ts
type Props = { ancla: HTMLElement; limites?: HTMLElement | null; titulo: string; alCerrar: () => void; children: ReactNode };
```

- `role="dialog"`, **no modal**, `aria-labelledby` apuntando al título y `tabIndex={-1}`.
- Va `position: fixed`, con coordenadas de `colocarPanel`:
  - la entrada es `getBoundingClientRect()` del ancla y del panel, medidos en `useLayoutEffect`;
  - `limites` = rectángulo del calendario ∩ ventana en horizontal, y la ventana en vertical;
  - se recalcula en `resize` y en `scroll` (captura).
- Foco: `useFocoAtrapado` y foco inicial en el primer enfocable. Escape y `mousedown` fuera, con `useCierreExterior`, llaman a `alCerrar`. **El foco lo devuelve el llamante**, no `useDevolucionDeFoco`, porque vuelve al escalón anterior (D9).
- Estilo: `bg-secondary text-secondary-foreground rounded-xl border shadow-lg`, ancho `w-[min(20rem,calc(100vw-2rem))]` y pico con un pseudo-elemento en `picoX`.
- Pruebas (Testing Library):
  - Escape llama a `alCerrar`;
  - el foco inicial cae dentro;
  - Tab no sale del panel;
  - un clic fuera cierra;
  - con un `getBoundingClientRect` simulado, `style.top` y `style.left` coinciden con `colocarPanel`.

**`rejilla-foco.ts`**

- `destinoEnRejilla(tecla, indice, total, columnas = 7): number | null`:
  - `←` y `→` suman o restan 1; `↑` y `↓` suman o restan `columnas`;
  - `Home` y `End` van al principio y al final de la **fila**;
  - **no da la vuelta**: en el borde devuelve `null`;
  - cualquier otra tecla, `null`.
- Hook `useFocoRodante(total, inicial)`: devuelve `{ activo, setActivo, alTeclear, refDe(i) }` y enfoca el elemento al cambiar de índice.
- Pruebas de la función pura con todas las teclas y los cuatro bordes.

**`estado-cita.tsx`** (viene de T-014a)

- **Único cambio:** prop `late?: boolean` (por defecto `true`) en `PuntoEstadoCita`, que se pasa a `Punto`.
- Prueba nueva: con `late={false}` y `estado='en_curso'`, lleva `halo-estado` y no `latido-estado`.

### 1.6 · La pantalla `app/(app)/agenda/`

Ficheros (convención de `app/(app)/pacientes/`):

| Fichero | Tipo | Contenido |
|---|---|---|
| `page.tsx` | Servidor | Espera `searchParams`, `parametros.ts` los valida y pinta el encabezado del módulo y cinco bloques, cada uno en su `<Suspense>` con esqueleto (§1.6.1). |
| `parametros.ts` | Puro | `leerParametros(sp): { vista: 'semana' \| 'mes'; fecha: string \| null; centro: string \| null; profesional: string \| null }`. Detalle en la tabla de abajo. |
| `vista.ts` | Puro, sin E/S | `construirVista(entrada): VistaCalendario` (§1.6.2). |
| `calendario.tsx` | `'use client'` | La isla del calendario (§1.6.3). |
| `rejilla-semana.tsx`, `lista-dia.tsx`, `rejilla-mes.tsx`, `panel-cita.tsx`, `panel-dia.tsx`, `dialogo-reprogramar.tsx` | Cliente | Las partes de la isla. |
| `proximas.tsx`, `por-confirmar.tsx`, `documentacion.tsx`, `cuadro.tsx` | Servidor | Los bloques; cada uno lee sus datos y pinta su vacío y su error a partir de `ResultadoCitas`. |
| `acciones.ts` | `'use server'` | `reprogramar`, `confirmarPropuestaAgenda`, `descartarPropuestaAgenda`. |
| `notas.ts` | Puro | `RUTA_NOTAS_DISPONIBLE = false` (D8) y `rutaNotas(pacienteId, citaId)` → `` `/pacientes/${pacienteId}/historia/notas?cita=${citaId}` ``. |
| `*.test.ts(x)` | Pruebas | §3. |

Reglas de `parametros.ts`:

| Parámetro | Cómo se valida | Si no vale |
|---|---|---|
| `vista` | `'semana'` o `'mes'` | se trata como `'semana'` |
| `fecha` | `esFechaDeCalendario` | se trata como ausente, y ausente es «hoy» |
| `centro` | `z.uuid()` o `'todos'` | se ignora |
| `profesional` | `z.uuid()` | se ignora |

Ningún parámetro se lanza como error.

#### 1.6.1 · Bloques y datos

**Sesión y rol.** Una sola vez por petición, con una función cacheada por petición mediante `React.cache` (no `use cache`, ADR-043):

- `exigirSesion()`;
- la zona con `zonaDeCentro(centroFiltrado)`;
- el rol con `from('perfiles').select('rol').eq('id', uid)`, la misma lectura que `armazon.tsx:35`.

**Centro filtrado.**

- Si `?centro=<uuid>` es uno de los centros ofrecidos, ese centro.
- Si no, la cookie `centro_activo` (H24), siempre que sea un centro ofrecido.
- Si no, «todos», que es `null` y da la zona de la organización (H14).
- Centros ofrecidos:
  - al administrador, todos los de `centros`;
  - a los demás, sus centros vigentes de `perfiles_centros`, con la misma consulta que `armazon.tsx:66-91`.
- El filtro **solo se pinta con dos o más centros ofrecidos**.

**Profesional filtrado.**

- Las opciones son los profesionales **distintos presentes** en las filas del rango.
- Se filtra en memoria, sobre la salida de la RPC.
- El filtro no se pinta al `profesional_sanitario`: la RLS ya le da solo lo suyo.

**Bloques:**

| Bloque | Datos | Por rol |
|---|---|---|
| **Calendario** | `leerCitasRango` sobre el rango de la vista: la semana es `limitesDeSemana` de la fecha anclada a las 12:00 en la zona; el mes, del primer al último de los 42 días. Además `listarPropuestasPendientes`, para marcar qué citas tienen propuesta. | Todos. |
| **Próximas** | `leerCitasRango(ahora, fin de mañana en la zona)`. Se queda con `inicio > ahora` y los estados `programada` o `confirmada`, las 5 primeras. Lista **no interactiva**: hora en monoespaciada, nombre corto y punto sin etiqueta visible (`late={false}`). | Todos. |
| **Por confirmar** | `listarPropuestasPendientes`. Cada fila lleva nombre corto, fecha y hora prevista (`resumirPropuesta`) y el motivo en texto. Botones **Confirmar** (solo si hay `inicioPropuesto`) y **Descartar**, que son Server Actions. | Todos, filtrado por la RLS (H11). Solo se pinta si hay alguna propuesta. |
| **Documentación pendiente** | `leerAlertasNotaPendiente`. Cada fila lleva el nombre del paciente con enlace a `/pacientes/<uuid>`, «Nota sin firmar» y «pendiente desde hace N días», con `N = diasEntre(fecha_referencia, hoyEnZona)`. **Nivel por antigüedad** (D10): 0-1 días sin píldora, 1-2 días píldora `warning` «Más de 24 h», 3 o más píldora `warning` «Más de 72 h». Nada de contenido clínico: no existe en la tabla. | Todos, filtrado por la RLS (H12). |
| **Cuadro inferior** | `leerCitasRango(1 del mes en la zona, ahora)`. **Asistencia** = realizadas / (realizadas + no asistidas); **Ausencia sin aviso** = no asistidas / (realizadas + no asistidas). Sin denominador, «—». Formato de métrica del vocabulario. | **Solo si** `rol ∈ {'administrador','profesional_sanitario'}` (lista blanca, en fallo cerrado). Para el técnico, y cualquier otro rol o `null`, **ni se consulta ni se pinta**. |

Cada bloque que lee el reloj hace antes `await connection()` (patrón de `armazon.tsx:173`). Nada entra en `use cache`.

#### 1.6.2 · `construirVista(entrada)`: pura y probada

**Entrada:**

- `filas: FilaAgenda[]`, `propuestas: PropuestaPendiente[]`;
- `vista`, `fecha` (ya resuelta; «hoy» la calcula el llamante en la zona);
- `zona`, `hoy: string`, `ahora: Date`;
- `usuarioId: string`, `profesionalFiltrado: string | null`.

**Salida `VistaCalendario`** (solo cadenas, números y booleanos: **ningún `Date` cruza al cliente**):

```ts
type VistaCalendario = {
  vista: 'semana' | 'mes'; zona: string; hoy: string; fechaFoco: string;
  anterior: string; siguiente: string;               // semana ±7 días; mes, sumarMeses ±1
  titulo: string;                                    // «21–27 de septiembre de 2026» / «Septiembre de 2026»
  dias: { fecha: string; numero: string; etiquetaCorta: string; etiquetaLarga: string;
          esHoy: boolean; delMes: boolean }[];       // 7 o 42
  eje: { desdeMinuto: number; hastaMinuto: number; horas: string[] };   // solo semana
  citas: CitaVista[];
  profesionales: { id: string; nombre: string }[];   // para el filtro
};
type CitaVista = {
  id: string; tramo: number; pacienteId: string;
  diaIndice: number; fechaLocal: string; horaLocal: string;     // para el diálogo
  minutoPared: number; duracionMinutos: number; columna: number; columnasEnGrupo: number;
  rango: string; duracion: string;                               // «10:00–10:50», «50 min»
  nombrePaciente: string; nombreCorto: string;                   // «Ana García López» / «Ana G.»
  profesionalNombre: string; colorProfesional: 1|2|3|4|5|6;
  tipoNombre: string | null; centroNombre: string | null; sala: string | null; notaOperativa: string | null;
  estado: EstadoVisibleCita; late: boolean;
  deSerie: boolean; desviada: boolean; motivoDesviacion: string | null;   // etiqueta i18n
  reprogramable: boolean; alcanceSiguientesPermitido: boolean;            // D6
  propuestaPendiente: { id: string; rango: string | null } | null;
  notas: { mostrar: boolean; href: string; primario: boolean; diasPendiente: number | null };
};
```

Reglas:

- **Colocación.** `colocarEnRejilla` se usa para `diaIndice`, `columna` y `columnasEnGrupo`. La **posición vertical** es `minutoPared`: la hora de pared del inicio del tramo en la zona (`HH*60+mm`, formateada con `TZDate`), o 0 si el tramo empieza a medianoche. La **altura** es `duracionMinutos`. Así el eje único de horas de pared cuadra también el domingo de 23 h y el de 25 h (D5).
- **Eje.** De 07:00 a 21:00, ampliado a la hora entera anterior al primer tramo y a la posterior al último.
- **Latido.** `late = true` en **una sola** cita: la primera en curso por `(inicio, id)` entre las visibles tras filtrar. Las demás en curso llevan halo quieto.
- **Nombres.** `nombreCorto` = primer nombre + inicial del primer apellido con punto. Con `paciente_nombre` nulo (la RLS de pacientes no deja), «Paciente» en los dos campos.
- **Color.** `colorProfesional` = `1 + (hash FNV-1a de 32 bits del uuid) mod 6`.
- **Notas.**
  - `mostrar` = `RUTA_NOTAS_DISPONIBLE && profesionalId === usuarioId && estado ∉ {cancelada, no_asistida}`;
  - `primario` = `en_curso`;
  - `diasPendiente` = `profesionalId === usuarioId && nota_pendiente === true` ? `diasEntre(fechaLocal(fin), hoy)` : `null`.
  - **El aviso se pinta aunque `mostrar` sea falso** (D8).
- **Serie.** `alcanceSiguientesPermitido` = `deSerie && !desviada`. Con la opción A de D6, el diálogo además exige el mismo día.
- **Filtro.** Con `profesionalFiltrado`, se filtra antes de colocar.

#### 1.6.3 · La isla `calendario.tsx`

**Estado cliente:**

- `fechaFoco`, que arranca en `vista.fechaFoco`;
- `pila: ({ tipo: 'dia'; fecha: string; ancla: HTMLElement } | { tipo: 'cita'; id: string; tramo: number; ancla: HTMLElement })[]`;
- `reprogramando: { citaId; fecha; hora } | null`.

**Barra de herramientas:**

- anterior, «Hoy» y siguiente son `<Link>` que conservan los demás parámetros;
- el título;
- el conmutador Semana/Mes son `<Link>` a `?vista=…&fecha=${fechaFoco}`, con el foco **del cliente**: así se cumple «conserva la fecha enfocada»;
- los filtros, con las primitivas `Seleccion`/`Desplegable` existentes y `router.replace` al cambiar;
- la leyenda (`LeyendaEstadosCita`), en lateral en `lg+` y plegada bajo la barra en móvil.

**Semana en `md+` (`rejilla-semana.tsx`):**

- **Estructura.** `role="grid"` con `aria-label` = título. Una fila `role="row"` de 7 `role="gridcell"` (`div`). Arriba de cada una, un `<button>` con el número del día y la etiqueta corta, que es el objetivo del foco rodante (`tabIndex` 0 solo el de `fechaFoco`). Debajo, la columna horaria con citas absolutas: `top = (minutoPared − eje.desdeMinuto) * PX_MIN`, con `PX_MIN = 96/60`.
- **Botón de la cita.** Es un `<button>` con `min-h-11`, franja 1×10 `bg-profesional-N` (D7), hora en `font-mono`, `nombreCorto`, `tipo · profesional` (sin `tipo` y sin separador si `tipoNombre` es nulo), `PuntoEstadoCita` y los iconos de serie y de desviada con texto `sr-only`. Su `tabIndex` es 0 **solo** en las citas del día con foco; en las demás, −1.
- **Teclado.**
  - En el número del día: `←`/`→`/`Home`/`End` con `destinoEnRejilla(…, 7, 7)`; Intro o espacio abre el panel del día.
  - En una cita: Intro o espacio abre su panel; Escape enfoca el número de su día.
- **Clic** en el hueco de la celda (el `div` gridcell, `onClick` si el objetivo no es un botón): panel del día.
- **Arrastre (D4).**
  - `pointerdown` solo con `pointerType !== 'touch'`, en citas con `reprogramable`.
  - A los 4 px de movimiento empieza el arrastre (antes es clic). El fantasma se ajusta a cuartos de hora y a columna.
  - Al soltar se calcula `{ fecha: dias[col].fecha, hora: 'HH:MM' }` con aritmética de enteros sobre el eje (sin `Date`) y se abre `DialogoReprogramar`. Escape durante el arrastre lo cancela.

**Semana por debajo de `md` (`lista-dia.tsx`, D11):**

- Tira de 7 botones de día (≥ 44 px, foco rodante con `←`/`→`, `aria-pressed` en el elegido).
- Debajo, las citas del día agrupadas por hora (encabezado `HH:00` en monoespaciada). Cada fila es un botón de ≥ 44 px con la misma información que en la rejilla.
- Sin arrastre.
- Las dos disposiciones se pintan, con `hidden md:block` y `md:hidden`.

**Mes (`rejilla-mes.tsx`):**

- `role="grid"` de 6 `row` × 7 `gridcell` y cabecera `columnheader` L-D.
- Número del día con foco rodante: `destinoEnRejilla(…, 42, 7)`, con `↑`/`↓` de ±7.
- Celdas `!delMes` con `text-muted-foreground`, **sin `opacity`** (el contraste tiene que poder medirse), navegables igual.
- En `sm+`, hasta 3 citas como botones `hora + nombreCorto` con punto sin etiqueta visible, y un botón `+N más` que abre el panel del día.
- Por debajo de `sm`, en lugar de las citas, un punto por estado presente (en el orden de la leyenda) y el recuento del día. El `sr-only` dice «N citas»; se llega a ellas por el panel del día.

**Paneles:**

- `panel-cita.tsx` muestra, en este orden:
  - el rango y la duración;
  - el tipo (se omite si es `null`);
  - el profesional;
  - centro y sala;
  - la nota operativa (se omite si es `null`);
  - el estado con `PuntoEstadoCita late={false}`;
  - serie o desviada con su motivo;
  - la propuesta pendiente, si la hay, con Confirmar y Descartar;
  - el aviso de nota pendiente, si `diasPendiente != null`: «La nota de esta sesión es obligatoria · pendiente desde hace N días». Informa y no bloquea;
  - el botón «Notas» (primario si `primario`) si `notas.mostrar`;
  - el botón «Reprogramar» si `reprogramable`.
- `panel-dia.tsx`: la lista del día ordenada por hora. Cada fila es un botón con **los mismos campos** que el botón de la cita, nada más. Intro empuja el panel de la cita con `ancla` = la fila.

**Pila y Escape (D9):**

- Abrir hace `push` y cerrar hace `pop`.
- Solo se pinta el panel de la cima.
- Al hacer `pop`, el foco va al `ancla` de la entrada sacada: la fila del panel del día, que vuelve a verse, o la cita o el número del día en la rejilla.

**`dialogo-reprogramar.tsx`:**

- Usa `Dialogo` (modal existente), un formulario con react-hook-form y `esquemaReprogramarCita`.
- Campos: `fecha` (`<input type="date">`) y `hora` (`<input type="time" step="900">`), prellenados con lo soltado o con `fechaLocal`/`horaLocal`. `zona` va oculta, con `vista.zona`.
- En una cita de serie: grupo de radio **obligatorio**, sin preselección, con **dos** opciones: «Solo esta» y «Esta y las siguientes». La segunda se deshabilita con su motivo visible (desviada, o distinto día con la opción A) y siempre con el texto al lado. **Ninguna tercera opción, ni deshabilitada.**
- Texto de confirmación: «Mover a <etiquetaLarga del día> · <hora>». La etiqueta sale de `vista.dias` si el día está visible y, si no, de la cadena `fecha` tal cual.
- Enviar llama a `reprogramar` y, al cerrar, el foco vuelve a la cita.

#### 1.6.4 · `acciones.ts` (`'use server'`)

- **`reprogramar(entrada: unknown)`:**
  - `exigirSesion()` y `esquemaReprogramarCita.safeParse`; si falla, `{ ok: false, motivo: 'parametro_invalido', mensaje }`;
  - `reprogramarCita(sesion, datos, new Date())`;
  - si `ok`, `revalidatePath('/agenda')`.
- **`confirmarPropuestaAgenda` y `descartarPropuestaAgenda`:** `safeParse` con los esquemas existentes, `confirmarPropuesta`/`descartarPropuesta` y `revalidatePath('/agenda')`.
- Ninguna importa `lib/supabase/administracion.ts`.

### 1.7 · Resto de ficheros

**`app/globals.css`:**

- seis tokens `--profesional-1…6` en `:root` (oklch, tonos separados en matiz, luminosidad media);
- su mapeo en `@theme inline` como `--color-profesional-N`;
- en `app/(app)/agenda/`, un array literal de clases `['bg-profesional-1', …]`, porque Tailwind no ve nombres de clase construidos.

**`lib/contraste/tokens.ts`:**

- se añaden a `PARES` los pares de texto nuevos que se pinten: como mínimo `muted-foreground`/`secondary` (texto secundario del panel) y `foreground`/`secondary` si se usa;
- los `--profesional-N` **no** entran: son decoración no textual y el profesional va siempre escrito.

**`lib/i18n/es.ts`:** claves nuevas bajo `agenda.*`: títulos, bloques, vacíos, errores, diálogo, motivos de desviación, motivos de propuesta, nivel de antigüedad, métricas y leyenda de serie y desviada. **No** se tocan las de T-014a.

**`components/armazon/modulos.ts`:** Agenda con `disponible: true`, y en `modulos.test.ts` una aserción de que Agenda está disponible.

**`app/page.tsx`:** solo el comentario, que deja de decir que `/agenda` no existe.

**`docs/interfaz.md`, §Donde el prototipo choca**, un choque nuevo (el 14) con tres puntos:

- «Pendientes» del panel derecho no tiene datos (no hay preparación ni cobro) y hoy enseña las propuestas por confirmar;
- «modalidad» no existe en la cita;
- el cuadro inferior se queda en asistencia y ausencia hasta que haya facturación, definición de abandono y trazabilidad.

**`docs/state.md` y `docs/bitacora/T-014.md`:** al cerrar.
- **Hallazgos:**
  - H12, dos: `fecha_referencia` en UTC, y la alerta no se abre si la cita se marca realizada antes del fin;
  - H20: las claves `agenda.estado.*` de Kimi;
  - H21: quitar el hallazgo de `Button`;
  - H9 si el propietario elige la opción A.
- **Decisión de 360 px** con su motivo.

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartado, y por qué |
|---|---|---|
| D1 | **Una migración de lectura** (`agenda_citas_rango`, invoker, `union all` de `citas` y `citas_agenda`) calcula `en_curso` con el `now()` de la base para los tres roles. | (a) `esta_en_curso(id)` por cita: al técnico le da falso (H2) y además es N+1. (b) `estaEnCurso` de `lib/agenda` con el reloj de Node: es una segunda copia de la regla, contra el ADR-045 («escrita una sola vez»). (c) La función en definer: reimplementa la RLS y abre la organización al técnico. |
| D2 | **La regla vive en `cita_en_curso(inicio, fin, estado)`**, y `esta_en_curso(id)` delega en ella. | Copiar la expresión en la RPC: serían dos sitios que pueden divergir. |
| D3 | El estado del punto se adapta con `estadoParaPunto(estado, en_curso)` y el tipo `EstadoVisibleCita` **de `components/ui/estado-cita`**. | `estadoVisible()` de `lib/agenda`: recibe el reloj de fuera y trae `pasada_sin_marcar`, que el contrato no pinta. Tampoco se unifican los dos tipos: el de Kimi es de otro carril, y queda anotado. |
| D4 | **Arrastre con Pointer Events solo en la semana `md+` y sin táctil.** El diálogo «Reprogramar» del panel es la alternativa sin arrastre (WCAG 2.5.7) y el único camino en móvil y en la vista mensual. | DnD de HTML5: no funciona en táctil y tiene un fantasma que no se puede estilar. Arrastre táctil: pelea con el scroll a 360 px. |
| D5 | **Eje de horas de pared y altura en minutos reales.** La posición es la hora formateada en la zona; `colocarEnRejilla` solo agrupa. | Usar `inicioMinutos` absoluto como `top`: el domingo de marzo, todas las citas quedarían una franja por encima de su etiqueta (H16). |
| D6 | **BLOQUEO parcial.** «Esta y las siguientes» por arrastre. T-011 aplica el cambio de regla a **todas** las futuras no desviadas, también las anteriores a la arrastrada (H8), y solo cambia la **hora**, conservando la fecha de cada una (H9). Arrastrar a otro día con ese alcance dejaría la cita en su día y a su hora nueva. **Pregunta al propietario:** ¿**A)** T-014 lo ofrece solo cuando el arrastre no cambia de día, mueve la cita arrastrada confirmando su propia propuesta (ya confirmada en el diálogo) y deja las demás como propuestas visibles en «Por confirmar», una a una (ADR-034); o **B)** se abre antes un ticket de riesgo alto que corrija `agenda_editar_serie` para que parta de la cita elegida y aplique el cambio de día, y T-014 ofrece la opción sin restricción? **Recomendación: A**, porque no toca la base de series y nada se mueve sin confirmar; el defecto H8 y H9 se anota para un ticket propio. | Ofrecer solo «Solo esta» en el arrastre: contradice la pregunta que exige el contrato. Corregir T-011 dentro de T-014: está fuera del contrato. |
| D7 | **Color del profesional derivado del uuid**: hash a 6 tokens `--profesional-N`. | `perfiles.color`: migración y pantalla de ajustes, fuera del contrato. Reusar `accent`, `destructive` o `secondary`: esos tokens ya significan atención, error y selección. Las colisiones con más de 6 profesionales se aceptan: el nombre va siempre escrito. |
| D8 | **«Notas» detrás de `RUTA_NOTAS_DISPONIBLE = false`** hasta que T-012 cree la ruta y ponga la constante a `true` (queda en el territorio de T-012). El aviso de nota pendiente sí se pinta. **El criterio 4 («Notas» lleva al editor y pide PIN) se cierra en T-012.** | Pintar un enlace que da 404: es un control sin acción real (regla 3 de `interfaz.md`). Adelantar T-012: cambia el orden que fijó el propietario, y queda para el gate. |
| D9 | **Pila de paneles con devolución del foco al ancla**: solo se ve la cima y Escape vuelve al escalón anterior. | Paneles apilados a la vista: se tapan entre sí y a 360 px no caben. `useDevolucionDeFoco`: devuelve al elemento que tenía el foco al abrir, que no siempre es el escalón anterior. |
| D10 | **Nivel de la documentación pendiente por antigüedad** en los tres tramos de `interfaz.md` (0, 24 y 72 h), con etiquetas que no dicen «escalada». | Mostrar el escalado real: la tabla `notificaciones` y el envío son de T-015. |
| D11 | **360 px = tira de días más lista por franjas horarias.** El motivo es WCAG 1.4.10: el día con desplazamiento lateral es scroll en dos ejes y además compite con el gesto de volver atrás. La confirmación en un teléfono real y su anotación quedan para el implementador; si el teléfono contradice esto, se para y se consulta, sin cambiar de forma por su cuenta. | El día con desplazamiento lateral. |
| D12 | **Filtros en la URL** (`?centro`, `?profesional`). El centro cae en la cookie del armazón si no viene en la URL. El profesional se filtra en memoria. | Añadir parámetros a la RPC: más superficie en SQL para un filtro que la RLS ya acota. Un segundo selector de centro con estado propio: dos verdades. |
| D13 | **El cuadro inferior va con lista blanca de roles** (`administrador`, `profesional_sanitario`) y en fallo cerrado. | Ocultarlo con `rol !== 'tecnico_administrativo'`: el director administrativo del ADR-065 lo vería sin que nadie lo decidiera. |
| D14 | **Guarda de rango de 62 días** en la RPC. | Sin guarda: una llamada directa puede pedir años de agenda. Es coste, no fuga, porque la RLS ya permite leer la tabla. |
| D15 | **El nombre del paciente viene de `pacientes`** por RLS. Si no se puede leer, «Paciente». | Añadir el nombre a `citas_agenda`: es cambiar la vista de T-010 sin necesidad. |

---

## 3 · Cómo se cierra cada criterio de aceptación

| Criterio | Cómo se demuestra |
|---|---|
| **M1** · La cita en curso se ve verde, late y dice «En curso»; ninguna otra late. | Automático: `vista.test.ts` comprueba que, con dos citas en curso, solo la primera por `(inicio, id)` tiene `late: true`, y `estado-cita.test.tsx` que `late={false}` no lleva `latido-estado`. R2 y R6 en `npm run test:rls`. Manual: guion paso 1-2 y `document.querySelectorAll('.latido-estado')` en la consola; en la disposición visible hay 1. |
| **M2** · Con movimiento reducido, el punto se queda quieto. | Manual: DevTools, Rendering, `prefers-reduced-motion: reduce`. El CSS viene de T-014a. |
| **M3** · En escala de grises, los seis estados se distinguen. | Manual: imprimir a PDF en gris la leyenda y una semana con los seis estados. |
| **M4** · Panel, «Notas», editor y PIN. | **Parcial en T-014** (D8): `notas.test.ts` comprueba el formato del `href` y `vista.test.ts` que `mostrar` exige ser el profesional de la cita. El recorrido hasta el PIN se cierra en T-012 al poner `RUTA_NOTAS_DISPONIBLE`. Se anota en la evidencia como «diferido a T-012». |
| **M5** · En el mes: cita → panel de la cita; hueco → panel del día → fila → la misma cita. | `calendario.test.tsx` (Testing Library) recorre clic en la cita, clic en la celda y fila del panel del día, y comprueba el mismo `aria-labelledby` y el mismo contenido. Además, manual. |
| **M6** · El panel queda entero en la última fila y en la última columna. | `colocacion.test.ts`, casos de última fila y última columna. Manual: a 1280 y a 360 px. |
| **M7** · Cita de ayer, realizada y sin nota: aviso con los días. | Automático: `vista.test.ts` da `diasPendiente = 1` con `nota_pendiente = true`, `fin` ayer y `hoy`. Manual: en Studio, una cita de ayer pasa a `realizada` (se dispara la alerta) y se mira su panel como su profesional. |
| **M8** · Como técnico, sin tipo de terapia ni nota operativa. | Automático: R1 y R3 en `npm run test:rls`, y en `panel-cita.test.tsx` una cita con `tipoNombre: null` y `notaOperativa: null` no deja ningún separador «·» huérfano ni el rótulo «Nota operativa». Manual: iniciar sesión como técnico del seed. |
| **M9** · Arrastrar una cita de serie pregunta y nunca ofrece «todas». | `dialogo-reprogramar.test.tsx`: en una cita de serie hay exactamente 2 radios con esas etiquetas; `queryByText(/todas/i)` es null; no se puede enviar sin elegir. Manual: arrastre real. La rama `esta_y_siguientes` espera a D6. |
| **M10** · A 360 px se reorganiza, están todas las acciones y ningún objetivo baja de 44 px. | Manual en un teléfono real (D11) y con DevTools a 360: recorrer abrir cita, abrir día, reprogramar, confirmar y descartar propuesta, filtros, conmutador y navegación. En la consola, `[...document.querySelectorAll('button,a')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44)` debe devolver `[]` dentro de `main`. |
| **M11** · Recorrido completo con teclado. | `rejilla-foco.test.ts`, `panel-anclado.test.tsx` y `calendario.test.tsx`: flechas entre días; Tab entra a las citas del día y sale; Intro abre; Escape de la cita al día y del día al número. Además, manual. |
| **M12** · `/agenda` junto a `/prototipo`. | Manual: capturas lado a lado en la bitácora. |
| **A1** · `disponible: true`. | `npm test` con `modulos.test.ts`. |
| **A2** · Lint, build y accesibilidad. | `npm run lint && npm run build`, `npm test` (con `lib/contraste/tokens.test.ts` y los `PARES` nuevos) y `npm run test:a11y`. |
| Extra, por el riesgo | `npx supabase db reset` limpio; `npm run test:rls` con 18-agenda-rango; `reprogramar.test.ts` con los rechazos de §5; `node ~/.claude/pipeline/territorio.mjs T-014` en verde desde el worktree. |

---

## 4 · Riesgos, por probabilidad

1. **Alta.** El foco en la pila de paneles y en el foco rodante, al volver de un panel de cita al panel del día a la fila correcta. Mitigación: D9 y `calendario.test.tsx` con la secuencia completa.
2. **Alta.** Hidratación o reloj en cliente: un `new Date()` o un `format` en un fichero `'use client'`. Mitigación: la vista baja solo cadenas (1.6.2), y la comprobación de §5 las busca con grep.
3. **Media.** La semántica de «esta y las siguientes» (D6). Si el gate no responde, la rama queda deshabilitada con su texto y no se implementa a medias.
4. **Media.** La RPC devuelve filas de más o de menos a algún rol. Mitigación: R1 a R9.
5. **Media.** La colocación del panel dentro de contenedores con scroll. Mitigación: `fixed` sobre el viewport y recálculo en `scroll` con captura.
6. **Media.** Los cambios de hora en la rejilla y en el diálogo. Mitigación: D5; un caso en `vista.test.ts` para la semana del 23-03-2026 al 29-03-2026 con una cita a las 10:00 del domingo en `minutoPared = 600`; y el rechazo de `inexistente` y `ambigua` en `reprogramar.test.ts`.
7. **Baja.** La alerta no existe si la cita se marcó realizada antes del fin (H12), y el aviso M7 no sale en ese caso. Es de T-010; se anota.
8. **Baja.** La `fecha_referencia` en UTC desplaza un día la antigüedad de las citas de madrugada en la bandeja. Se anota.
9. **Baja.** El guardarraíl de territorio sale en rojo por los no rastreados del árbol principal (H28). Mitigación: el worktree de §1.0.
10. **Baja.** Concurrencia: dos personas mueven la misma cita. Gana la última, las dos quedan auditadas, y el hueco ocupado da `23P01`, que se muestra como `hueco_ocupado`. `revalidatePath` refresca.

---

## 5 · Qué revisar

**Qué puede elegir el llamante, y qué efecto tiene**

- **`?vista`, `?fecha`, `?centro` y `?profesional`.** Ninguno llega a SQL salvo como `p_desde` y `p_hasta`, que calcula el servidor. `fecha='2026-02-30'` debe comportarse como sin fecha, nunca como el 2 de marzo (prueba en `parametros.test.ts`). Un `centro` que no está entre los ofrecidos se ignora.
- **`agenda_citas_rango(p_desde, p_hasta)`, llamada directa con la clave anónima y un JWT.** Solo devuelve lo que la RLS da; un rango de más de 62 días o invertido lanza `22023` (R8).
- **`reprogramar({citaId, fecha, hora, zona, alcance})`.** `reprogramar.test.ts` (con Supabase simulado) cubre cada rechazo **por su motivo exacto**:

| Entrada | Resultado esperado | Motivo exacto |
|---|---|---|
| destino anterior a `ahora` | `destino_pasado` | |
| cita con `fin <= ahora` | `cita_pasada` | |
| `02:30` del 29-03-2026 en `Europe/Madrid` | `parametro_invalido` | mensaje de hora inexistente |
| `02:30` del 25-10-2026 | `parametro_invalido` | mensaje de hora repetida |
| `alcance` en una cita suelta | `parametro_invalido` | |
| cita de serie sin `alcance` | `parametro_invalido` | mensaje «Elige…» |
| `zona` distinta de la del centro | `parametro_invalido` | |
| cita sin fila en `citas` ni en `citas_agenda` | `no_autorizado` | |
| duración | se conserva | `fin − inicio` igual al original |

- **`alcance`.** Solo `esta` y `esta_y_siguientes`: `esquemaAlcance` no cambia. `grep -rni "todas" app/(app)/agenda` no encuentra ninguna opción de alcance.

**Invariantes que se pueden saltar por otra puerta**

- **Tipo y nota del técnico.** En el SQL, la rama `citas_agenda` lleva `null::…` **literales**. No vale un `join` a `citas`, ni a `tipos_terapia` por un id obtenido de otra forma. Y la función sigue **invoker** (R9). Si alguien la pasa a definer, el técnico lee la organización entera.
- **`en_curso`.** Sale solo de `cita_en_curso`. Buscar otra expresión `now() >=` o `estaEnCurso(` en `app/(app)/agenda` y `lib/citas`: no debe haber ninguna.
- **Escritura.**
  - `grep -rn "from('citas')" app/(app)/agenda lib/citas` solo encuentra `select`, nunca `.update`, `.delete` ni `.insert`.
  - Ninguna escritura toca `notas_clinicas_versiones`, `facturas`, `auditoria` ni `accesos_historia`.
  - Todo movimiento pasa por `agenda_actualizar_cita`, `agenda_editar_serie` o `agenda_confirmar_propuesta`, y por tanto por `auditar_citas`.
- **Clave de servicio.** `grep -rn "administracion" app/(app)/agenda` no da nada.
- **URL.** Solo uuids: `?cita=<uuid>` y `/pacientes/<uuid>`. Nunca `nombrePaciente` en un `href`.
- **Caché y reloj.**
  - `grep -rn "use cache" app/(app)/agenda` no da nada.
  - `grep -ln "'use client'" app/(app)/agenda/*.tsx | xargs grep -n "new Date\|Date.now\|format("` no da nada.
  - Los bloques que leen el reloj hacen `await connection()` antes.
- **El latido.** `late: true` en como mucho una `CitaVista`. El panel, la lista del día, las próximas y la leyenda pasan `late={false}`.
- **Tipos.** `EstadoVisibleCita` se importa solo de `@/components/ui/estado-cita`.
- **Técnico y datos clínicos.**
  - El técnico no recibe `diasPendiente` ni `notas.mostrar`: sale de `profesionalId === usuarioId`, y un técnico nunca es profesional de la cita.
  - La bandeja no lee nada bajo el candado: solo `alertas_documentacion` y `pacientes`.
- **Cuadro inferior.** Con el rol del técnico, `cuadro.tsx` no llega a llamar a `leerCitasRango`. La prueba lo comprueba con un espía.
- **Otras puertas.**
  - `null`: `paciente_nombre` nulo pinta «Paciente» y no rompe `nombreCorto`.
  - Duplicados: R5 contra el `union all`.
  - Concurrencia: riesgo 10.
  - Permisos de tabla entera y `TRUNCATE`: esta migración no concede ningún privilegio de tabla. Solo `execute` de funciones a `authenticated`. Comprobar que no hay ningún `grant … on table`.

**Accesibilidad**

- `role="grid"`, `row` y `gridcell` bien anidados.
- Un solo `tabIndex=0` entre los números de día de cada rejilla.
- La celda no es un botón.
- Ningún botón dentro de otro botón.
- Iconos con `aria-hidden` y texto `sr-only`.
- `min-h-11` en todo lo que se pulsa.
- Los meses vecinos sin `opacity`.
- Los `PARES` nuevos, en `lib/contraste/tokens.ts`.

**Autoevaluación del implementador**

Pegar en la bitácora las salidas de:

- `npm run test:rls`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:a11y`
- `node ~/.claude/pipeline/territorio.mjs T-014`

y los greps de esta sección.

---

## 6 · Territorio

Declarado en el frontmatter del contrato (`tickets/T-014-calendario-semanal.md`). `tickets/T-014/**`, `docs/bitacora/**` y `docs/state.md` son comunes y el guardarraíl los permite siempre.

```
supabase/migrations/*_agenda_citas_rango.sql
lib/supabase/tipos-bd.ts
scripts/rls/18-agenda-rango.sql
scripts/rls/README.md
lib/citas/**
lib/agenda/mes.ts
lib/agenda/mes.test.ts
lib/fechas/calendario.ts
lib/fechas/calendario.test.ts
app/(app)/agenda/**
app/page.tsx
app/globals.css
lib/i18n/es.ts
lib/contraste/tokens.ts
components/ui/estado-cita.tsx
components/ui/estado-cita.test.tsx
components/ui/panel-anclado.tsx
components/ui/panel-anclado.test.tsx
components/ui/colocacion.ts
components/ui/colocacion.test.ts
components/ui/rejilla-foco.ts
components/ui/rejilla-foco.test.ts
components/armazon/modulos.ts
components/armazon/modulos.test.ts
docs/interfaz.md
```

`lib/agenda/**` y `lib/fechas/**` son del carril de Kimi. Solo entran los **dos ficheros nuevos** y sus pruebas, y ninguno de los existentes se toca.

---

## 7 · Delegable

- **Kimi (funciones puras, su carril):** `lib/fechas/calendario.ts` y `lib/agenda/mes.ts`, con sus pruebas, según la especificación exacta de §1.4. No tienen reloj, zona ni E/S. Se encargan **primero**, porque `parametros.ts`, `esquemaReprogramarCita` y `construirVista` dependen de ellas. Mientras tanto, la fábrica escribe la migración y las pruebas de RLS.
- **CLI de volumen (pintura, sin comportamiento):**
  - los esqueletos de carga de los cinco bloques;
  - los estados vacíos, con icono en círculo, frase en serif y explicación corta;
  - las dos tarjetas de métrica del cuadro, que reciben la cifra ya hecha.
- **No delegables:** la rejilla, los paneles, el diálogo, el foco, el arrastre, `construirVista`, la acción y la migración (foco, ARIA, formularios, RLS y reloj).

---

## Lo que no entra, y por qué

- **Vista anual y «Nueva cita».** No están en el contrato. El alta es de T-028.
- **«Modalidad»** en la fila: la cita no tiene esa columna (H15). La fila dice `tipo · profesional`.
- **«Pendientes» de preparación o cobro, ingresos del mes, abandono y trazabilidad documental.** No hay datos (no hay facturación, evaluaciones ni informes) o no hay definición (abandono). Se pintan cuando exista la fuente. Queda anotado como choque 14 en `interfaz.md`.
- **Escalado real y campana.** Son de T-015. Aquí solo va la antigüedad (D10).
- **Aviso de sesión en curso.** T-015.
- **Arrastre en la vista mensual y arrastre táctil.** La alternativa es «Reprogramar», con las mismas acciones (D4).
- **Cambiar el estado de la cita** (confirmar, marcar realizada o no asistida) y **editar sala o nota operativa** desde el panel. No están en el contrato.
- **Color del profesional configurable** (`perfiles.color`), D7.
- **Corregir T-010** (`fecha_referencia` en UTC; la alerta cuando la cita se marca realizada antes del fin) y **T-011** (H8, H9). Se anotan como hallazgos; la corrección de T-011 es la opción B de D6 si el propietario la elige.
- **Unificar `EstadoVisibleCita` y las claves `agenda.estado.*` de `lib/agenda`.** Es otro carril y queda anotado.
- **Pruebas de Playwright autenticadas de `/agenda`.** `test:a11y` no tiene sesión (H26). El teclado se prueba con Testing Library, que es la prueba de teclado propia que pide el ADR-041.
- **Distinguir al director administrativo (ADR-065/066).** T-014 no lo necesita: el tipo y la nota van por datos (vista del técnico); «Notas» y el aviso, por ser el profesional de la cita; el cuadro, por lista blanca en fallo cerrado (D13). El ticket que implemente el ADR-065 decide si ese perfil ve el cuadro y el tipo de terapia.

---

## Nota del 24-09-2026 · D6 queda resuelta como B y depende de T-011b

El propietario eligió la **opción B** de D6. La rama «esta y las siguientes» de `reprogramarCita`
(§1.3, paso 6) deja de estar bloqueada por D6 y pasa a **depender de T-011b**
(`tickets/T-011b-editar-serie-desde-la-cita.md`, diseño en `tickets/T-011b/diseno.md`). No se
implementa hasta que T-011b esté fusionado.

Cambios para T-014 cuando T-011b esté en `main`. Solo afectan a esta rama; lo demás de este diseño
no cambia.

**Qué hace la rama.** Se va la condición de «mismo día» de la opción A. Con
`cita.desviada` sigue devolviendo `parametro_invalido`.

1. Se calcula el instante de destino como en los pasos 4 y 5.
2. Se expresa ese instante en **la zona de la cita** (`cita.zona_horaria`, que es la de la serie)
   como `fecha` (AAAA-MM-DD) y `hora` (HH:MM). **No** se pasa `zonaHoraria`: eso cambiaría la zona
   de la serie.
3. Se llama a
   `editarSerie(sesion, { citaId, alcance: 'esta_y_siguientes', fecha, horaLocal: hora })`.
4. Entre `propuestaIds` se busca la propuesta cuya `citaId === datos.citaId`, se confirma, y el
   resto sigue como decía la opción A.

La duración no cambia por arrastre, así que no se pasa `duracionMinutos`.

**Qué garantiza T-011b.**

- La regla parte de la cita elegida (H8).
- Cada cita siguiente toma el día nuevo en su semana relativa, y la duración de la regla (H9).
- La propuesta de la cita arrastrada cae exactamente en `fecha`.
- `22023` si la cita ancla es pasada, en curso, cancelada o desviada, o si su horario nuevo ya
  pasó.
- Al confirmar, `22023` si la propuesta ya no vale.

**Qué cambia en el diseño de T-014.**

- §1.6.2: `alcanceSiguientesPermitido = deSerie && !desviada && estado ∈ {programada, confirmada} && inicio > ahora`.
- §1.6.3: el segundo radio ya no se deshabilita «por otro día»; solo por la condición anterior.
- **Mensajes.** Todo `22023` llega como `parametro_invalido`. Si el diálogo quiere distinguir
  «la serie ya tiene otra regla» o «la cita cambió», lo añade T-014 en `lib/citas/errores.ts`, que
  está en su territorio. Los fragmentos literales están en la tabla del §3 del diseño de T-011b.
- **Si el instante de destino cae en una hora ambigua** de la zona de la serie (la segunda 02:30 de
  octubre), `resolver_hora_local` elige la primera. T-014 compara el `inicio_propuesto` de la
  propuesta de la ancla con su instante. Si no coinciden, no confirma y dice por qué.
