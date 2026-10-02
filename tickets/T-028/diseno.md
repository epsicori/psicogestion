# T-028 · Diseño — Alta de cita (sugerencias, serie y conflicto)

> Riesgo medio (sonnet). Diseño corto. **Estado: BLOQUEADO en parte** — la pantalla se puede
> diseñar entera, pero **no se puede cerrar sin una pieza de base de datos que hoy no existe**
> (§B). Lo que no depende de ella está separado como corte A.
>
> **02-10-2026 · Enmienda ADR-074/075 (al final del fichero).** Manda sobre §B y §0-§7. Lo
> sustituido no se borra: lleva «**[Sustituido → En]**» y se lee en la enmienda.

## B · Bloqueo y preguntas al propietario

**[Resuelto: T-028a aprobado; ver «Decisiones del propietario» y E2]** **B1 · Falta base de datos (supabase/ ocupado: T-012 → T-036 → T-035).** Cuatro cosas que el
contrato pide no se pueden hacer leyendo lo que existe (hechos H1–H5, H15):

| Pide el contrato | Lo que hay | Por qué no basta leer |
|---|---|---|
| Bloques de sesión **reales** libres/ocupados | `disponibilidad` + `agenda_citas_rango` | El bloque real termina en `fin + descanso` y el descanso de **otro** perfil no se puede leer (H15); el técnico solo ve las citas de **sus** centros (H8): un profesional en dos centros saldría libre donde está ocupado. |
| Previsualizar la serie **antes** de guardar, con festivo + alternativa | Solo `agenda_crear_serie`, que escribe | No hay modo «solo mirar» (H4). Rehacer en TypeScript la búsqueda de alternativa a 7 días de H1 es la segunda implementación que la regla de citas prohíbe. |
| Confirmar **sesión a sesión** (dejar fechas fuera) y guardar **sala** y **nota operativa** | `agenda_crear_serie` sin esos parámetros (H2) | Quitar fechas después = citas `cancelada` falsas; la nota operativa no la escribe ninguna función (y el técnico no puede ni por `update`, H8). |
| Cita **suelta** | Ninguna función (H5) | Un `insert` directo no marca `anomalia_horaria`, y una «serie de 1» pinta la cita como de serie y pregunta «¿esta y las siguientes?». |

**Propuesta:** un ticket previo **T-028a «Base del alta de cita»** (carril `supabase/`,
`riesgo: alto`, Opus, dos revisores), con el contrato de §1.A. T-028 pasa a
`depende_de: [T-028a]`. **Pregunta:** ¿lo apruebas y en qué puesto de la cola de `supabase/`
(propuesta: tras T-035)?

**[Sustituido → E3 (ADR-075)]** **P1 · Modalidad.** El contrato la pide como campo, pero `citas` no tiene modalidad (H6) y
`docs/interfaz.md` §14 ya dejó escrito que «no existe en la cita». **Propuesta:** fuera de T-028
(nada de controles sin dato). Si la quieres, es una columna nueva y entra en T-028a. ¿Fuera?

**[Sustituido → E1 (ADR-074)]** **P2 · «Tipo por defecto del profesional».** No existe (H7). **Propuesta:** el técnico crea la
cita con `tipo_terapia_id = null` y **50 minutos** (el valor por defecto de `series_cita` y de
`tipos_terapia`); el tipo lo pone después quien puede verlo. Añadir un tipo por defecto por
profesional es una columna y una pantalla de ajustes: otro ticket. ¿Vale?

**[Aceptado por el propietario]** **P3 · El criterio de marzo.** Por ADR-034 §3, una serie semanal a las 12:00 que cruza el
último domingo de marzo **no tiene ninguna sesión anómala**: la hora local es la misma y solo
cambia el instante (H21). Solo hay anomalía si una sesión cae entre 02:00 y 03:00 de ese
domingo. **Propuesta:** el criterio se lee «las ocho con la misma hora local; y si alguna cae
en el hueco o el solape, marcada», y la marca se demuestra con el banco de T-028a y la prueba
del componente, no con el recorrido manual (no hay franjas de madrugada que elegir). ¿Vale?

Lo que **no** pregunto porque ya está decidido en código: el técnico no escribe nota operativa
(`agenda_actualizar_cita` lo prohíbe a propósito, «una función que las escribiera a ciegas
sería una puerta de vuelta al choque 4», `…agenda_esquema.sql:611-614`). El campo se le
**omite** igual que el tipo. **[«igual que el tipo» sustituido → E1: el tipo ya no se omite
en el alta; la nota operativa sí, y por la misma razón]**

## 0 · Hechos verificados contra el código

### Lo que la base ya da (sin tocar `supabase/`)

- **H1** `agenda_crear_serie(p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id,
  p_periodicidad, p_dia_semana, p_hora_local, p_duracion_minutos, p_desde, p_sesiones_totales,
  p_fin_el)` — `supabase/migrations/20260910120000_series_materializacion_desviaciones.sql:564`.
  `security definer`, **materializa en el acto**. Por cada fecha de `ocurrencias_serie()`:
  festivo/ausencia → `propuestas_cita` con alternativa a ≤ 7 días (`inicio_propuesto` nulo si no
  la encuentra); choque `23P01` → propuesta `ocupada` **sin error**; si no, inserta la cita con
  `desviada = true, motivo_desviacion = 'anomalia_horaria'` cuando `resolver_hora_local` no da
  `normal`. Devuelve `{serie_id, zona_horaria, citas:[{cita_id, fecha}], propuestas:[{propuesta_id,
  fecha, motivo}]}`. Envuelta por `crearSerie()` (`lib/citas/series.ts:14`), **sin ningún llamante
  en `app/`** (H19).
- **H2** `agenda_crear_serie` **no recibe** `sala`, `nota_operativa` ni fechas a excluir. La zona
  la pone la base (`zona_horaria_centro`); `p_desde` pasado → `22023`.
- **H3** `ocurrencias_serie` y `resolver_hora_local` tienen `grant execute … to authenticated`
  (`…20260925120000_editar_serie_desde_la_cita.sql:1135`, `…20260910120000…:1239`).
- **H4** No hay previsualización **de alta**; la única es `agenda_previsualizar_edicion_serie`
  (`lib/citas/previsualizar.ts`), con su `firmarPrevisualizacion()` (sha256 de lo enseñado).
- **H5** No hay alta de cita suelta. `citas_alta` (`…20260911120000_vinculo_en_el_alta_de_agenda.sql:37`)
  admite `insert` directo de administrador, profesional asignado (+ disparador
  `fn_exigir_vinculo_agenda`) y técnico en sus centros; `rango_bloqueante` lo pone un disparador.
- **H6** `citas` (`…20260906120000_agenda_esquema.sql:180`) no tiene modalidad; la única es
  `episodios.modalidad_relacional`, que es del episodio.
- **H7** No existe tipo de terapia por defecto del profesional (grep sin resultados).
  `tipos_terapia`: `duracion_minutos` (def. 50), `tarifa_base`, `activo`; el directorio lo leen
  los tres roles (`…agenda_esquema.sql:676`).
- **H8** El técnico no tiene `select` sobre `citas`; lee `citas_agenda` (`security_barrier`, sin
  `tipo_terapia_id` ni `nota_operativa`, solo sus centros; `…agenda_esquema.sql:515`).
  `agenda_citas_rango` une las dos ramas, tope 62 días, `null` literales al técnico.
- **H9** `disponibilidad` (franja/ausencia/festivo, por perfil y opcionalmente centro, hora local +
  zona) la leen los tres roles (`…agenda_esquema.sql:788`). **La siembra no crea ninguna franja**
  (`scripts/seed.mjs`, grep `disponibilidad` sin resultados).
- **H10** Descanso en `perfiles.descanso_activo/descanso_minutos` (5–20, def. 10), solo por detrás:
  `rango_bloqueante = [inicio, fin + descanso)`.
- **H11** `23P01` → `hueco_ocupado` (`lib/citas/errores.ts:12`; tipos `lib/citas/tipos.ts:42`).
  `confirmarPropuesta` / `descartarPropuesta` en `lib/citas/propuestas.ts:78,95`.
- **H12** `esquemaCrearSerie` (`lib/citas/esquemas.ts:56`) acaba en `.refine` → no admite
  `.omit/.pick` (TS-H7); `desde` no comprueba fecha real (sí `esquemaEditarSerie.fecha` con
  `esFechaReal`).
- **H15** `perfiles` solo se lee **el propio** (`perfiles_lectura_propia`,
  `…20260815192424…:165`); el resto, por `directorio_perfiles` (id, nombre, rol, estado, centro),
  **sin descanso**.
- **[Se cierra en T-028a (propietario); re-verificado y ampliado por H23-H25 → E0]** **H16** (hallazgo, no de este ticket) El técnico puede hacer `insert` directo en `citas` con
  `tipo_terapia_id` y `nota_operativa` por la política `citas_alta`: escribe a ciegas lo que no
  puede leer. → anotar en `docs/state.md`; se cierra en T-028a revocando `insert` directo si el
  propietario lo aprueba.

### Interfaz existente

- **H13** T-012 (en implementación) posee `app/(app)/pacientes/[id]/**`,
  `app/(app)/agenda/notas.ts(+test)` **y `lib/i18n/es.ts`** (`tickets/T-012-*.md:10-22`). El sitio
  del botón de la ficha es `app/(app)/pacientes/[id]/panel-resumen.tsx:147` (bloque
  `ficha.proximaCita`).
- **H14** `docs/interfaz.md` §14: «Modalidad no existe en la cita»; a 360 px la semana es «tira de
  7 días + lista del día por hora, sin arrastre» (`app/(app)/agenda/lista-dia.tsx`).
- **H17** `components/ui/dialogo.tsx`: `Dialogo({abierto, alCerrar, titulo, focoInicial,
  children})`, foco atrapado, Escape y devolución de foco ya resueltos (`./foco`); ancho fijo
  `max-w-lg`.
- **H18** `RejillaSemana({titulo, dias, eje, citas, diaInicial, alAbrirDia, alAbrirCita, alSoltar})`
  (`app/(app)/agenda/rejilla-semana.tsx:74`): foco rodante por días (`useFocoRodante`), Tab dentro
  del día, posición por `minutoPared`/`duracionMinutos`, `PX_MIN`; ningún `Date`. Los tipos
  `DiaVista`, `CitaVista`, `VistaCalendario` están en `app/(app)/agenda/vista.ts`.
- **H20** Next 16 (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
  intercepting-routes.md` y `parallel-routes.md`): modal = slot `@modal` + ruta interceptada
  `(.)…`; en recarga se pinta la página completa; **un slot sin `default.tsx` da 404 en
  navegación dura**.
- **H21** ADR-034 §3: solo hay anomalía en el hueco de marzo (se materializa hacia delante) y el
  solape de octubre (la primera); el resto de horas cruzan el cambio sin marca.
- **H22** `app/(app)/layout.tsx` es `<Armazon>{children}</Armazon>`, sin slots.

## 1 · Piezas y contratos

### 1.A · Contrato que T-028 consume de T-028a (NO es territorio de T-028)

> **[Ampliado → E2]**: tipo obligatorio y duración del tipo, puertas del técnico (H16, H23, H24);
> la siembra va en `supabase/seed-completo.sql` (H26). Contrato: `tickets/T-028a-base-del-alta-de-cita.md`.

Todas `security definer`, `search_path = ''`, autorización **igual que `agenda_crear_serie`**
(administrador · `p_profesional_id = auth.uid()` + vínculo · técnico con `p_centro_id in
centros_actuales()`), y **ninguna devuelve identidad de otras citas**.

1. `agenda_bloques_profesional(p_profesional_id uuid, p_centro_id uuid, p_desde date, p_hasta date,
   p_duracion_minutos smallint) returns table (fecha date, hora_local time, inicio timestamptz,
   fin timestamptz, estado text)` — `estado ∈ {'libre','ocupado'}`. Recorre las `franja` del
   profesional para ese centro (o `centro_id is null`), salta días de festivo/ausencia, y dentro
   de cada franja avanza un cursor: si `[cursor, cursor+dur+descanso)` choca con el
   `rango_bloqueante` de una cita del profesional (**en cualquier centro**), emite ese tramo como
   `ocupado` y salta al final del rango; si no, emite `libre` `[cursor, cursor+dur)` y avanza
   `dur + descanso`. Tope 62 días (`22023`). `stable`.
2. `plan_alta_serie(...)` interna (patrón de `plan_edicion_serie`) que calcula por fecha
   `{fecha, hora_local, inicio, fin, clasificacion, bloqueo, alternativa}`, y la usan **las dos**:
   - `agenda_previsualizar_alta(p_paciente_id, p_profesional_id, p_centro_id, p_periodicidad
     (null = suelta), p_dia_semana, p_hora_local, p_duracion_minutos, p_desde, p_sesiones_totales)
     returns jsonb` — `{zona_horaria, sesiones:[{fecha, hora_local, inicio, fin, clasificacion:
     'normal'|'inexistente'|'ambigua', bloqueo: null|'festivo'|'ausencia'|'ocupada', alternativa:
     null|{fecha, inicio, fin}}]}`. No escribe.
   - `agenda_crear_serie` **nueva versión** con `p_excluir date[] default null`, `p_sala text
     default null`, `p_nota_operativa text default null`, `p_estricta_primera boolean default
     false`. Excluida = ni cita ni propuesta, pero **consume su ordinal** (8 con 1 fuera = 7).
     `p_estricta_primera`: si la **primera** sesión choca, `23P01` y no se crea nada.
     `p_nota_operativa` no nula con rol técnico → `42501`.
3. `agenda_crear_cita(p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, p_fecha date,
   p_hora_local time, p_duracion_minutos smallint, p_sala text, p_nota_operativa text) returns
   uuid` — resuelve con `resolver_hora_local` y marca `anomalia_horaria`; festivo/ausencia →
   `22023` («cae en festivo»); `23P01` se propaga; fecha pasada → `22023`; nota + técnico → `42501`.
4. **[Fichero sustituido → E2: `supabase/seed-completo.sql`]** Siembra (`scripts/seed.mjs`): franjas L–V 09:00–14:00 y 16:00–20:00 para los profesionales
   sembrados; un festivo futuro; un paciente con **seis citas pasadas los martes a las 12:00** y
   otro **sin citas**. Banco `scripts/rls/NN-alta.sql`. `npm run tipos`.

### 1.B · `lib/agenda/sugerencias.ts` (función pura, corte A)

```ts
export type CitaPasada = { fecha: string /* AAAA-MM-DD local */; diaSemana: 1|2|3|4|5|6|7; horaLocal: string /* HH:MM */ };
export type BloqueLibre = { fecha: string; horaLocal: string; diaSemana: 1|2|3|4|5|6|7 };
export type MotivoSugerencia =
  | { tipo: 'comoLasUltimas'; n: number }              // «Como las seis últimas»
  | { tipo: 'diaHabitual'; diaSemana: number; hora: string } // «Martes a las 12:00, su día habitual»
  | { tipo: 'cadaIntervalo'; dias: number }            // «Cada dos semanas, como de costumbre»
  | { tipo: 'primerHueco' };                           // «Primer hueco libre»
export type Sugerencia = { fecha: string; horaLocal: string; motivo: MotivoSugerencia };
export type ResultadoSugerencias = { modo: 'habitual' | 'enFrio'; sugerencias: Sugerencia[] /* ≤ 3 */ };
export function sugerirHuecos(entrada: {
  pasadas: CitaPasada[];          // las ≤ 6 últimas, ya sin canceladas, orden ascendente
  libres: BloqueLibre[];          // orden ascendente, ya en la zona del centro
  hoy: string;                    // AAAA-MM-DD en la zona del centro (lo da el servidor)
  excluir?: string[];             // `${fecha}T${hora}` recién rechazados por 23P01
}): ResultadoSugerencias;
```

Algoritmo (ADR-049c, y nada más):
1. `intervalos` = días entre fechas consecutivas de `pasadas` (`diasEntre` de `lib/fechas/calendario`).
   `intervaloModa` = el más frecuente; empate → el menor. `diaHabitual` = moda de `diaSemana`;
   `horaHabitual` = moda de `horaLocal` entre las de `diaHabitual`. Cada moda vale solo con
   **frecuencia ≥ 2**.
2. **Habitual** si `pasadas.length ≥ 3` y existen las tres modas. Si no → **en frío**.
3. Habitual: objetivo = última fecha + `intervaloModa`, avanzado de `intervaloModa` en
   `intervaloModa` hasta ser > `hoy`. Se buscan en `libres` (descontando `excluir`), por orden:
   (a) el bloque en la fecha objetivo a `horaHabitual`; motivo `comoLasUltimas` si las 6 (o
   todas las `pasadas`) coinciden en día y hora, si no `cadaIntervalo`; (b) el siguiente bloque
   libre en `diaHabitual` a `horaHabitual` → `diaHabitual`; (c) el primer bloque libre no usado
   → `primerHueco`. Si (a) o (b) no existen en la ventana, se rellena con `primerHueco` hasta 3.
4. En frío: los 3 primeros `libres` (> `hoy`, sin `excluir`), todos `primerHueco`.
5. **Ninguna cifra** sale de aquí salvo `n` y `dias`, que se escriben con palabras (i18n), y
   **ningún motivo lleva tipo de terapia** (no se le pasa: no puede nombrarlo).

### 1.C · `lib/citas/alta.ts` (`server-only`, corte B)

Envoltorios finos, mismo estilo que `series.ts` (nunca lanzan, `ResultadoCitas`, `mapearErrorCitas`):
- `leerBloques(sesion, {profesionalId, centroId, desde, hasta, duracionMinutos})` → `agenda_bloques_profesional`.
- `leerUltimasCitasPaciente(sesion, rol, {pacienteId, profesionalId, antesDe})` → ≤ 6 filas
  `{inicio, zona_horaria}`, `estado <> 'cancelada'`, `inicio < antesDe`, orden desc. **Dos ramas
  por rol, como `leerCita` (`lib/citas/agenda.ts:149`)**: técnico → `citas_agenda`; resto →
  `citas`. Columnas: solo `inicio, zona_horaria`. Es la única consulta propia sobre citas
  (§5, revisión Opus de este fichero).
- `previsualizarAlta(sesion, entrada)` → `agenda_previsualizar_alta`, validada con Zod
  `strictObject` (falla cerrado como `previsualizar.ts`) + `firmarPrevisualizacionAlta()` (sha256
  de `[periodicidad, horaLocal, duracion, zona, sesiones.map(s => [fecha, inicio, bloqueo,
  alternativa?.inicio])]`).
- `crearCitaSuelta(sesion, entrada)` → `agenda_crear_cita`.
- `crearSerieAlta(sesion, entrada)` → `agenda_crear_serie` v2 con `p_estricta_primera = true`, y
  después `confirmarPropuesta` para cada propuesta cuya `fecha` esté en `aceptarAlternativas`.
  Devuelve `{serieId, citaIds, propuestasPendientes: {fecha, motivo}[]}` (las no confirmadas
  quedan en «Por confirmar», visibles; nunca en silencio).

### 1.D · Esquema: `lib/citas/esquemas.ts` (añadir)

> **[`tipoTerapiaId` nulable y `duracionMinutos` sustituidos → E1.4]**

```ts
export const PERIODICIDADES_ALTA = ['suelta', ...PERIODICIDADES] as const;
export const esquemaAltaCitaBase = z.object({
  pacienteId: z.uuid(), profesionalId: z.uuid(), centroId: z.uuid(),
  tipoTerapiaId: z.uuid().nullable(), duracionMinutos: z.int().min(5).max(480),
  fecha: z.string().regex(FECHA_ISO).refine(esFechaReal), horaLocal: z.string().regex(HHMM),
  periodicidad: z.enum(PERIODICIDADES_ALTA), sesionesTotales: z.int().min(2).max(52).nullable(),
  sala: z.string().trim().max(200).nullable(), notaOperativa: z.string().trim().max(500).nullable(),
  excluir: z.array(z.string().regex(FECHA_ISO)).max(52),
  aceptarAlternativas: z.array(z.string().regex(FECHA_ISO)).max(52),
  firma: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
});
export const esquemaAltaCita = esquemaAltaCitaBase.superRefine(/* suelta ⇔ sesionesTotales null y firma null;
  serie ⇒ sesionesTotales y firma; excluir ∩ aceptarAlternativas = ∅ */);
```
Mensajes en castellano literal (cabecera del fichero). El formulario usa `esquemaAltaCita`
con `react-hook-form`; la acción, el mismo.

### 1.E · Ruta y diálogo (corte B)

- `app/(app)/agenda/nueva/page.tsx` — página completa (entrada desde Agenda, enlace directo y
  recarga). Lee `searchParams` (async en Next 16): `paciente` (uuid), `inicio`
  (`AAAA-MM-DDTHH:MM`, **hora local sin desfase**, interpretada en la zona del centro; con `Z` o
  desfase se ignora), `centro` (uuid; si falta, el de la cookie `COOKIE_CENTRO` como
  `cargarContexto`). Parámetro inválido → se ignora, nunca 500.
- `app/(app)/layout.tsx` — `({children, modal})` → `<Armazon>{children}{modal}</Armazon>`.
- `app/(app)/@modal/default.tsx` → `return null`. **Obligatorio** (H20).
- `app/(app)/@modal/(.)agenda/nueva/page.tsx` — mismo contenido dentro de `<DialogoAlta>`
  (cliente) que envuelve `Dialogo` y cierra con `router.back()`. Al cerrar, `Dialogo` devuelve
  el foco al enlace que lo abrió (H17), que sigue montado porque la ficha no se desmonta.
- `components/ui/dialogo.tsx` — prop opcional `ancho?: 'normal' | 'amplio'` (def. `normal`, sin
  cambio para quien ya lo usa); `amplio` = `max-w-5xl`, y por debajo de `md` ocupa la pantalla.
- `app/(app)/agenda/nueva/contenido-alta.tsx` (servidor) — carga y compone; lo usan las dos
  rutas. Cargas (todas en servidor, en `<Suspense>` por pieza con su esqueleto):
  rol (`cargarRol`), centros (`cargarContexto`), paciente (`pacientes`: `id, nombre, apellidos,
  profesional_id`), profesionales (`directorio_perfiles` con `rol = 'profesional_sanitario'`,
  `estado = 'activo'`), tipos (`tipos_terapia` activos) **[Sustituido → E1.1: todos los roles, tres columnas]** **solo si rol ≠ técnico** — ni se piden,
  ni viajan en la carga RSC —, bloques de la semana, últimas citas, sugerencias.
  **No importa nada de `lib/notas/`, episodios, diagnósticos ni de `historia/`.**
- Botón **«Nueva cita»** en `app/(app)/agenda/page.tsx` (cabecera, junto al `h2`): `<Link
  href="/agenda/nueva">`.
- Botón en la ficha: `<Link href={`/agenda/nueva?paciente=${id}`}>` en `panel-resumen.tsx:147`,
  **corte C, después de que T-012 integre** (H13).

### 1.F · Formulario y piezas (`app/(app)/agenda/nueva/`, corte B)

- `formulario-alta.tsx` (`'use client'`) — orden: paciente (fijo con su nombre si viene de la
  ficha; si no, **buscar y elegir**: campo de texto + lista de botones de resultado, por la
  acción `buscarPacientes(texto)` con ≥ 2 caracteres y 10 resultados); profesional (fijo si rol
  = profesional; si no, desplegable con el asignado preseleccionado); centro; sala; tipo de
  terapia **[Sustituido → E1.1-E1.3]** (**solo si rol ≠ técnico**; fija la duración); duración (solo lectura, sale del tipo;
  técnico: 50); periodicidad (radio: suelta · semanal · quincenal · mensual) y nº de sesiones
  (2–52, por defecto 8) si no es suelta; tarjetas de sugerencia; calendario de selección;
  previsualización; nota operativa (**solo si rol ≠ técnico**, etiqueta «Nota operativa ·
  logística» y ayuda «Sala, material o aviso de acceso. Lo clínico va en la historia.»);
  «Guardar».
- `tarjetas-sugerencia.tsx` — tres botones; título del bloque «Sugerencias» o «Primeros huecos
  libres» (en frío); cada tarjeta: fecha larga, hora en mono, motivo. Elegir una = elegir el
  hueco del calendario.
- **Calendario de selección = `RejillaSemana` y `ListaDia` en modo selección**: prop opcional
  `seleccion?: { huecos: HuecoVista[]; elegido: string | null; alElegir: (h: HuecoVista) => void }`.
  Con `seleccion`: no se pintan citas ni hay arrastre ni panel de día; se pintan los `huecos`
  con la misma geometría (`minutoPared`, `duracionMinutos`, `PX_MIN`) y la misma navegación
  (flechas entre días, Tab dentro del día). `libre` = `<button>` con `aria-label` completo y
  `aria-pressed` si es el elegido; `ocupado` = `<div>` no enfocable con el texto «Ocupado».
  Marcas, **nunca solo color**: sugerida = borde discontinuo + texto «Sugerida n»; habitual =
  barra izquierda de 3 px + texto «Habitual» (sin fondo: ver §2-D7); elegido = `bg-secondary`
  + «Elegida». `<md`: `ListaDia` con la tira de 7 días y la lista de bloques del día.
  Navegar de semana = acción `recalcularAlta`, no `Date` en cliente.
- `HuecoVista` en `app/(app)/agenda/nueva/vista-alta.ts` (servidor, solo cadenas y números):
  `{clave, fecha, horaLocal, diaIndice, minutoPared, duracionMinutos, estado: 'libre'|'ocupado',
  sugerida: 1|2|3|null, habitual: boolean, etiqueta: string, rango: string}`. `etiqueta` =
  «Martes 8 de septiembre, 17:00, libre, sugerida» compuesta con i18n.
- `previsualizacion-serie.tsx` — lista ordenada, una fila por sesión: casilla («Incluir», marcada
  por defecto), fecha larga, hora en mono, estado como texto. `bloqueo` festivo/ausencia: fila
  marcada «Festivo» / «Ausencia», **sin hora encima**, con «Alternativa: jueves 10, 12:00»
  (casilla «Aceptar alternativa») o «Sin alternativa: queda fuera». `ocupada`: igual con
  «Ocupado». `clasificacion ≠ normal`: «Cambio de hora: queda a las 03:00» con la hora
  resultante. Casillas «Todas / ninguna» arriba (`Casilla` con `indeterminada`).
- `acciones.ts` (`'use server'`), cada una con `exigirSesion()`, rol leído en servidor y el
  esquema Zod: `recalcularAlta`, `previsualizarAltaSerie`, `guardarAlta`, `buscarPacientes`.
  **[Sustituido → E1.5: solo `notaOperativa`]** **Rol técnico: `tipoTerapiaId` y `notaOperativa` se fuerzan a `null`** antes de llamar;
  **rol profesional: `profesionalId = usuario.id`**. `guardarAlta`:
  - serie: re-previsualiza; firma distinta → `{ok:false, motivo:'previsualizacion_caducada',
    previa}` (la pantalla la enseña de nuevo y pide confirmar);
  - `hueco_ocupado` → `{ok:false, motivo:'hueco_ocupado', bloques, sugerencias}` recalculadas
    con `excluir = [el hueco]`; la pantalla dice «Ese hueco acaba de ocuparse» en una región
    `role="status"` junto a las sugerencias, **sin resetear el formulario**;
  - éxito → `revalidatePath('/agenda')` y `revalidatePath('/pacientes/[id]', 'page')`, y la
    pantalla cierra (modal: `router.back()`; página: a `/agenda?semana=<fecha>`).
- **Aviso de hueco raro** (no bloqueante), calculado en `vista-alta.ts` sobre los bloques del día
  elegido: si entre el fin del bloque ocupado anterior (o el siguiente) y el elegido queda un
  hueco `> descanso` y `< duración`, nota «Deja un hueco de 25 min que no cabe en una sesión» +
  hasta dos alternativas (bloques libres contiguos a citas) + «Agendar igualmente», que es el
  propio «Guardar». Con los bloques de T-028a no hace falta leer el descanso: el hueco raro es
  el tramo libre que **no** generó bloque.
- Vacío / error / cargando por pieza: sugerencias (en frío no es vacío; vacío = «Sin huecos
  libres en las próximas 4 semanas»), calendario («Este profesional no tiene horario en este
  centro» cuando no hay franjas), previsualización. Esqueletos en
  `app/(app)/agenda/nueva/esqueletos.tsx`.

### 1.G · Ventanas

Bloques: semana visible (7 días) para el calendario; **4 semanas** desde mañana para las
sugerencias (dentro del tope de 62). Últimas citas: sin ventana (límite 6).

## 2 · Decisiones y alternativas descartadas

- **D1** Bloques, previsualización y altas en la base (T-028a). *Descartado:* calcularlos en
  TypeScript con `disponibilidad` + `agenda_citas_rango`: sin descanso ajeno y con el técnico
  ciego a otros centros, sugiere huecos que la base rechaza; y duplica la búsqueda de alternativa.
- **D2** Una función interna compartida (`plan_alta_serie`) entre previsualizar y crear.
  *Descartado:* dos funciones paralelas, que divergen en el primer arreglo.
- **D3** El hueco elegido es **estricto** (`p_estricta_primera`): si choca, error y nada creado.
  *Descartado:* la propuesta `ocupada` silenciosa de hoy, que crea la serie con su primera sesión
  en «Por confirmar» sin decirlo.
- **D4** Firma de la previsualización re-comprobada al guardar (patrón T-014). *Descartado:*
  confiar en que nada cambió entre mirar y guardar.
- **D5** Modal = ruta interceptada en `app/(app)/@modal`. *Descartado:* diálogo con estado local
  (no sobrevive a recarga) y slot en `pacientes/[id]` (territorio de T-012, y la ruta interceptada
  quedaría solo para la ficha). Consecuencia aceptada: desde Agenda también abre como diálogo en
  navegación blanda.
- **D6** `?inicio=` es hora **local** sin desfase. *Descartado:* instante ISO, que no puede decir
  «las 02:30 que no existen» y obliga a convertir en el enlace.
- **D7** «Habitual» es marca (barra + texto), sin fondo. *Descartado:* fondo tenue, que hay que
  defender ante el validador en cada tema; la barra se valida como contraste no textual (3:1) en
  `lib/contraste/tokens.ts`.
- **D8** Los motivos **nunca** nombran el tipo de terapia, para ningún rol. *Descartado:*
  nombrarlo «si el rol puede»: una rama de rol más donde equivocarse, sin valor para la pantalla.
- **D9** Fin de serie por **número de sesiones** (2–52). *Descartado:* «hasta el día X» en esta
  pantalla; la base lo admite pero el contrato pide «ocho sesiones» y no fecha de fin.
- **D10** Buscar paciente = campo + lista de botones. *Descartado:* combobox ARIA nuevo (una
  primitiva más con foco que escribir y probar).
- **D11** Ninguna cita ajena en el calendario de selección: solo bloques `libre/ocupado`.
  *Descartado:* reutilizar `CitaVista` con nombres de otros pacientes: no hace falta para elegir.

## 3 · Cómo se cierra cada criterio de aceptación

| Criterio | Cómo se demuestra |
|---|---|
| Desde la ficha abre con paciente fijado; recargar la deja en pie | Manual (corte C) + `contenido-alta.test.tsx`: con `paciente` el campo es texto, no control. Recarga: H20, página completa en la misma URL. |
| Desbloqueo vigente, cero dato clínico | Manual con PIN abierto; prueba `contenido-alta.test.tsx` que renderiza con un paciente sembrado y comprueba que no aparecen «diagnóstico», «episodio», «motivo de consulta»; revisión: `grep -rn "lib/notas\|episodio\|diagnost\|historia" app/(app)/agenda/nueva` vacío. |
| Sin PIN funciona entero, serie incluida | Manual con sesión nueva sin PIN; ninguna llamada a `exigirDesbloqueo`/candado en el árbol (`grep`). |
| Seis martes a las 12 → 1.ª sugerencia martes 12, «como las seis últimas»; ninguna cifra | `lib/agenda/sugerencias.test.ts` (caso exacto) + manual con el paciente sembrado; `tarjetas-sugerencia.test.tsx`: ningún `\d+ ?%`, `/\b\d{2,3}\b/` fuera de la hora y la fecha, ni `★`. |
| Sin citas → «Primeros huecos libres», nada de habitual | `sugerencias.test.ts` (`modo: 'enFrio'`, solo `primerHueco`) + prueba del componente que busca el texto exacto y la ausencia de «habitual». |
| **[Sustituido → E4]** Técnico: tipo de terapia fuera del DOM y de los motivos | Manual como técnico (`document.querySelector('[name=tipoTerapiaId]') === null`); `formulario-alta.test.tsx` con rol técnico; revisión: `tipos_terapia` no se consulta con rol técnico (no viaja en RSC). |
| Semanal × 8 cruzando marzo: misma hora; anomalía marcada | Según P3: manual (ocho filas a las 12:00) + `previsualizacion-serie.test.tsx` con fila `clasificacion: 'inexistente'` → «Cambio de hora» y la hora resultante; la clasificación real la prueba el banco de T-028a. |
| Festivo → marcado con alternativa, nunca encima | Manual con el festivo sembrado; prueba del componente: fila `bloqueo: 'festivo'` no pinta la hora original como cita y sí «Alternativa: …». |
| Dos pestañas → «Ese hueco acaba de ocuparse» con sugerencias nuevas y el formulario intacto | Manual (paso 4 del guion); `acciones.test.ts`: `hueco_ocupado` devuelve sugerencias sin el hueco; `formulario-alta.test.tsx`: tras ese resultado, sala y nota conservan su valor. |
| Recorrido con teclado y foco de vuelta | Manual + `dialogo-alta.test.tsx`: Tab al enlace, Enter abre, Escape cierra, foco vuelve al enlace (plantilla de primitiva). `rejilla-semana.test.tsx`: flechas y Tab en modo selección. |
| 360 px: todas las acciones, ≥ 44 px | Manual a 360 px; huecos con `min-h-11` en `ListaDia`; `test:a11y` sobre `/agenda/nueva`. |
| Junto a `/prototipo`, sin adornos | Manual; revisión: todo control tiene acción. |
| `npm run lint && npm run build` y verificador de T-009 en verde | Salida de los comandos + `npm run test:a11y` (playwright, `accesibilidad/`) con la ruta añadida. |

## 4 · Riesgos, por probabilidad

1. **(Alta)** Olvidar `app/(app)/@modal/default.tsx` o romper el layout del grupo: 404 en todas
   las rutas de `(app)` en navegación dura. → Build + abrir `/pacientes` y `/agenda` recargando.
2. **[Sustituido → E5]** **(Alta)** El tipo de terapia viaja al técnico por la carga RSC aunque no se pinte. → No se
   consulta con ese rol; prueba que mire las props del formulario.
3. **(Media)** La cola de `supabase/` retrasa T-028a y T-028 se queda a medias. → Corte A no
   depende de ella; cortes B y C sí.
4. **(Media)** Previsualización caducada en bucle si otra persona agenda sin parar. → Cada
   `caducada` enseña la nueva y pide confirmar; nunca reintenta solo.
5. **(Media)** Propuestas aceptadas que no se pueden confirmar al guardar (otra reserva entre
   medias). → Se quedan en «Por confirmar» y la pantalla lo dice con su fecha.
6. **(Baja)** `RejillaSemana` en modo selección rompe su uso normal. → Pruebas existentes de
   `rejilla-semana.test.tsx` y `calendario.test.tsx` en verde sin tocarlas.
7. **(Baja)** Siembra sin franjas → calendario vacío en el guion. → T-028a §1.A.4.

## 5 · Qué revisar

- **[Sustituido → E6]** **Entradas que elige el llamante** en `guardarAlta`: `pacienteId`, `profesionalId`,
  `centroId`, `tipoTerapiaId`, `notaOperativa`, fechas. Con rol **técnico**, `tipoTerapiaId` y
  `notaOperativa` que lleguen rellenos **se anulan** en la acción (y la base de T-028a rechaza la
  nota: dos capas). Con rol **profesional**, `profesionalId` sale de la sesión. Centro ajeno al
  técnico → `42501` de la base; la acción no lo «arregla».
- **[La primera prueba, sustituida → E6]** **Prueba que debe fallar por el motivo exacto**: `formulario-alta.test.tsx` «el técnico no
  tiene tipo de terapia» debe fallar si se quita la rama de rol, **no** porque falten tipos en el
  fixture (dar tipos en el fixture también al técnico). `sugerencias.test.ts` «en frío» debe
  fallar si el umbral baja a 2 citas.
- **Puertas al dato clínico**: ningún `import` de `lib/notas/**`, `app/(app)/pacientes/[id]/historia/**`,
  episodios ni diagnósticos en `app/(app)/agenda/nueva/**` ni en `lib/citas/alta.ts`. El estado
  del candado no se lee.
- **`leerUltimasCitasPaciente`**: técnico por `citas_agenda`, nunca `citas`; columnas solo
  `inicio, zona_horaria`; filtra `estado <> 'cancelada'` y `profesional_id`. Sin `join`.
- **Cero `new Date()` en cliente** para pintar: `grep -n "new Date\|Date.now" app/(app)/agenda/nueva/*.tsx`
  solo en código de servidor.
- **Periodicidad**: exactamente suelta + los tres del ADR-034; ni «personalizada» ni regla libre.
- **Duplicados**: elegir dos veces el mismo hueco o doble clic en Guardar → el botón se
  deshabilita durante la acción (`useTransition`) y la base tiene el índice de exclusión.
- **`excluir` ∩ `aceptarAlternativas` vacío** (esquema) y fechas de `excluir` que no están en la
  previsualización → la base las ignora; revisar que la firma las cubre.
- **Sin cifra**: ni en tarjetas ni en `aria-label`.
- **Contraste**: el par de la barra «habitual» en `PARES` y `npm test lib/contraste` en verde.

## 6 · Territorio

> **[Ampliado → E7]**: añade `docs/interfaz.md` (choques 4 y 14).

```yaml
territorio:
  # corte A (ya)
  - lib/agenda/sugerencias.ts
  - lib/agenda/sugerencias.test.ts
  # corte B (tras T-028a y con T-012 integrado: comparte lib/i18n/es.ts)
  - lib/citas/alta.ts
  - lib/citas/alta.test.ts
  - lib/citas/esquemas.ts
  - lib/citas/esquemas.test.ts
  - lib/i18n/es.ts
  - lib/contraste/tokens.ts
  - components/ui/dialogo.tsx
  - components/ui/dialogo.test.tsx
  - app/(app)/layout.tsx
  - app/(app)/@modal/**
  - app/(app)/agenda/nueva/**
  - app/(app)/agenda/page.tsx
  - app/(app)/agenda/rejilla-semana.tsx
  - app/(app)/agenda/rejilla-semana.test.tsx
  - app/(app)/agenda/lista-dia.tsx
  - app/(app)/agenda/lista-dia.test.tsx
  - accesibilidad/**           # solo para añadir /agenda/nueva a la lista de rutas
  # corte C (tras integrar T-012)
  - app/(app)/pacientes/[id]/panel-resumen.tsx
```

`supabase/**`, `scripts/seed.mjs`, `scripts/rls/**` y `lib/supabase/tipos-bd.ts` son de T-028a.
**Convivencia con T-012**: `lib/i18n/es.ts` y `panel-resumen.tsx` no se tocan hasta que T-012
esté en `main`. El corte A no toca ninguno de los dos.

## 7 · Delegable

> **[Revisado → E8]**: ninguna pieza pinta tipo ni modalidad; regla nueva en el bloque común.

Pintura sin comportamiento para MiniMax. **Común a todos** (pegar en cada encargo):
componentes de servidor sin `'use client'`, TypeScript, React 19, Tailwind 4, `cn` de
`@/lib/utils`, iconos de `lucide-react` con `aria-hidden="true"`; texto **solo** con `t()` /
`tCon()` de `@/lib/i18n` (hay prueba contra literales); claves nuevas como bloque para el
namespace `agenda.alta` de `lib/i18n/es.ts` (lo pega la fábrica, CRLF); primitivas `Pildora`,
`EstadoVacio`, `Tarjeta` de `@/components/ui/piezas`; tokens `text-muted-foreground`, `bg-muted`,
`border-border`, `text-foreground`, `bg-secondary`; **nunca el color como único canal**; hora en
`font-mono`; Vitest + `@testing-library/react`, fichero hermano `*.test.tsx`; sin estado, efectos,
manejadores, foco ni ARIA salvo lo indicado. Todo en `app/(app)/agenda/nueva/`.

**P1 · `tarjeta-sugerencia-cuerpo.tsx`**
- Firma: `export function CuerpoSugerencia({ fecha, hora, motivo }: { fecha: string; hora: string; motivo: string })`.
- Pinta: `fecha` en `text-sm font-medium`, `hora` en `font-mono text-lg`, `motivo` en
  `text-sm text-muted-foreground`. Ningún número más. (El `<button>` que lo envuelve es de la fábrica.)
- Claves (para el compositor de motivos, no las usa la pieza):
  `agenda.alta.motivo.{comoLasUltimas:'Como las {n} últimas', diaHabitual:'{dia} a las {hora}, su día habitual', cadaIntervalo:'{intervalo}, como de costumbre', primerHueco:'Primer hueco libre'}`,
  `agenda.alta.numeros.{2:'dos',3:'tres',4:'cuatro',5:'cinco',6:'seis'}`,
  `agenda.alta.intervalo.{7:'Cada semana',14:'Cada dos semanas',21:'Cada tres semanas',28:'Cada cuatro semanas',otro:'Cada {dias} días'}`.
- Pruebas: pinta los tres textos; la hora va en un elemento con `font-mono`; no hay `role`.

**P2 · `cabecera-sugerencias.tsx`**
- Firma: `export function CabeceraSugerencias({ modo }: { modo: 'habitual' | 'enFrio' })`.
- Pinta un `<h3>`: `t('agenda.alta.sugerencias.titulo')` o `t('agenda.alta.sugerencias.enFrio')`, y
  en frío además `<p className="text-sm text-muted-foreground">` con `agenda.alta.sugerencias.enFrioAyuda`.
- Claves: `agenda.alta.sugerencias.{titulo:'Sugerencias', enFrio:'Primeros huecos libres', enFrioAyuda:'Aún no hay citas suficientes para saber su hora habitual.', vacio:'Sin huecos libres en las próximas cuatro semanas.', error:'No se han podido calcular las sugerencias.'}`.
- Pruebas: en frío aparece exactamente «Primeros huecos libres» y **no** aparece «habitual» en
  ningún texto; en habitual aparece «Sugerencias».

**P3 · `fila-sesion-prevista.tsx`**
- Firma: `export function CuerpoSesionPrevista({ fecha, hora, estado, alternativa, horaResultante }: { fecha: string; hora: string | null; estado: 'normal' | 'festivo' | 'ausencia' | 'ocupada' | 'cambioDeHora'; alternativa: string | null; horaResultante: string | null })`.
- Pinta `fecha`; si `hora`, en `font-mono`; según `estado` una `Pildora` con texto:
  `festivo`/`ausencia`/`ocupada` → `tono="warning"` y `agenda.alta.serie.{festivo|ausencia|ocupada}`;
  `cambioDeHora` → `tono="info"`, `tCon('agenda.alta.serie.cambioDeHora', {hora: horaResultante})`;
  `normal` → nada. Si `estado` es de bloqueo: `alternativa` → `tCon('agenda.alta.serie.alternativa', {cuando: alternativa})`,
  si es `null` → `t('agenda.alta.serie.sinAlternativa')`; y **no pinta `hora`** aunque llegue.
- Claves: `agenda.alta.serie.{festivo:'Festivo', ausencia:'Ausencia del profesional', ocupada:'Hueco ocupado', cambioDeHora:'Cambio de hora: queda a las {hora}', alternativa:'Alternativa: {cuando}', sinAlternativa:'Sin alternativa: queda fuera', incluir:'Incluir', aceptarAlternativa:'Aceptar alternativa', todas:'Todas', titulo:'Así quedaría la serie', vacio:'Elige un hueco y una periodicidad para ver la serie.', error:'No se ha podido calcular la serie.'}`.
- Pruebas: `festivo` con hora no pinta la hora; `cambioDeHora` pinta la hora resultante; las
  cinco variantes dan cinco textos distintos (sin depender del tono).

**P4 · `leyenda-seleccion.tsx`**
- Firma: `export function LeyendaSeleccion()`.
- Pinta una `<ul>` de cuatro muestras, cada una con su marca y texto: libre (borde sólido),
  ocupado (fondo `bg-muted`, texto «Ocupado»), sugerida (borde discontinuo), habitual (barra
  izquierda 3 px `border-l-primary`), elegida (`bg-secondary`). Muestras `aria-hidden`; el texto no.
- Claves: `agenda.alta.leyenda.{libre:'Libre', ocupado:'Ocupado', sugerida:'Sugerida', habitual:'Habitual', elegida:'Elegida'}`.
- Pruebas: cinco `<li>` con cinco textos; cada muestra tiene `aria-hidden="true"`.

**P5 · `esqueletos.tsx` y estados**
- Firma: `export function EsqueletoSugerencias()`, `EsqueletoSeleccion()`, `EsqueletoSerie()`, y
  `export function ErrorPieza({ mensaje }: { mensaje: string })` (un `<p role="alert">` sobre
  `EstadoVacio`). Copiar el patrón de `app/(app)/agenda/esqueletos.tsx`.
- Claves: `agenda.alta.cargando:'Cargando…'` (en `sr-only` dentro de cada esqueleto).
- Pruebas: cada esqueleto tiene el texto `sr-only`; `ErrorPieza` tiene `role="alert"` y el mensaje.

**No delegable** (fábrica): `sugerencias.ts`, `alta.ts`, esquema, acciones, modo selección de la
rejilla, `formulario-alta.tsx`, diálogo e interceptación, aviso de hueco raro.

## Lo que no entra, y por qué

- **Todo `supabase/`**: es T-028a (§B1).
- **[Sustituido → E9]** **Modalidad** (P1) y **tipo por defecto por profesional** (P2): no hay dato.
- **Fin de serie por fecha** (D9): la base lo admite, la pantalla no lo pide.
- **Detectar contenido clínico en la nota operativa**: el contrato pide etiqueta y ayuda, no un
  filtro; un filtro de palabras daría falsa seguridad.
- **Aviso de sesión en curso, campana y `wa.me`**: T-015 y mensajería (contrato).
- **[Sustituido → E9: entra en T-028a]** **Revocar el `insert` directo del técnico en `citas`** (H16): anotarlo en `docs/state.md`;
  cabe en T-028a si el propietario lo aprueba.

## Decisiones del propietario (02-10-2026) — mandan sobre §1-§7

- **B1 aprobado: T-028a** («Base del alta de cita», riesgo alto, `supabase/`) con el contrato de §1.A.
  Va en la cola detrás de T-035: T-012 → T-036 → T-035 → T-028a. **H16 se cierra en T-028a.**
- **P2 → ADR-074.** El técnico **elige** el tipo de terapia al dar la cita, porque lo informa el
  paciente, y **no lo ve** en ninguna pantalla de lectura. El formulario del técnico incluye el
  selector de tipo, que fija duración y tarifa. La agenda, la ficha de cita y la previsualización
  siguen omitiéndolo para él. En T-028a: el técnico lee `tipos_terapia` (el catálogo) y escribe el
  tipo solo a través de las funciones de alta. Se revisan §1, §5 y §6 con esto.
- **P1 → ADR-075.** «Modalidad» sale de T-028 tal como está escrita en el contrato. La modalidad
  relacional se hereda del episodio (`citas.episodio_id`), y presencial/online pasa a ser columna de
  la cita. Las dos llegan con un ticket propio de `supabase/` detrás de T-028a. Hasta entonces T-028
  no pinta modalidad.
- **P3** (lectura del criterio de marzo): se acepta la del diseño.

## Enmienda ADR-074/075 (02-10-2026) — manda sobre §B y §0-§7

ADR-074 (el técnico elige el tipo al dar la cita y no lo lee después) y ADR-075 (la modalidad
sale de T-028 hasta que exista cita↔episodio) son ley. Esta sección dice qué cambia en cada
apartado. Lo que no se nombra aquí sigue en vigor tal como está escrito arriba.

### E0 · Hechos nuevos verificados (02-10-2026)

Se comprobaron ejecutando sobre la base local, dentro de `begin … rollback`, como el técnico
sembrado (`b0080001-…-000000000004`), o leyendo el código cuando se dice así.

- **H16, re-verificado ejecutándolo.** Como técnico, `insert into public.citas (…, tipo_terapia_id,
  …, nota_operativa)` → `INSERT 0 1`. El banco lo afirma como bueno en
  `scripts/rls/17-vinculo-agenda.sql:114-127` (sección C, ADR-055): T-028a lo reescribe para que
  pase por la función de alta.
- **H23 · El técnico escribe a ciegas en `citas` con un `UPDATE` sin `WHERE`.** Como técnico:
  - `update public.citas set nota_operativa = '…'` → `UPDATE 2`;
  - `update public.citas set tipo_terapia_id = null` → `UPDATE 3` (todas las de su centro).

  La causa es la rama del técnico en `citas_modificacion`
  (`supabase/migrations/20260906120000_agenda_esquema.sql:715-737`) más `grant update`
  (`:856`). Postgres solo aplica la política de SELECT a un `UPDATE` cuando este lee columnas
  (en un `WHERE` o un `RETURNING`). Por eso el `UPDATE … WHERE id = …` da 0 filas y el `UPDATE`
  sin `WHERE` escribe. El banco solo prueba el primero (`scripts/rls/15-agenda.sql:408-418`,
  sección J). Esto contradice ADR-074, «Queda bloqueado: que el técnico escriba en `citas` sin
  pasar por las funciones de alta». Se cierra en T-028a.
- **H24 · El técnico lee el tipo de las series de sus centros.** `series_cita_lectura`
  (`…agenda_esquema.sql:741`) le da `select` en sus centros. El `grant select` (`:855`) sigue
  vigente: T-011b solo revocó `insert, update`
  (`…20260925120000_editar_serie_desde_la_cita.sql:1144`). Ejecutado: como técnico,
  `select s.tipo_terapia_id, t.nombre from series_cita s join tipos_terapia t …` → una fila,
  «Sesión de pareja». Con `citas_agenda.serie_id` eso le da el tipo de cada cita de una serie.
  Contradice ADR-074.2 («no ve el tipo de ninguna cita») y ADR-074.4 («la base lo
  garantiza»). Ningún código de `app/` ni de `lib/` lee `series_cita` (grep). Se cierra en
  T-028a.
- **H25 · El técnico lee el tipo en su propia auditoría** (por lectura del código; no se ejecutó
  porque otro agente estaba reseteando la base local). La cadena:
  - `auditar_citas` es `fn_auditar('id', 'nota_operativa')` (`…agenda_esquema.sql`, §13). Copia
    `tipo_terapia_id` en `estado_anterior` y `estado_posterior`.
  - `fn_auditar` escribe `actor_id = auth.uid()` también dentro de las funciones
    `security definer` (`…20260829150000_auditoria_y_solo_adicion.sql`).
  - `auditoria_lectura_propia` (`…20260829180000_revision_corte_por_baja.sql:31`) y
    `grant select` (`…20260815192424…:231`) le dejan leer sus propias filas.

  Así, al reprogramar con `agenda_actualizar_cita` una cita que dio otro, el técnico puede leer su
  tipo. Además, la matriz dice «Auditoría · técnico: Sin acceso» (`docs/architecture.md:175`).
  **No lo cierra T-028a por defecto.** Es pregunta al propietario (Q1 del contrato de T-028a).
- **H26 · Catálogo y siembra.**
  - `supabase/seed-completo.sql` (lo manda `scripts/seed.mjs:27`) no siembra `tipos_terapia`,
    `disponibilidad` ni `citas`. Inserta en 16 tablas y ninguna es de agenda.
  - El fichero de la siembra es ese, no `scripts/seed.mjs` como decía §1.A.4.
  - `agenda_crear_serie` no comprueba `tipos_terapia.activo` y escribe el `p_tipo_terapia_id`
    que le llegue, también si llama el técnico
    (`…20260910120000_series_materializacion_desviaciones.sql:564-800`).
  - No existe ninguna pantalla del catálogo: grep `tipos_terapia` en `app/` y `lib/` sin
    resultados fuera de `tipos-bd.ts`, y `/ajustes` está «Pendiente» (`docs/interfaz.md:69`).
  - Columnas del catálogo: `nombre`, `duracion_minutos` (def. 50), `tarifa_base`, `regimen`,
    `color`, `activo` (`…agenda_esquema.sql:96-109`).
- **ADR-075 sobre el código:** H6 sigue siendo cierto. `citas` no tiene ni `episodio_id` ni
  modalidad.

### E1 · Tipo de terapia (ADR-074)

Sustituye a P2, al tipo de §1.D y a la carga de tipos de §1.E. En §1.F sustituye el campo de tipo
y el «se fuerzan a `null`». En §1.F y §1.C, la duración la da el tipo.

1. **Todos los roles tienen el selector de tipo en el formulario de alta**, también el técnico.
   Las opciones salen de `tipos_terapia` con `activo = true`, ordenadas por `nombre`, y **solo
   tres columnas: `id, nombre, duracion_minutos`**. `tarifa_base`, `regimen` y `color` no viajan.
   Se cargan en `contenido-alta.tsx` para cualquier rol: el catálogo no es la cita (ADR-074.4).
2. **Valor inicial vacío para todos** («Elige el tipo»). **Nunca** sale de las citas o series del
   paciente: «como la última vez» sería leer el tipo de una cita existente, justo lo que
   ADR-074.2 prohíbe al técnico, y no se abre una rama por rol para dárselo a los demás (D13).
3. **La duración la fija el tipo y es de solo lectura.**
   - Antes de elegir tipo, el calendario y las sugerencias se calculan con
     `DURACION_INICIAL = 50`, el valor por defecto de `tipos_terapia.duracion_minutos` (H7).
     El campo dice «Duración: elige un tipo».
   - Al cambiar de tipo se llama a `recalcularAlta` con el tipo nuevo.
   - Si el hueco elegido ya no es `libre` con la duración nueva, se desmarca y una región
     `role="status"` dice «Con esta duración el hueco elegido ya no cabe».
4. **Esquema** (`lib/citas/esquemas.ts`, sustituye las dos claves de §1.D):
   - `tipoTerapiaId: z.uuid('Elige un tipo de terapia.')`, **no nulable**. El contrato lo pone entre
     los «campos sin los cuales la cita no se guarda».
   - `duracionMinutos` **sale del esquema**.
   - El resto de §1.D sigue igual.
5. **Las acciones derivan la duración en el servidor.** `recalcularAlta`, `previsualizarAltaSerie`
   y `guardarAlta` leen `select duracion_minutos from tipos_terapia where id = $1 and activo`.
   - Si `recalcularAlta` recibe un tipo nulo, usa 50.
   - En `previsualizarAltaSerie` y `guardarAlta`, un tipo que no se encuentra devuelve
     `{ok:false, motivo:'tipo_no_valido'}`.
   - Esa duración, y nunca una del cliente, es la que va a todas las RPC de §1.C.
   - Por rol, el técnico solo tiene **`notaOperativa` forzada a `null`**: la razón de
     `agenda_actualizar_cita` (`…agenda_esquema.sql:611-614`) sigue en vigor y ADR-074 no toca la
     nota. Con el profesional, `profesionalId = usuario.id`. `tipoTerapiaId` pasa tal cual en
     todos los roles.
6. **Las pantallas de lectura no cambian.** La previsualización (`agenda_previsualizar_alta` no
   devuelve tipo), las tarjetas, el calendario de selección (solo `libre`/`ocupado`) y las
   respuestas `hueco_ocupado`, `previsualizacion_caducada` y éxito **no llevan tipo, ni su id
   ni su nombre**. El formulario conserva lo que eligió el usuario en su propio estado. Ninguna
   acción lo devuelve.
7. **Catálogo vacío** (H26: hoy la siembra no tiene tipos).
   - El selector se sustituye por el texto «No hay tipos de terapia activos. Los da de alta el
     administrador.» y «Guardar» queda deshabilitado.
   - El calendario y las sugerencias se pintan igual, con 50.
8. **D8 sigue en vigor**: ningún motivo de sugerencia nombra el tipo, para ningún rol.
   `sugerirHuecos` no recibe tipos.

### E2 · Lo que T-028 consume ahora de T-028a (añade a §1.A)

El contrato completo está en `tickets/T-028a-base-del-alta-de-cita.md`. Lo que añade a §1.A:

- **Tipo obligatorio en las altas que usa T-028**: `agenda_crear_cita` y la versión de
  `agenda_crear_serie` con `p_estricta_primera`. Si el tipo es nulo, no existe o está inactivo,
  devuelven `22023`.
- **Duración del tipo**: una cita creada con un tipo cumple `fin − inicio =
  tipos_terapia.duracion_minutos`. La base la impone, ignorando o rechazando lo que mande el
  cliente; lo decide el diseño de T-028a. T-028 manda ya la del catálogo (E1.5).
- **El técnico no escribe en `citas` sin pasar por una función**: ni `insert` directo (H16) ni
  `update` sin `WHERE` (H23). `agenda_actualizar_cita` sigue funcionando.
- **El técnico no lee el tipo por `series_cita`** (H24). `citas_agenda` sigue sin la columna.
- **Siembra en `supabase/seed-completo.sql`** (H26), con lo de §1.A.4 y además tipos con
  nombre de servicio (ADR-074.3): al menos tres activos con dos duraciones distintas, y uno
  inactivo.

### E3 · Modalidad (ADR-075). Sustituye a P1 y al campo «modalidad» del contrato

- T-028 **no pinta modalidad**: ni control, ni texto, ni clave i18n con «modalidad» en
  `agenda.alta`. No pinta la relacional ni presencial/online. No se deja un hueco preparado
  («nada de controles sin un dato detrás»).
- Cuando exista `citas.episodio_id` y la columna presencial/online (ticket propio de `supabase/`
  detrás de T-028a, ADR-075.3), ese ticket o uno de interfaz que lo siga la añade al formulario.
  **No se diseña aquí.**

### E4 · §3, criterios que cambian

| Criterio (enmendado, ver E10) | Cómo se demuestra |
|---|---|
| Técnico: **elige** el tipo al dar la cita (ADR-074.1); ningún motivo lo nombra | `formulario-alta.test.tsx` con rol técnico: `[name=tipoTerapiaId]` existe y ofrece **exactamente** los tipos activos del fixture (el fixture trae también uno inactivo, que no aparece). `acciones.test.ts`: con rol técnico, `guardarAlta` llama a la RPC con `p_tipo_terapia_id` = el elegido, `p_duracion_minutos` = la del catálogo y `p_nota_operativa = null`. `tarjetas-sugerencia.test.tsx`: los motivos no contienen el nombre de ningún tipo del fixture. |
| Técnico: **no lo ve después** (ADR-074.2) | `acciones.test.ts`: ningún resultado de `recalcularAlta`, `previsualizarAltaSerie` ni `guardarAlta` contiene el uuid ni el nombre del tipo (`JSON.stringify(resultado)`). Revisión: `grep -rn "tipo_terapia" "app/(app)/agenda/nueva" lib/citas/alta.ts` solo aparece en **argumentos de RPC** y en la consulta del catálogo, nunca en un `select` de `citas`, `citas_agenda`, `series_cita` ni `agenda_citas_rango`. Manual como técnico: dar una cita «Sesión de pareja» y comprobar que ni la semana, ni la ficha de cita, ni «Por confirmar» muestran «pareja». Base: banco de T-028a (H16, H23, H24). |
| Sin modalidad (ADR-075) | `grep -rni "modalidad" "app/(app)/agenda/nueva" lib/citas/alta.ts lib/citas/esquemas.ts` vacío, y ninguna clave `agenda.alta.*` con «modalidad» en `lib/i18n/es.ts`. |
| Tipo obligatorio y catálogo vacío | `esquemas.test.ts`: `tipoTerapiaId: null` falla con «Elige un tipo de terapia.». `formulario-alta.test.tsx` con catálogo vacío: el texto de E1.7 aparece y «Guardar» está deshabilitado. |
| Cambiar de tipo no deja un hueco imposible | `formulario-alta.test.tsx`: con un hueco elegido, un `recalcularAlta` simulado que ya no lo trae como `libre` lo desmarca y pinta el aviso de E1.3. |

Las demás filas de §3 siguen igual.

### E5 · §4, riesgos (sustituye el 2 y añade)

2. **(Alta)** Se cuela en el alta la **lectura** del tipo de una cita existente. Por ejemplo, una
   preselección «como la última», o un `select` de `series_cita`/`citas` con tipo «para
   sugerir». → E1.2, el grep y la prueba de E4. La base lo cierra en T-028a para `citas` y
   `series_cita`. La auditoría propia (H25) sigue abierta hasta que decida el propietario.
8. **(Media)** **Catálogo vacío en producción.** Nadie puede dar citas hasta que existan tipos, y
   no hay pantalla para crearlos (H26). → Estado vacío de E1.7 y siembra en T-028a. Antes de
   producción hace falta un ticket de Ajustes › Tipos de terapia, con el texto de ayuda de
   ADR-074.3. Ver E9.
9. **(Media)** Cambiar de tipo después de elegir hueco deja un hueco que no cabe. → E1.3.
10. **(Baja)** Llega a la acción un tipo que se desactivó entre cargar y guardar. →
    `tipo_no_valido` (E1.5) más el `22023` de la base (E2).

### E6 · §5, qué revisar (sustituye la primera viñeta y la primera prueba; añade)

- **Entradas que elige el llamante** en `guardarAlta`: `pacienteId`, `profesionalId`,
  `centroId`, `tipoTerapiaId`, `notaOperativa`, fechas.
  - **`tipoTerapiaId` lo elige cualquier rol, también el técnico** (ADR-074.1). Su efecto es el
    tipo **y la duración** de la cita. La duración sale siempre del catálogo en el servidor: no
    hay `duracionMinutos` en el esquema, y si el cliente la manda, `z.object` la descarta.
  - Con rol técnico, una `notaOperativa` rellena **se anula** en la acción, y la base de T-028a
    devuelve `42501`: dos capas.
  - Con rol profesional, `profesionalId` sale de la sesión.
  - Un centro ajeno al técnico da `42501` en la base, y la acción no lo «arregla».
- **Pruebas que deben fallar por el motivo exacto**:
  - `formulario-alta.test.tsx` «el técnico elige tipo» debe fallar **si alguien vuelve a esconder
    el selector por rol**. No vale que falle porque el fixture no trae tipos.
  - «el selector empieza vacío»: el fixture trae citas pasadas del paciente y aun así no hay valor
    inicial.
  - `acciones.test.ts` «el técnico no escribe nota» debe fallar si se quita el forzado a `null`,
    no porque el fixture no traiga nota.
- **Lectura del tipo por otra puerta**: `contenido-alta.tsx` y las acciones no leen
  `tipo_terapia_id` de ninguna cita ni serie, para ningún rol, y el catálogo se pide con tres
  columnas.
- **Fuera del alcance de la revisión**: la auditoría propia del técnico (H25) no es fallo de T-028.
  Está anotada como Q1 de T-028a.
- **Modalidad**: ni control ni texto (E3).

### E7 · §6, territorio (añade)

```yaml
  - docs/interfaz.md   # solo el choque 4 (el técnico elige el tipo en el alta, ADR-074) y §14 (modalidad: ADR-075)
```

El resto del territorio sigue igual. T-028 pasa a `depende_de: [T-028a]` para los cortes B y C.

### E8 · §7, delegable

- **Verificado:** P1–P5 no reciben ni pintan tipo de terapia ni modalidad. Ninguna cambia.
- **Se añade al bloque común** de cada encargo: «Ninguna pieza recibe una prop ni pinta un texto
  de tipo de terapia ni de modalidad. Si el encargo parece pedirlo, para y devuelve la pregunta».
- **El selector de tipo es de la fábrica**: es un control de formulario y cambia la duración y
  el calendario. Sus claves las pega la fábrica en `agenda.alta`:
  - `campos.tipo: 'Tipo de terapia'`
  - `campos.tipoElige: 'Elige el tipo'`
  - `campos.tipoVacio: 'No hay tipos de terapia activos. Los da de alta el administrador.'`
  - `campos.duracion: 'Duración: {minutos} min'`
  - `campos.duracionPendiente: 'Duración: elige un tipo'`
  - `huecoNoCabe: 'Con esta duración el hueco elegido ya no cabe.'`
  - `error.tipoNoValido: 'Ese tipo de terapia ya no está disponible. Elige otro.'`

### E9 · Lo que no entra (sustituye dos entradas y añade)

- **Modalidad**, la relacional y presencial/online: ADR-075, en un ticket propio de `supabase/`
  detrás de T-028a, y luego su pintura.
- **Tipo por defecto por profesional**: queda sin objeto por ADR-074, porque el tipo lo elige
  quien da la cita.
- **Revocar el `insert` directo del técnico** (H16): **entra en T-028a**, junto con H23 y H24.
- **La auditoría propia del técnico** (H25): pregunta al propietario en T-028a (Q1). Si dice que no
  entra, se anota en `docs/state.md` como hallazgo con ticket por escribir.
- **Pantalla del catálogo de tipos** (Ajustes) y su texto de ayuda de ADR-074.3: otro ticket.
  Hace falta antes de producción (riesgo 8).

### E10 · Texto propuesto para enmendar el contrato `tickets/T-028-alta-de-cita.md`

Lo pega el usuario o el orquestador, tras aprobar. El arquitecto no lo toca sin ese visto bueno.
Va detrás de «# Contexto», con la forma de las enmiendas de T-012c:

> **Enmienda por ADR-074 y ADR-075 (propietario, 02-10-2026).** Manda sobre lo que sigue donde
> choque.
> - `depende_de` añade **T-028a** (base del alta de cita) para todo lo que no es el corte A.
> - **Campos**: «modalidad» sale (ADR-075). El tipo de terapia es obligatorio y fija la
>   duración.
> - **El técnico administrativo elige el tipo de terapia en este formulario** (ADR-074.1). Las
>   tareas «el campo se omite» y «la cita se crea con el tipo por defecto del profesional»
>   quedan sin objeto. Sigue en vigor que **ninguna pantalla de lectura** (agenda, ficha de cita,
>   previsualización, motivos de sugerencia) le enseñe el tipo de ninguna cita, tampoco de las
>   que dio él.
> - El criterio «como `tecnico_administrativo`, el campo de tipo de terapia no está en el DOM, y
>   ningún motivo de sugerencia lo nombra» pasa a ser: **«como `tecnico_administrativo`, el
>   campo de tipo de terapia está en el formulario y lista solo el catálogo activo; tras guardar,
>   ni la agenda, ni la ficha de cita, ni la previsualización enseñan el tipo; ningún motivo de
>   sugerencia lo nombra»**.
> - **Criterio nuevo:** en `/agenda/nueva` no hay ningún control ni texto de modalidad.

### E11 · Decisiones nuevas (se añaden a §2)

- **D12** Tipo **obligatorio** para todos los roles, en el esquema y en la base (E2).
  *Descartado:* nulable, que es justo la cita «con 50 minutos y sin tipo» que ADR-074 quiere
  evitar; y obligatorio solo para el técnico, que añade una rama de rol sin motivo.
- **D13** Sin preselección del tipo, para nadie. *Descartado:* «el de la última cita», que es
  leer el tipo de una cita existente (ADR-074.2) o abrir una rama por rol para dárselo solo a
  algunos.
- **D14** La duración la deriva el servidor desde el catálogo. *Descartado:* confiar en la
  `duracionMinutos` del formulario, que dejaría crear una «Evaluación» de 15 minutos.
- **D15** Antes de elegir tipo, el calendario se pinta con 50. *Descartado:* calendario vacío
  hasta elegir tipo, que bloquea el primer pintado en servidor y el «primer hueco libre».
- **D16** H24 (`series_cita`) entra en T-028a sin preguntar, porque es la misma garantía de
  ADR-074.4 en la misma zona. H25 (auditoría) se pregunta. *Motivo:* H25 toca la política de una
  tabla de todo el sistema y choca con la matriz («Sin acceso»), y eso no se decide desde un
  ticket de agenda.

## Decisiones del propietario sobre la enmienda (02-10-2026)

- **E10 aprobado tal cual** y pegado en `tickets/T-028-alta-de-cita.md`. D12-D16 aceptadas.
- **Q1 (H25)**: fuera de T-028a; ticket propio de auditoría.
