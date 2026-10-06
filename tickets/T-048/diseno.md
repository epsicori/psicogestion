# T-048 · Diseño — documentación pendiente agrupada por paciente

Contrato: `tickets/T-048-documentacion-pendiente-agrupada.md` (D1–D13 cerradas el 06-10-2026).
Riesgo medio, sin migración. Este diseño no reabre ninguna decisión; donde el contrato se
contradice a sí mismo lo digo en §2 (P1, cerrada el 06-10-2026: orden del enum).

## 0 · Hechos verificados contra el código

| Hecho | Dónde |
|---|---|
| `leerAlertasNotaPendiente` lee `alertas_documentacion_nivel` **sin tope ni recuento**, ordena solo por `fecha_referencia, creada_en` y pide los nombres de **todos** los pacientes leídos. Solo la llama `documentacion.tsx:49` | `lib/citas/agenda.ts:218-268` |
| `AlertaPendiente` la importa **`bloques.ts` (territorio de T-047)** como tipo: `AlertaPendiente['tipo']`. Si el tipo desaparece o cambia `tipo`, `bloques.ts` no compila | `app/(app)/agenda/bloques.ts:6`, `:83` |
| En los tipos generados, todas las columnas de la vista son nulables (`id`, `paciente_id`, `tipo`, `nivel`, `origen_tabla`, `origen_id`, `creada_en`...) | `lib/supabase/tipos-bd.ts:2633-2647` |
| El orden del enum es `nota_sin_firmar, borrador_abandonado, consentimiento_pendiente, informe_pendiente, evaluacion_sin_corregir`, y está exportado en tiempo de ejecución como `Constants.public.Enums.tipo_alerta_documentacion` | `lib/supabase/tipos-bd.ts:3672-3678` |
| `criterioDocumentacion(rol)` → `{soloPropias, tipos?}`; `diasPendiente(fecha, hoy)` → `number \| null`; `puedeResolverAlerta(rol, tipo)` → `false` para `nota_sin_firmar` y para todo rol que no sea administrador ni profesional | `bloques.ts:108-115`, `:154-156`, `:163-166` |
| `cargarContexto(centro)` va con `cache()`, llama a `connection()`, `cookies()` y `exigirSesion()`, y devuelve `{sesion, rol, hoy, ...}`. `connection()` solo lanza en `use cache`, `unstable_cache`, `after` y `generateStaticParams`: en una Server Action (unidad `request`) vale | `app/(app)/agenda/datos.ts:86-100`; `node_modules/next/dist/server/request/connection.js:44-109` |
| Las cuatro pruebas por rol de la bandeja leen `mock.calls[0][1]` y `toHaveBeenCalledWith(expect.anything(), {soloPropias, tipos})` sobre el lector mockeado | `app/(app)/agenda/documentacion.test.tsx:26-60` |
| `ProveedorResolucion` enfoca un `div role="group" tabIndex={-1}`, cuenta lo resuelto y su `role="status"` está siempre montado; `ResolverAlerta` usa `useActionState`, `unstable_rethrow`, `aria-disabled` y un `alertaId` oculto | `app/(app)/agenda/resolver-alerta.tsx:43-112` |
| `resolverAlerta` llama a `revalidatePath('/agenda')` y a `revalidatePath('/', 'layout')` | `app/(app)/agenda/acciones-alertas.ts` |
| `MarcoBloque({id, titulo, children})` pinta `h2 id={id}` sin `tabIndex` | `app/(app)/agenda/marco.tsx` |
| El fallback del panel en `/agenda` es `MarcoBloque id="agenda-documentacion"` con `EsqueletoLista`, y **`EsqueletoLista` lleva `animate-pulse`** (fichero de T-047) | `app/(app)/agenda/page.tsx:93-101`, `esqueletos.tsx` |
| `Button` reparte el resto de props al `<button>` (`aria-*` pasa) y mide `min-h-11` en los dos tamaños | `components/ui/button.tsx:19-20`, `:27-50` |
| `Pildora` admite solo `success`, `info` y `warning` | `components/ui/piezas.tsx:83-94` |
| Al cambiar solo los parámetros de búsqueda, el enrutador conserva el estado del segmento de página: la clave de estado se calcula **sin** los parámetros (`createRouterCacheKey(activeSegment, true) // no search params`). Una redirección de `?pagina=3` a `?pagina=2` no desmonta `ProveedorResolucion` | `node_modules/next/dist/client/components/layout-router.js:549` |
| `redirect` lanza (`never`) y va fuera de `try`; en un Server Component es `replace`, y en un contexto con streaming se emite como meta tag que resuelve el cliente | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:12,29,51` |
| PostgREST recorta en silencio a 1000 filas | `supabase/config.toml:18` |
| La página de notas exige exactamente uno de `?cita` o `?nota` y valida que la cita sea del paciente | `app/(app)/pacientes/[id]/historia/notas/page.tsx:31-79` |
| Hallazgo que se cierra: la línea 66 de `docs/state.md` empieza con «**T-014**: bandeja sin límite, ?centro, ...» | `docs/state.md:66` |
| La prueba `sin-literales` revisa el texto visible y los atributos `aria-label`, `title`, `placeholder`, `alt` y `etiqueta` en los `.tsx` de `app/` | `lib/i18n/sin-literales.test.ts` |

## 1 · Piezas y contratos

### 1.1 Lectura acotada — `lib/citas/agenda.ts` (modificar)

`leerAlertasNotaPendiente` **desaparece**. `AlertaPendiente` **se conserva con ese nombre** (lo
importa `bloques.ts`) y se redefine como la fila de la lectura nueva. El campo `tipo` no cambia
de tipo:

```ts
export type AlertaPendiente = {
  id: string;
  pacienteId: string;
  tipo: Database['public']['Enums']['tipo_alerta_documentacion'];
  fechaReferencia: string | null;
  creadaEn: string | null;
  nivel: 1 | 2 | 3 | null;        // aNivel(), sin recalcular
  origenTabla: string | null;
  origenId: string | null;
};

export const TOPE_PENDIENTES = 1000;

export async function leerPendientes(
  sesion: Sesion,
  opciones: {
    soloPropias: boolean;
    tipos?: readonly AlertaPendiente['tipo'][];
    nivel?: 1 | 2 | 3;
    pacienteId?: string;
  },
): Promise<ResultadoCitas<{ alertas: AlertaPendiente[]; total: number; recortada: boolean }>>;

export async function leerNombresPacientes(
  sesion: Sesion,
  ids: readonly string[],
): Promise<ResultadoCitas<{ nombres: ReadonlyMap<string, { nombre: string | null; apellidos: string | null }> }>>;
```

**`leerPendientes`**, en este orden exacto:
1. Si `tipos` viene y está vacío, devuelve `{ok: true, alertas: [], total: 0, recortada: false}`
   **sin tocar `sesion.supabase`**.
2. `from('alertas_documentacion_nivel').select('id, paciente_id, tipo, fecha_referencia, creada_en, nivel, origen_tabla, origen_id', { count: 'exact' })`.
   La cadena de columnas va literal, sin espacios de más.
3. `.eq('estado', 'abierta')`.
4. `soloPropias` → `.eq('profesional_id', sesion.usuario.id)`; `tipos` → `.in('tipo', [...tipos])`;
   `nivel` → `.eq('nivel', nivel)`; `pacienteId` → `.eq('paciente_id', pacienteId)`.
5. Orden:
   - `.order('nivel', { ascending: false, nullsFirst: false })`
   - `.order('fecha_referencia', { ascending: true, nullsFirst: false })`
   - `.order('creada_en', { ascending: true, nullsFirst: false })`
   - `.order('id', { ascending: true })`
6. `.range(0, TOPE_PENDIENTES - 1)`. Siempre desde 0 (T-040 R2A-H1: el 416).
7. Un error hace `console.error('leerPendientes: fallo al leer alertas_documentacion_nivel', error)`
   y devuelve `fallo(error)`.
8. Las filas con `id`, `paciente_id` o `tipo` nulos se descartan, con el mismo `flatMap` de hoy.
9. `total = count ?? alertas.length`; `recortada = count === null ? alertas.length >= TOPE_PENDIENTES : count > alertas.length`.

**`leerNombresPacientes`**:
- Con `ids` vacío devuelve el mapa vacío sin consultar.
- Con ids, deduplica y parte en tandas de **100 como mucho**. Por tanda:
  `from('pacientes').select('id, nombre, apellidos').in('id', tanda)`.
- Las tandas van con `Promise.all`. Si falla cualquiera, `console.error('leerNombresPacientes: fallo al leer pacientes', error)` y `fallo(error)`.
- Un id que la RLS no deja ver no aparece en el mapa, y quien llama pinta la etiqueta genérica.

Ninguna de las dos funciones recibe un término de búsqueda ni lo ve.

### 1.2 Lógica pura — `app/(app)/agenda/pendientes.ts` (crear)

Sin E/S, sin `Date` y sin `server-only` (es puro). Importa `t` y `tCon`, `diasPendiente` de
`./bloques`, `Constants` de `@/lib/supabase/tipos-bd` y tipos con `import type`. Solo lo
importan módulos de servidor (`documentacion.tsx`, `documentacion/contenido.tsx` y
`documentacion/acciones.ts`). El cliente recibe ya presentado lo que pinta.

```ts
type TipoAlerta = AlertaPendiente['tipo'];
type Nivel = 1 | 2 | 3;

export const TAMANO_PANEL = 6;            // D13
export const TAMANO_PAGINA = 20;
export const MAXIMO_DESPLEGABLE = 10;
export const MAXIMO_RESULTADOS = 20;
/** Orden fijo de los tipos en el resumen (D7): el del enum. P1 cerrada en §2. */
export const ORDEN_TIPOS: readonly TipoAlerta[] = Constants.public.Enums.tipo_alerta_documentacion;

export type Filtros = { tipo: TipoAlerta | null; nivel: Nivel | null; paciente: string | null };

export type GrupoOrdenado = {
  pacienteId: string;
  alertas: AlertaPendiente[];        // en el orden de §Definiciones «dentro de un paciente»
  recuento: number;
  escalados: number;                 // nivel 2 o 3 (D4)
  nivelMaximo: Nivel | null;
  fechaMasAntigua: string | null;    // la menor fecha_referencia no nula
};

export type PendientePresentado = {
  id: string;
  etiquetaTipo: string;              // t(`agenda.documentacion.tipos.${tipo}`)
  textoDesde: string;
  pildora: string | null;            // «Muy atrasada» / «Atrasada» / null
  destino: string;                   // D8
  nombreEnlace: string;              // «Nota sin firmar de Ana López: abrir la nota»
  resoluble: boolean;                // puedeResolverAlerta(rol, tipo)
};

export type GrupoPresentado = {
  pacienteId: string;
  nombre: string;                    // nombre y apellidos, o t('agenda.cita.paciente')
  hrefPaciente: string;              // /pacientes/<uuid>
  recuento: number;
  insignia: string;                  // «1 pendiente» / «N pendientes»
  urgencia: 'muy-atrasada' | 'atrasada' | null;   // del nivel máximo
  textoUrgencia: string | null;      // «Muy atrasada» / «Atrasada»
  textoAccesible: string;            // criterio 6
  resumen: string | null;            // D7; null con recuento < 2
  anuncio: string;                   // textoAccesible + (resumen ? ' — ' + resumen ...) para el foco (a)
  pendientes: PendientePresentado[]; // ≤ 10 en 'desplegable'; todos en 'completo'
  verTodos: { href: string; texto: string } | null; // solo en 'desplegable' con recuento > 10
};
```

Funciones exportadas, cada una con su prueba:

| Firma | Contrato |
|---|---|
| `tiposConsultados(criterio: {tipos?: readonly TipoAlerta[]}, tipo: TipoAlerta \| null): readonly TipoAlerta[] \| undefined` | Sin filtro, devuelve `criterio.tipos` (puede ser `undefined`: el profesional y el administrador sin filtro de tipo). Con filtro, devuelve `[tipo]` si el criterio no recorta tipos o si `tipo` está en `criterio.tipos`, y **`[]`** si no lo está. El filtro solo estrecha. |
| `tiposVisibles(criterio): readonly TipoAlerta[]` | `criterio.tipos ?? ORDEN_TIPOS`, para decidir qué filtros se pintan. |
| `agruparYOrdenar(alertas: readonly AlertaPendiente[]): GrupoOrdenado[]` | Agrupa por `pacienteId`, ordena cada grupo (nivel desc con nulos al final, `fechaReferencia` asc con nulos al final, `creadaEn` asc con nulos al final, `id` asc) y después los grupos: (1) `nivelMaximo` desc con `null` como 0, (2) `fechaMasAntigua` asc con nulos al final, (3) `pacienteId` asc. Las cadenas se comparan con `<` y `>`, no con `localeCompare`. No confía en el orden de la lectura. |
| `paginar<T>(items: readonly T[], pagina: number, tamano: number): {items: T[]; pagina: number; ultima: number}` | `ultima = max(1, ceil(n / tamano))`. **No corrige** una `pagina > ultima` (de eso se encarga la redirección del que llama) y devuelve `items: []` en ese caso. |
| `textoDesde(dias: number \| null): string` | Se mueve tal cual desde `documentacion.tsx:14-20`. |
| `destinoPendiente(alerta: AlertaPendiente, rol: RolUsuario \| null): string` | D8. `/pacientes/<p>/historia/notas?cita=<origenId>` **solo si** `tipo === 'nota_sin_firmar' && origenTabla === 'citas' && origenId !== null && (rol === 'administrador' \|\| rol === 'profesional_sanitario')`. En cualquier otro caso, `/pacientes/<p>`. Los ids se interpolan sin más (son uuid de la base) y nunca hay `#`. |
| `hrefDocumentacion(p: Partial<Filtros> & {pagina?: number}): string` | `/agenda/documentacion` más `URLSearchParams` en el orden fijo `tipo`, `nivel`, `paciente`, `pagina`. Omite los nulos, los `undefined` y `pagina <= 1`. Sin parámetros, sin `?`. |
| `textoAccesiblePaciente(nombre: string, recuento: number, escalados: number): string` | Criterio 6: «Ana López, 6 pendientes, 2 escalados»; «…, 1 escalado»; con 0, «Ana López, 3 pendientes». |
| `resumenPorTipo(grupo: GrupoOrdenado, hoy: string): string \| null` | `null` si `recuento < 2`. Cuenta por tipo en el orden de `ORDEN_TIPOS`, con el plural corto de cada tipo, y une con `' · '`. Añade el sufijo del más antiguo con `diasPendiente(fechaMasAntigua, hoy)`: `<= 0` da «— el más antiguo, de hoy», `1` da «— el más antiguo, hace 1 día» y `n` da «— el más antiguo, hace n días». Sin `fechaMasAntigua`, sin sufijo. |
| `presentarGrupo(grupo, opciones: {rol: RolUsuario \| null; hoy: string; nombre: string \| null; modo: 'desplegable' \| 'completo'; filtros: Filtros}): GrupoPresentado` | Compone todo lo anterior. `verTodos.href = hrefDocumentacion({tipo: filtros.tipo, nivel: filtros.nivel, paciente: grupo.pacienteId})`; sin filtros es exactamente `/agenda/documentacion?paciente=<uuid>`. `verTodos.texto` = «Ver todos (N)». |
| `coincideBusqueda(termino: string, nombre: string \| null, apellidos: string \| null): boolean` | `normalizar(s) = s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')`. Parte el término normalizado por `/\s+/` y descarta las vacías. Exige que **cada** palabra esté (`includes`) en el nombre normalizado o en los apellidos normalizados. Sin nombre ni apellidos, `false`. |

### 1.3 Identificadores compartidos — `app/(app)/agenda/pendientes-ids.ts` (crear)

Puro y sin dependencias, para que el cliente no arrastre `bloques.ts`:

```ts
export type Prefijo = 'panel' | 'pagina' | 'busqueda';
export const idEnlacePaciente = (p: Prefijo, pacienteId: string) => `${p}-paciente-${pacienteId}`;
export const idListaPendientes = (p: Prefijo, pacienteId: string) => `${p}-pendientes-${pacienteId}`;
export const idResumen = (p: Prefijo, pacienteId: string) => `${p}-resumen-${pacienteId}`;
```

### 1.4 Fila de paciente — `app/(app)/agenda/pendientes-fila.tsx` (crear, `'use client'`)

```ts
export function FilaPaciente(props: { grupo: GrupoPresentado; prefijo: Prefijo; modo: 'desplegable' | 'completo' }): JSX.Element
```

Quien la pinta la mete en un `<li key={grupo.pacienteId}>`. La clave es lo que hace que el
estado abierto sobreviva a la revalidación.

- **Cabecera**, siempre:
  - `<Link id={idEnlacePaciente(prefijo, id)} href={grupo.hrefPaciente} className="… min-h-11 inline-flex items-center …">{grupo.nombre}</Link>`.
  - La **insignia**: `<span data-urgencia={grupo.urgencia ?? undefined}>`. Con `urgencia === 'muy-atrasada'` lleva un icono SVG `aria-hidden` (aviso triangular) y `border-2 border-foreground font-semibold`; si no, es texto discreto sin borde ni icono. Ningún `animate-*`, ningún `latido` y ninguna `transition` añadida.
  - Si `grupo.textoUrgencia` existe, `<Pildora tono="warning">{grupo.textoUrgencia}</Pildora>` **fuera** de cualquier botón.
- **`recuento === 1`, o `modo === 'completo'`**: la insignia es un `<span>` (en `completo` no hay botón) y debajo va una `<ul>` con un `<ItemPendiente>` por pendiente.
- **`recuento >= 2` y `modo === 'desplegable'`**:
  - `const [abierta, setAbierta] = useState(false)`. Nada más guarda estado: ni almacenamiento, ni cookies, ni la URL.
  - `<Button variante="fantasma" tamano="sm" aria-expanded={abierta} aria-controls={idListaPendientes(...)} aria-describedby={idResumen(...)} aria-label={grupo.textoAccesible} onClick={() => setAbierta(v => !v)}>`. Dentro, la insignia visible y un chevron `aria-hidden`.
  - `<p id={idResumen(...)} className="text-muted-foreground text-xs">{grupo.resumen}</p>`: visible, fuera del botón y solo con el texto del resumen.
  - `<ul id={idListaPendientes(...)} hidden={!abierta}>` con un `<ItemPendiente>` por pendiente y, si `grupo.verTodos`, un `<li><Link href={verTodos.href} className="min-h-11 …">{verTodos.texto}</Link></li>`. La lista **está siempre en el DOM** con `hidden`, para que `aria-controls` apunte a algo que existe.
- **`ItemPendiente`** (interno, no exportado):
  - `<Link href={p.destino} aria-label={p.nombreEnlace} className="min-h-11 …">{p.etiquetaTipo}</Link>`. El nombre accesible contiene el texto visible (WCAG 2.5.3).
  - `<span>{p.textoDesde}</span>` y la píldora si `p.pildora`.
  - `{p.resoluble && <ResolverAlerta alertaId={p.id} pacienteId={grupo.pacienteId} etiquetaTipo={p.etiquetaTipo} />}`.

### 1.5 Foco tras resolver — `app/(app)/agenda/resolver-alerta.tsx` (modificar)

```ts
type PacienteEnFoco = { id: string; alertas: readonly string[]; anuncio: string };
type Contexto = { alResolver: (r: { alertaId: string; pacienteId: string }) => void };

export function ProveedorResolucion(props: {
  prefijo: Prefijo;
  encabezadoId: string;              // 'agenda-documentacion' en el panel, ID_TITULO en la página
  pacientes: readonly PacienteEnFoco[]; // lo pintado ahora, en orden; alertas = ids de los pendientes pintados
  alAcertar?: () => void;            // el buscador relanza la búsqueda
  children: ReactNode;
}): JSX.Element;

export function ResolverAlerta(props: { alertaId: string; pacienteId: string; etiquetaTipo: string }): JSX.Element;
```

- `ResolverAlerta` no cambia nada más: sigue con `useActionState`, `try/catch` +
  `unstable_rethrow`, `aria-disabled` + `preventDefault`, un solo `<input type="hidden" name="alertaId">`
  y su `role="status"` de error. Al acertar llama a `bloque?.alResolver({alertaId, pacienteId})`.
- `ProveedorResolucion` guarda
  `pendiente: { alertaId; pacienteId; indice; eraUltimo } | null` (con `indice` y `eraUltimo`
  calculados sobre `pacientes` **en el momento de resolver**) y
  `anuncio: { texto: string; n: number }`. `alResolver` fija `pendiente` y llama a `alAcertar?.()`.
- Hay un **efecto** sobre `[pendiente, pacientes]`:
  1. Sin `pendiente`, no hace nada.
  2. Si alguna entrada de `pacientes` todavía contiene `pendiente.alertaId`, **espera**: la revalidación (o la nueva búsqueda) no ha llegado.
  3. Si el paciente sigue en `pacientes`, el destino es `idEnlacePaciente(prefijo, pacienteId)` y el anuncio, `t('agenda.documentacion.resuelta') + ' ' + paciente.anuncio`.
  4. Si no sigue pero quedan pacientes, el destino es `pacientes.at(-1)` cuando `eraUltimo`, y `pacientes[min(indice, length - 1)]` cuando no lo era. El anuncio es `t('agenda.documentacion.resuelta')`.
  5. Si `pacientes` está vacío, el destino es `encabezadoId`, con el mismo anuncio.
  6. `document.getElementById(destino)?.focus()`, después `setAnuncio({texto, n: n + 1})` y `setPendiente(null)`.
- Render: un `<div data-bloque-pendientes>` **sin `role` ni `tabIndex`**, con los `children` y el
  `<p role="status" aria-live="polite" aria-atomic="true" data-estado-bloque className="sr-only"><span key={anuncio.n}>{anuncio.texto || null}</span></p>`
  **siempre montado**.

La regla 4 cubre la redirección de `?pagina`. Si se resuelve el único paciente de la última
página, la página re-renderizada redirige a la anterior sin desmontar el proveedor (§0,
`layout-router.js:549`); `eraUltimo` lleva el foco al último de la nueva lista, que es el
«anterior» del criterio 9.

### 1.6 Encabezado enfocable — `app/(app)/agenda/marco.tsx` (modificar)

Se añade una prop opcional y nada más: `encabezadoEnfocable?: boolean`. Si es `true`, el `h2`
recibe `tabIndex={-1}` y un anillo `focus-visible` como el de los enlaces. Sin la prop, el
marcado es idéntico al de hoy, así que el fallback de `page.tsx` (T-047) no cambia.

### 1.7 Panel — `app/(app)/agenda/documentacion.tsx` (reescribir)

```ts
export async function Documentacion({ centroParametro }: { centroParametro: string | null }): Promise<JSX.Element | null>
```

1. `cargarContexto(centroParametro)`. Si falla, `Marco` con `AvisoDeError` (como hoy).
2. `criterio = criterioDocumentacion(rol)`. Si `criterio.tipos?.length === 0`, `return null` (como hoy).
3. `r = await leerPendientes(sesion, criterio)`. Se pasa **el objeto `criterio` tal cual**, sin
   claves añadidas, y por eso las aserciones de `documentacion.test.tsx:26-60` siguen valiendo
   con solo cambiar el nombre del mock. Si falla, `Marco` con `AvisoDeError`.
4. `grupos = agruparYOrdenar(r.alertas)`; `visibles = grupos.slice(0, TAMANO_PANEL)`.
5. `n = await leerNombresPacientes(sesion, visibles.map(g => g.pacienteId))`: solo los ≤ 6
   pintados. Si falla, `AvisoDeError`.
6. `presentarGrupo(g, {rol, hoy, nombre, modo: 'desplegable', filtros: SIN_FILTROS})`. El
   nombre es `[nombre, apellidos].filter(Boolean).join(' ')`, o `null` si sale vacío o no hay fila.
7. Render: `Marco` (`MarcoBloque id="agenda-documentacion" encabezadoEnfocable` envolviendo
   `ProveedorResolucion prefijo="panel" encabezadoId="agenda-documentacion" pacientes={…}`) en
   **todas las ramas** (error, vacío y lista); en error y vacío, `pacientes=[]`.
   - Con `r.recortada`: `<p>` «Se muestran los {leidos} más urgentes de {total}.»
   - Sin grupos: `EstadoVacio icono="documento" titulo={t('agenda.documentacion.vacio')}` (que
     pasa a decir «Al día») y la explicación de siempre.
   - Lista `<ul>` de `FilaPaciente prefijo="panel" modo="desplegable"`.
   - Pie, si `grupos.length > TAMANO_PANEL || r.recortada`:
     `<Link href="/agenda/documentacion" className="min-h-11 …">`, con
     `pie.normal` («Ver todos: {n} pendientes de {m} pacientes») o `pie.recortada`
     («Ver todos: {n} pendientes de {m} o más pacientes»). `n = r.total` y `m = grupos.length`.
   - Sin filtro de centro (como hoy).

### 1.8 Página — `app/(app)/agenda/documentacion/` (crear)

| Fichero | Tipo | Contrato |
|---|---|---|
| `page.tsx` | Server, **no `async`** | `export default function PaginaDocumentacion({ searchParams }: { searchParams: Promise<Record<string, string \| string[] \| undefined>> })`. Cabecera estática: versalita `t('agenda.versalita')` y `<h2 id={ID_TITULO} tabIndex={-1}>{t('agenda.documentacion.titulo')}</h2>`. Después, `<Suspense fallback={<EsqueletoDocumentacion />}><ContenidoDocumentacion searchParams={searchParams} /></Suspense>`. Sin `use cache` y sin `export const dynamic`. `export const ID_TITULO = 'documentacion-titulo'` se declara en `parametros.ts` para que lo importen el contenido y el buscador. |
| `parametros.ts` | Puro (cliente y servidor) | `leerParametrosDocumentacion(crudos: Record<string, string \| string[] \| undefined>): Filtros & { pagina: number }`. Un valor repetido (array) cuenta como ausente. `pagina`: `/^\d+$/` y `>= 1`, o si no **1**. `tipo`: `z.enum(ORDEN_TIPOS)`. `nivel`: `'1' \| '2' \| '3'` → número. `paciente`: `z.uuid()`. Lo que no valida, `null`. `?profesional` y cualquier otra clave **no se leen**. `leerFiltrosDeFormulario(datos: FormData): Pick<Filtros, 'tipo' \| 'nivel'>` aplica **los mismos validadores** por campo (un `File` cuenta como ausente). `esquemaTermino = z.string().trim().min(2).max(100)`. `ID_TITULO`. Importa `ORDEN_TIPOS` de `../pendientes` **solo como valor**. Si eso arrastrara `bloques.ts` al cliente, se declara aquí la misma lista desde `Constants` y `pendientes.ts` la importa de aquí. El implementador elige la dirección que no meta `bloques.ts` en el bundle del cliente. |
| `contenido.tsx` | Server, `async` | `ContenidoDocumentacion({ searchParams })`. Pasos en §1.9. |
| `filtros.tsx` | Server | `Filtros({ visibles, vigentes })`. El grupo **tipo** solo se pinta si `visibles.length > 1`: «Todos» más un enlace por tipo visible, en el orden de `ORDEN_TIPOS`. El grupo **nivel** solo se pinta si `visibles` incluye `nota_sin_firmar`: «Todos», «Nivel 1», «Atrasada (nivel 2)», «Muy atrasada (nivel 3)». Cada grupo es un `<div role="group" aria-labelledby>` con una etiqueta visible, y cada opción es un `<Link>` `min-h-11` hacia `hrefDocumentacion({...vigentes, [campo]: valor})` **sin `pagina`**; la vigente lleva `aria-current="true"`. No hay filtro de profesional. |
| `paginacion.tsx` | Server | `Paginacion({ pagina, ultima, filtros })`; no se pinta si `ultima <= 1`. `<nav aria-label={t('…paginacion.etiqueta')}>` con «Anterior» (solo si `pagina > 1`), «Página X de Y» como enlace a sí misma con `aria-current="page"` y «Siguiente» (solo si `pagina < ultima`). Todos son `<Link>` `min-h-11 min-w-11` que conservan `tipo`, `nivel` y `paciente`. |
| `buscador.tsx` | `'use client'` | §1.10. |
| `acciones.ts` | `'use server'` | §1.11. |
| `esqueleto.tsx` | Server | `EsqueletoDocumentacion`: tres barras estáticas `aria-hidden` y un `<p className="sr-only">` con «Cargando…» del catálogo. **Sin `animate-*`.** No reutiliza `EsqueletoLista`, que late. |

### 1.9 `ContenidoDocumentacion`, paso a paso

1. `const p = leerParametrosDocumentacion(await searchParams)`.
2. `contexto = await cargarContexto(null)`. Si falla, el envoltorio de lista (punto 9) con
   `AvisoDeError`.
3. `criterio = criterioDocumentacion(rol)`; `visibles = tiposVisibles(criterio)`;
   `tipos = tiposConsultados(criterio, p.tipo)`.
4. `r = await leerPendientes(sesion, { soloPropias: criterio.soloPropias, tipos, nivel: p.nivel ?? undefined, pacienteId: p.paciente ?? undefined })`.
   Con `tipos = []`, el lector no consulta. Si falla, `AvisoDeError`.
5. `grupos = agruparYOrdenar(r.alertas)`; `pag = paginar(grupos, p.pagina, TAMANO_PAGINA)`.
6. **`if (p.pagina > pag.ultima) redirect(hrefDocumentacion({ tipo: p.tipo, nivel: p.nivel, paciente: p.paciente, pagina: pag.ultima }))`**.
   No hay ningún `try` en la función. Con `ultima = 1`, la redirección es a la URL sin `pagina`.
7. `n = await leerNombresPacientes(sesion, pag.items.map(g => g.pacienteId))`: ≤ 20 ids. Si
   falla, `AvisoDeError`.
8. `presentados = pag.items.map(g => presentarGrupo(g, { rol, hoy, nombre, modo: p.paciente ? 'completo' : 'desplegable', filtros: p }))`.
9. Render, en este orden:
   1. El aviso de recorte (si `r.recortada`).
   2. `<Filtros visibles vigentes={p} />`.
   3. Con `p.paciente`, el enlace «Quitar el filtro de paciente» hacia `hrefDocumentacion({tipo, nivel})`.
   4. El **envoltorio de lista**: `ProveedorResolucion prefijo="pagina" encabezadoId={ID_TITULO} pacientes={…}`. Siempre en la misma posición del árbol y con dentro uno de estos tres:
      - `AvisoDeError`;
      - el vacío: «Al día» sin filtros, o «Ningún pendiente con estos filtros» más el enlace «Quitar los filtros» a `/agenda/documentacion` si hay algún filtro (incluido `paciente`);
      - la `<ul>` de `FilaPaciente prefijo="pagina"` seguida de `<Paginacion>` (sin `?paciente`).

   Sin `?paciente`, el envoltorio de lista se pasa como `children` a
   `<Buscador tipo={p.tipo} nivel={p.nivel}>`. Con `?paciente` no hay buscador.

### 1.10 Buscador — `documentacion/buscador.tsx` (cliente)

```ts
export function Buscador(props: { tipo: TipoAlerta | null; nivel: 1 | 2 | 3 | null; children: ReactNode }): JSX.Element
```

- `const [estado, accion, buscando] = useActionState<EstadoBusqueda, FormData>(envoltorio, { fase: 'inicial' })`.
  `envoltorio` hace `try { return await buscarPendientes(previo, datos) } catch (e) { unstable_rethrow(e); console.error('Buscador: la acción ha fallado'); return { fase: 'fallo' } }`.
  El error **no** se pasa a `console.error`: podría llevar el cuerpo de la petición.
- Otros estados y referencias: `vista: 'lista' | 'busqueda'` con `useState`, `errorLocal: boolean`
  con `useState`, `ultimoEnvio = useRef<FormData | null>(null)` y `campo = useRef<HTMLInputElement>(null)`.
- El `<form action={enviar}>` va **sin `method`** y sin `action` de cadena. `enviar(datos)`:
  1. Valida `esquemaTermino.safeParse(datos.get('termino'))`.
  2. Si no valida: `setErrorLocal(true)` y return, sin despachar nada.
  3. Si valida: `setErrorLocal(false)`, `ultimoEnvio.current = datos`, `setVista('busqueda')` y `accion(datos)`.
- Dentro del formulario:
  - `<label htmlFor>` visible y `<input type="search" name="termino" id autoComplete="off" aria-describedby="{ayuda} {error}" aria-invalid={hayError} className="min-h-11 …">`, escrito a mano porque `field.tsx` mide `h-10`.
  - `<input type="hidden" name="tipo">` y `<input type="hidden" name="nivel">`, solo si vienen.
  - `<Button type="submit" aria-disabled={buscando} onClick={e => buscando && e.preventDefault()}>Buscar</Button>`.
  - La ayuda fija: «La búsqueda no se guarda: si cambias de filtro o de página, o recargas, se pierde.»
  - El error (`errorLocal` o `fase === 'invalida'`): «Escribe entre 2 y 100 caracteres.»
- Hay un `<p role="status" aria-live="polite" aria-atomic="true" className="sr-only">` **siempre
  montado**, fuera de las ramas. Con `fase === 'resultados'` anuncia «Ningún paciente coincide»,
  «1 paciente coincide» o «N pacientes coinciden».
- Debajo:
  - `vista === 'busqueda' && fase === 'resultados'`: el botón «Limpiar búsqueda», el aviso «más de
    20» si `coincidencias > 20` («Hay {n} pacientes que coinciden; se muestran los 20 más urgentes.
    Afina la búsqueda.»), el aviso de recorte si `recortada`, y
    `ProveedorResolucion prefijo="busqueda" encabezadoId={ID_TITULO} pacientes={…} alAcertar={relanzar}`
    con la `<ul>` de `FilaPaciente prefijo="busqueda" modo="desplegable"`. **`children` no se pinta**,
    y con él desaparece la paginación.
  - `vista === 'busqueda' && fase === 'fallo'`: `AvisoDeError` y «Limpiar búsqueda».
  - En cualquier otro caso: `children`.
- `relanzar = () => ultimoEnvio.current && startTransition(() => accion(ultimoEnvio.current!))`.
- «Limpiar búsqueda» hace `setVista('lista')`, vacía el campo (`campo.current.value = ''`) y lo enfoca.
- Prohibido en este fichero: `useRouter`, `router.*`, `history.*`, `useSearchParams`,
  `localStorage`, `sessionStorage`, `document.cookie` y `method="get"`.

### 1.11 Acción del buscador — `documentacion/acciones.ts` (`'use server'`)

```ts
export type EstadoBusqueda =
  | { fase: 'inicial' }
  | { fase: 'invalida' }
  | { fase: 'fallo' }
  | { fase: 'resultados'; grupos: GrupoPresentado[]; coincidencias: number; recortada: boolean; leidos: number; total: number };

export async function buscarPendientes(_previo: EstadoBusqueda, datos: FormData): Promise<EstadoBusqueda>;
```

1. `termino = esquemaTermino.safeParse(typeof crudo === 'string' ? crudo : undefined)`. Si no
   valida, `return { fase: 'invalida' }`. **Antes** de `cargarContexto`: un término inválido no
   consulta nada, ni la sesión ni la base.
2. `contexto = await cargarContexto(null)`, que llama a `exigirSesion()`. Una redirección a
   `/login` sigue su curso: no hay `try` alrededor. Si falla, `{ fase: 'fallo' }`.
3. `criterio = criterioDocumentacion(contexto.rol)`; `f = leerFiltrosDeFormulario(datos)`;
   `tipos = tiposConsultados(criterio, f.tipo)`. **No se lee** ninguna otra clave del
   `FormData`: `rol`, `tipos`, `soloPropias` y `profesional` no existen para la acción.
4. `r = await leerPendientes(sesion, { soloPropias: criterio.soloPropias, tipos, nivel: f.nivel ?? undefined })`.
   Si falla, `{ fase: 'fallo' }`.
5. `grupos = agruparYOrdenar(r.alertas)`; `n = await leerNombresPacientes(sesion, grupos.map(g => g.pacienteId))`,
   en tandas de 100. Si falla, `{ fase: 'fallo' }`.
6. `coinciden = grupos.filter(g => coincideBusqueda(termino, n.get(g.pacienteId)?.nombre ?? null, n.get(g.pacienteId)?.apellidos ?? null))`.
   El orden ya es el de urgencia.
7. Se devuelve
   `{ fase: 'resultados', grupos: coinciden.slice(0, MAXIMO_RESULTADOS).map(presentarGrupo(…, modo: 'desplegable', filtros: {…f, paciente: null})), coincidencias: coinciden.length, recortada: r.recortada, leidos: r.alertas.length, total: r.total }`.
   Ni el término ni nombre alguno que no coincida sale de la acción.
8. No hay ningún `console.*` en la acción: los lectores ya registran su error, que no lleva el
   término.

### 1.12 Textos — `lib/i18n/es.ts`, solo bajo `agenda.documentacion`

Se cambia `vacio: 'Al día'`. Se añaden estas claves; el implementador puede cambiar el nombre
de la clave, pero no el texto:

- **`insignia`**
  - `una`: `'1 pendiente'`
  - `varias`: `'{n} pendientes'`
- **`accesible`**
  - `base`: `'{nombre}, {insignia}'`
  - `conEscalados`: `'{nombre}, {insignia}, {escalados}'`
  - `escalados.una`: `'1 escalado'`
  - `escalados.varias`: `'{n} escalados'`
- **`resumen`**
  - `separador`: `' · '`
  - `tipos.<tipo>.una` y `tipos.<tipo>.varias`: `'1 nota'`/`'{n} notas'`, `'1 borrador'`/`'{n} borradores'`, `'1 consentimiento'`/`'{n} consentimientos'`, `'1 informe'`/`'{n} informes'`, `'1 evaluación'`/`'{n} evaluaciones'`
  - `antiguo.hoy`: `' — el más antiguo, de hoy'`
  - `antiguo.una`: `' — el más antiguo, hace 1 día'`
  - `antiguo.varias`: `' — el más antiguo, hace {n} días'`
- **`enlace`**
  - `nota`: `'{tipo} de {paciente}: abrir la nota'`
  - `ficha`: `'{tipo} de {paciente}: ir a la ficha'`
- **`verTodos`**: `'Ver todos ({n})'`
- **`pie`**
  - `normal`: `'Ver todos: {n} pendientes de {m} pacientes'`
  - `recortada`: `'Ver todos: {n} pendientes de {m} o más pacientes'`
- **`recorte`**: `'Se muestran los {leidos} más urgentes de {total}.'`
- **`desplegar`**: `'Mostrar u ocultar sus pendientes'`. Solo si hace falta un `title`; si no, no se añade.
- **`pagina`**
  - `cargando`: `'Cargando…'`
  - `quitarPaciente`: `'Quitar el filtro de paciente'`
  - `quitarFiltros`: `'Quitar los filtros'`
  - `vacioFiltros`: `'Ningún pendiente con estos filtros'`
- **`filtros`**
  - `tipo`: `'Tipo'`
  - `nivel`: `'Nivel'`
  - `todos`: `'Todos'`
  - `nivel1`: `'Nivel 1'`
  - `nivel2`: `'Atrasada (nivel 2)'`
  - `nivel3`: `'Muy atrasada (nivel 3)'`
- **`paginacion`**
  - `etiqueta`: `'Páginas de pendientes'`
  - `anterior`: `'Anterior'`
  - `siguiente`: `'Siguiente'`
  - `actual`: `'Página {x} de {y}'`
- **`buscador`**
  - `etiqueta`: `'Buscar por nombre o apellidos'`
  - `boton`: `'Buscar'`
  - `ayuda`: `'La búsqueda no se guarda: si cambias de filtro o de página, o recargas, se pierde.'`
  - `invalida`: `'Escribe entre 2 y 100 caracteres.'`
  - `ninguna`: `'Ningún paciente coincide'`
  - `una`: `'1 paciente coincide'`
  - `varias`: `'{n} pacientes coinciden'`
  - `masDe20`: `'Hay {n} pacientes que coinciden; se muestran los 20 más urgentes. Afina la búsqueda.'`
  - `limpiar`: `'Limpiar búsqueda'`
  - `error`: `'No se ha podido buscar.'`

`AvisoDeError` recibe un mensaje: el de la lectura (`r.mensaje`) o `buscador.error`.

### 1.13 Accesibilidad de punta a punta — `accesibilidad/documentacion-pendiente.spec.ts` (crear)

- Sigue el patrón de `avisos.spec.ts`: entra como `ana@psicogestion.test`, a 360 × 740 y en serie.
- En `beforeAll`, con `ejecutarSql`, prepara alertas abiertas para pacientes de Ana:
  - 9 o más pacientes;
  - uno con 12 alertas;
  - alguno con nivel 3, que es una `nota_sin_firmar` con `fecha_referencia` antigua;
  - alguno solo con `consentimiento_pendiente`, con `origen_tabla` y `origen_id` válidos según
    las restricciones reales de la tabla, que el implementador lee en la migración.
- En `afterAll` pone `estado = 'resuelta'` en las filas que creó, por id. Así no deja
  pendientes que ensucien otras pruebas.

Comprobaciones:
1. `/agenda` y `/agenda/documentacion` cumplen `scrollWidth <= clientWidth`.
2. Las cajas (`boundingBox`) de los objetivos del criterio 12 miden ≥ 44 × 44; el campo, ≥ 44 de
   alto.
3. Recorrido con teclado: Tab hasta el botón, Espacio despliega, Tab hasta «Marcar como
   resuelta», Intro, y `document.activeElement.id` coincide con `panel-paciente-<id>`.
4. D10: `history.length` antes de buscar, buscar el apellido sin tilde, esperar el resultado,
   `page.url()` no contiene el término ni `encodeURIComponent(término)`, y `history.length` igual.
5. Navegar de `/agenda` a «Ver todos» deja `getByRole('dialog')` en 0.

### 1.14 Documentación

- `docs/interfaz.md` §«Agenda · Tu día, de un vistazo», punto 3: tres o cuatro líneas (agrupada
  por paciente; tope de 6 con «Ver todos»; página paginada con filtros de tipo y nivel; buscador
  por POST sin URL). No se toca nada más de la sección: T-047 edita el resto.
- `docs/state.md`: quitar «bandeja sin límite, » de la línea del hallazgo T-014 y anotar como
  hallazgo nuevo el esqueleto que late (§4, R7).
- **Hallazgo para que el documentalista lo pase a `docs/state.md` §Hallazgos abiertos.** El
  fallback del panel de documentación en `app/(app)/agenda/page.tsx:93-101` (territorio de T-047)
  es `MarcoBloque` con `EsqueletoLista`, de `app/(app)/agenda/esqueletos.tsx`, y
  `EsqueletoLista` lleva `animate-pulse`. Mientras carga, choca con el ADR-047 (sin animación)
  y con el espíritu de D1. T-048 no lo toca: su página usa un `esqueleto.tsx` propio y estático.
  Lo corrige T-047 o un ticket propio. Texto sugerido para la línea: «**T-047/T-048**: el
  esqueleto del panel de documentación en /agenda (`EsqueletoLista`) usa `animate-pulse`
  (ADR-047).»
- `docs/bitacora/T-048.md`.

## 2 · Decisiones y alternativas descartadas

1. **El nombre `AlertaPendiente` se conserva y la función se renombra a `leerPendientes`.**
   `bloques.ts` (de T-047) importa el tipo, y renombrarlo rompería un fichero ajeno. El nombre
   viejo de la función mentía (leía todos los tipos). Descartado: mantener `leerAlertasNotaPendiente`.
2. **La lectura de nombres va aparte, en `leerNombresPacientes`.** Así el panel pide 6 ids, la
   página 20 y el buscador todos en tandas, con una sola función. Descartado: unir los nombres
   dentro del lector, que es lo que hacía que se pidieran todos.
3. **El rango de la lectura empieza siempre en 0, y la paginación es de pacientes y en memoria.**
   Es el 416 de T-040, y D2 la cierra así. Descartado: un `offset` por página.
4. **`?paciente` se filtra en la base (`.eq('paciente_id')`).** Así un paciente con pendientes
   fuera de los 1000 primeros sale completo. Descartado: filtrar en memoria lo leído, que lo
   dejaría incompleto o vacío.
5. **El filtro de tipo solo estrecha.** Un tipo fuera de la lista blanca da `[]`, no se consulta
   y la página dice «Ningún pendiente con estos filtros». Descartado: ignorar el `?tipo`
   prohibido, porque oculta el filtro activo sin decirlo; el contrato admite las dos y esta es
   la más fácil de comprobar.
6. **El foco se decide cuando la alerta resuelta deja de estar en las props**, no al recibir
   `ok`. Antes de la revalidación, la fila sigue ahí y el destino sería falso. Descartado: un
   `setTimeout` o enfocar en el `useEffect` del contador, que es lo de hoy.
7. **El destino del foco se busca por `id` de DOM** (`pendientes-ids.ts`). No hace falta un
   registro de `ref` en el contexto, y las pruebas lo leen con `toHaveFocus` sobre
   `getElementById`. Descartado: un `Map` de refs, que hay que limpiar al desmontar.
8. **La lista del desplegable está siempre en el DOM con `hidden`.** `aria-controls` tiene que
   apuntar a algo existente. Descartado: montarla solo al abrir.
9. **La urgencia va con `data-urgencia`, un icono y un borde en la insignia, más la píldora de
   texto fuera del botón.** La píldora no se mete dentro del botón (WCAG 2.5.3: el texto visible
   tiene que estar en el nombre accesible) ni dentro del resumen (D7 exige que la descripción sea
   solo el resumen).
10. **El buscador valida en el cliente y en el servidor con el mismo `esquemaTermino`**
    (convención de `CLAUDE.md`). La acción valida **antes** de la sesión para no consultar con
    un término inválido.
11. **La acción obtiene rol y `hoy` con `cargarContexto(null)`**, el mismo camino que la página.
    Así «pendiente desde…» cuadra con la lista. Fuera del render, `cache()` no memoiza; es una
    llamada y basta. Descartado: `exigirSesion` + `cargarRol` sin zona, que da otro `hoy`.
12. **Al resolver dentro de los resultados, se relanza con el `FormData` guardado en un `ref`**,
    con `alAcertar` en `ProveedorResolucion`. Descartado: guardar el término en el estado de la
    URL (D10) o en un almacenamiento (D9).
13. **La paginación mínima es Anterior, «Página X de Y» (actual, con `aria-current`) y
    Siguiente.** Cubre el contrato. Descartado: números de página con elipsis, porque es lógica
    que nadie pidió.
14. **La página lleva su propio esqueleto estático.** `EsqueletoLista` late y es de T-047.
15. **`acciones-alertas.ts` no se toca.** `revalidatePath('/', 'layout')` invalida todas las
    rutas por debajo, y la página nueva cuelga de ese layout. Solo si el criterio 9 falla en la
    página por falta de revalidación, se añade `revalidatePath('/agenda/documentacion')` y nada
    más (§6, entrada condicional).

16. **P1 · Orden de los tipos en el resumen D7: el del enum. Decisión cerrada el 06-10-2026.**
    El criterio D7 pedía a la vez el texto «3 notas · 2 informes · 1 consentimiento — …» y «el
    orden del enum», y en el enum `consentimiento_pendiente` va **antes** que `informe_pendiente`.
    El orquestador la cerró con criterio, siguiendo la recomendación de este diseño, y se le
    comunica al propietario, que puede cambiarla. **No es una aprobación del propietario.**
    - Orden: `ORDEN_TIPOS = Constants.public.Enums.tipo_alerta_documentacion` (notas, borradores,
      consentimientos, informes, evaluaciones). Es la única fuente de orden.
    - **Texto que espera la prueba** (`pendientes.test.ts`, D7): «3 notas · 1 consentimiento ·
      2 informes — el más antiguo, hace 12 días».
    - Si el propietario la cambia: se sustituye `ORDEN_TIPOS` por una lista literal y la línea
      esperada de esa prueba. Nada más.
    - Descartado: el orden del ejemplo, porque deja dos fuentes de orden.

## 3 · Cómo se cierra cada criterio de aceptación

| Criterio | Prueba (fichero) | Qué demuestra / por qué falla si se rompe |
|---|---|---|
| **1** | `pendientes.test.ts` | 7 alertas de 3 pacientes dan 3 grupos, con recuentos que suman 7 y `pacienteId` únicos. |
| **4** | `pendientes.test.ts` | Seis pares con su gemelo invertido: un nivel 3 reciente antes que un nivel 1 antiguo; solo sin nivel de hace 30 días **después** de un nivel 1 de hoy; igual nivel, antes el más antiguo; entre sin nivel, la antigüedad; fecha nula al final; empate total, por `pacienteId`. Más el orden interno de un grupo. Las entradas van **desordenadas** para que no pase por el orden de la lectura. |
| **6** | `pendientes.test.ts` | Los cuatro textos exactos y el nombre ilegible (vía `presentarGrupo` con `nombre: null`). |
| **D7** | `pendientes.test.ts` | El texto exacto «3 notas · 1 consentimiento · 2 informes — el más antiguo, hace 12 días» (orden del enum, §2.16), un solo tipo, sin fecha (sin sufijo), y una lista solo de consentimientos que solo nombra consentimientos. |
| **D8** | `pendientes.test.ts` | Tabla de casos sobre `destinoPendiente`. Con rol técnico, una nota de `citas` da `/pacientes/<p>`, que **falla** si se quita la comprobación de rol. Ningún destino contiene `#`. |
| **Más de 10** | `pendientes.test.ts` | Un grupo de 40 da `pendientes.length === 10`, `recuento === 40` y `verTodos.href === '/agenda/documentacion?paciente=<uuid>'`. |
| **Coincidencia** | `pendientes.test.ts` y `documentacion/parametros.test.ts` | `coincideBusqueda`: «lopez» y «ana lóp» sí; «ana garcía» no. `esquemaTermino`: `'a'` y `'   '` no validan. |
| **2** | `pendientes-fila.test.tsx` | Con 1 pendiente, `queryAllByRole('button', {expanded: …})` vacío; el enlace del tipo con su `href`, «pendiente desde…», la píldora y «Marcar como resuelta» cuando `resoluble`. |
| **3** | `pendientes-fila.test.tsx` | `aria-expanded="false"` y `aria-controls` igual al `id` de la `<ul>`. `userEvent.keyboard('{Enter}')` y `(' ')` alternan. Dos filas: abrir la segunda deja la primera en `true`. |
| **D7 en el DOM** | `pendientes-fila.test.tsx` | `toHaveAccessibleName(textoAccesible)`, `toHaveAccessibleDescription(resumen)` y el elemento descrito visible (sin `hidden` ni `sr-only`). El nombre no contiene el resumen. |
| **D9** | `documentacion.test.tsx`, `documentacion/contenido.test.tsx` y `rg` | Todos los `aria-expanded` del panel y de la página montados son `"false"`. El `rg` del contrato vacío. |
| **5** | `pendientes-fila.test.tsx` y `rg` | La insignia de nivel 3 tiene `data-urgencia="muy-atrasada"` y un `svg`; la de nivel 2 no tiene ninguno de los dos. «Muy atrasada» está en la fila. El `rg "latido\|animate-"` del contrato vacío. |
| **7** | `documentacion.test.tsx` | 9 pacientes y 23 alertas (`total: 23`) pintan 6 filas y el enlace «Ver todos: 23 pendientes de 9 pacientes» con `href="/agenda/documentacion"`. Con 6, sin enlace. Con `recortada: true`, «… de 9 o más pacientes» y el aviso de recorte. Con 0, «Al día». |
| **9** | `resolver-alerta.test.tsx` | Se monta `ProveedorResolucion` con filas falsas (enlace con `id` + `ResolverAlerta`, con `resolverAlerta` mockeado a `{ok: true}`), se pulsa y se hace `rerender` con las nuevas `pacientes`, como la revalidación. (a) El paciente sigue: el foco va a `#panel-paciente-A` y el status contiene «Marcada como resuelta.» y el anuncio. (b) El paciente desaparece y no era el último: el foco va al siguiente; si era el último, al anterior. (c) Lista vacía: el foco va a `#agenda-documentacion`. En cada caso, `getByRole('status')` existe antes y después. **Falla** con el foco de hoy (`role="group"`) y también si se enfoca antes del `rerender`: el caso (b) se escribe para que, antes del `rerender`, el «siguiente» calculado sea otro. Uno más para la página: `contenido.test.tsx` comprueba que la lista va dentro de `ProveedorResolucion` con `encabezadoId="documentacion-titulo"`. |
| **D11** | `pendientes-fila.test.tsx` | Cada `form` tiene exactamente un `input[name="alertaId"]` y `queryAllByRole('checkbox')` está vacío. |
| **11** | `documentacion.test.tsx` (las cuatro de 26-60 **con solo el nombre del mock cambiado**), `contenido.test.tsx`, `acciones.test.ts`, `agenda.test.ts`, `pendientes.test.ts` | Panel por rol: las aserciones de hoy. Página y acción: el técnico con `?tipo=nota_sin_firmar` (o `tipo` en el `FormData`) **no llama** a `leerPendientes` o lo llama con `tipos: []` (que no consulta); el administrador lleva `soloPropias: true` y el rol nulo, las dos cosas. `?profesional=` no cambia la llamada. Las filas del técnico no tienen ningún `href` con `/historia`. En `agenda.test.ts`, `select` recibe la cadena exacta de 8 columnas y la de `pacientes`, `'id, nombre, apellidos'`. |
| **Errores** | `documentacion.test.tsx`, `contenido.test.tsx` y `buscador.test.tsx` | Un `ok: false` del lector, de los nombres y del contexto pinta `role="alert"`, y no «Al día». En el buscador, `fase: 'fallo'` pinta `AvisoDeError`. |
| **8** | `documentacion/contenido.test.tsx` | Se mockean `../datos` y `@/lib/citas/agenda`. Con 45 pacientes, la 1 trae 20 y la 3 trae 5, «Página 3 de 3» con `aria-current="page"`, y los enlaces conservan `tipo`, `nivel` y `paciente`. `?pagina=99`: `redirect` (mock que lanza) llamado con `/agenda/documentacion?tipo=…&nivel=…&pagina=3`. `abc`, `0` y `-2` dan la 1 (en `parametros.test.ts`). Los `href` de los filtros no contienen `pagina=`. |
| **8b** | `documentacion/contenido.test.tsx` | El técnico no tiene ningún `role="group"` de filtros; el profesional y el administrador, dos; el texto «profesional» no aparece en ningún filtro. Con `?paciente`: ni `aria-expanded` ni campo `searchbox`, y todas las filas del paciente. |
| **D10a** | `documentacion/buscador.test.tsx` | Con `next/navigation` mockeado (`useRouter` con `push` y `replace` espiados) y `vi.spyOn(window.history, 'pushState' / 'replaceState')`, buscar «López» no llama a nada. `form.getAttribute('method')` no es `get`, y `form.getAttribute('action')` es `null` o empieza por `javascript:` (el marcador de React 19 para acciones función; **comprobar qué pinta jsdom** y fijar la aserción a eso). Ningún `input` del formulario tiene `name="q"`. |
| **D10b** | `documentacion/acciones.test.ts` | Mockea **solo** `../datos` (`cargarContexto` devuelve una sesión falsa) y usa los lectores **reales** sobre un doble de PostgREST que registra **cada método y sus argumentos**. Casos: (1) `'a'` da `invalida` y ni `cargarContexto` ni `from` se llaman. (2) Un `FormData` con `rol=profesional_sanitario`, `tipos=nota_sin_firmar` y `soloPropias=false` para una sesión de técnico lleva `.in('tipo', ['consentimiento_pendiente'])`. (3) Se aplican `tipo` y `nivel`. (4) Ningún argumento de ninguna llamada registrada (incluidas `or`, `ilike`, `textSearch` y `filter`) contiene el término crudo ni el normalizado. (5) Con un error de PostgREST forzado, `console.error`, `console.warn` y `console.log` espiados no reciben el término. (6) 34 coincidencias dan `grupos.length === 20` y `coincidencias === 34`. (7) 250 pacientes dan 3 llamadas a `.in('id', …)` de ≤ 100. |
| **D10c** | `documentacion/buscador.test.tsx` | Con `buscarPendientes` mockeado: tras buscar, la paginación (`children` de marca) no está; «Limpiar búsqueda» la devuelve y el foco va al campo; resolver un resultado (`resolverAlerta` mockeado a `ok`) vuelve a llamar a `buscarPendientes` con un `FormData` cuyo `termino` es el mismo. |
| **10** | `lib/citas/agenda.test.ts` y `documentacion.test.tsx` | El doble se amplía con `range`, `or`, `ilike`, `textSearch` y `filter` (todos `vi.fn` encadenables) y con `count` en la respuesta. `select` recibe `{count: 'exact'}` y `range(0, 999)`. `count: 1500` con 1000 filas da `recortada: true` y `total: 1500`. `tipos: []` no llama a `from`. En el panel, `leerNombresPacientes` recibe **exactamente** los 6 ids pintados aunque se lean 9 pacientes; en la página, 20 de 45. **Falla** si se quita `range`, si se quita el aviso o si se pasan todos los ids. |
| **12** | `npx playwright test accesibilidad/documentacion-pendiente.spec.ts` | §1.13. |
| **Nada se rompe** | `npm test`, `npm run lint`, `npm run build` y `rg -n "use cache" …` del contrato | Salida limpia, pegada en `evidencia.json`. |
| **Manuales** | Guion del contrato, pasos 1-6 | Se anotan en la bitácora con la fecha y el resultado. |

## 4 · Riesgos, por probabilidad

1. **Alta: conflicto de texto con T-047** en `lib/i18n/es.ts` (bloques vecinos) y en
   `docs/interfaz.md` (la misma sección). No es de lógica. Lo resuelve quien integre el segundo,
   con las claves `agenda.documentacion.*` intactas.
2. **Media: un doble de PostgREST que no registra un método**, y la prueba pasa por el motivo
   equivocado. Por ejemplo, `range` no encadenado devuelve `undefined` y el `await` da vacío.
   Mitigación: el doble lanza si se llama a un método que no conoce, y D10b registra **todas**
   las llamadas.
3. **Media: el efecto del foco no se dispara** porque la revalidación no llega a la página o
   porque las `pacientes` no cambian de identidad. El criterio 9 en Playwright lo caza. La
   contingencia está en §2.15. Si tampoco basta, es un BLOQUEO y no se improvisa.
4. **Media: redirección de `?pagina` justo después de resolver.** Es el caso del único paciente
   de la última página. El estado se conserva (§0, `layout-router.js:549`) y `eraUltimo` resuelve
   el destino, pero la redirección en streaming va por meta tag: se comprueba a mano (guion,
   paso 4) y se anota en la bitácora.
5. **Media: el atributo `action` de un formulario con acción función en jsdom.** Si D10a se
   escribe contra lo que no pinta React 19, la prueba pasa o falla por el motivo equivocado.
   Antes de fijar la aserción hay que comprobarlo.
6. **Baja: `count` nulo.** Está cubierto por la regla de `recortada` en §1.1, con su prueba.
7. **Baja (preexistente, fuera de territorio): el fallback del panel en `/agenda/page.tsx`
   usa `EsqueletoLista`, que lleva `animate-pulse`.** Choca con el espíritu de D1 y el ADR-047
   mientras carga. Es de T-047: se anota en `docs/state.md` §Hallazgos y no se toca.
8. **Baja: la normalización NFD hace que «pena» encuentre «Peña».** Es lo que pide «sin
   diacríticos». Se dice en la bitácora.
9. **Baja: con más de 1000 abiertas, un grupo puede salir incompleto** (le faltan alertas
   menos urgentes). Está declarado por D2 y por el aviso de recorte.
10. **Baja: un paciente con el nombre ilegible por RLS nunca coincide en el buscador.** Es lo
    correcto: no se busca lo que no se puede leer.

## 5 · Qué revisar

**Qué puede elegir el llamante y qué efecto tiene**

- **URL** (`?pagina`, `?tipo`, `?nivel`, `?paciente`): solo estrechan. Comprobar:
  - `tiposConsultados` devuelve `[]` y no la lista pedida cuando el tipo no está en la lista
    blanca;
  - `nivel` y `paciente` solo añaden `.eq`;
  - `?profesional`, `?centro` y cualquier otra clave no se leen en `parametros.ts`;
  - un array (`?tipo=a&tipo=b`) cuenta como ausente.
- **`FormData` de la acción**: solo se leen `termino`, `tipo` y `nivel`. Buscar en
  `acciones.ts` cualquier `datos.get(` distinto de esos tres: debe haber cero. El recorte
  (`soloPropias`, `tipos`) sale de `criterioDocumentacion(contexto.rol)` y de nada más.
- **`alertaId` de resolver**: no cambia. Es un solo uuid por formulario y la acción existente
  sigue con su `.neq('tipo', 'nota_sin_firmar')` y su RLS.

**Qué prueba debe fallar y por qué motivo exacto**

- **D8**: quitar `rol === …` de `destinoPendiente` hace fallar el caso del técnico con
  `/historia`. Que no falle por otra cosa (por ejemplo, porque la fila no lleva `origenTabla`).
- **9**: volver al `role="group"` enfocable hace fallar las tres ramas. Enfocar en cuanto llega
  `ok`, sin esperar las props nuevas, hace fallar la (b).
- **10**: quitar `.range(0, 999)` o `{count: 'exact'}`, o pasar todos los ids a los nombres, hace
  fallar cada uno su aserción. El doble **no** debe devolver datos por defecto que tapen la
  falta de `range`.
- **D10a/b**: poner `method="get"` o un `name="q"` hace fallar D10a. Meter el término en un
  `.ilike` hace fallar D10b (4). Hacer `console.error(error, termino)` hace fallar D10b (5).
- **11**: `documentacion.test.tsx:26-60`. El diff de esas líneas solo puede cambiar el
  identificador del mock (`leerAlertasNotaPendiente` → `leerPendientes`) y añadir
  `leerNombresPacientes` al `vi.mock`. Ninguna aserción se toca.

**Invariantes que podrían saltarse por otra puerta**

- **Nulos**: `nivel` nulo cuenta como 0 en el orden de pacientes y va al final dentro del grupo.
  `fecha_referencia` nula va al final. Las filas con `id`, `paciente_id` o `tipo` nulos se
  descartan. Un `nombre` nulo da la etiqueta genérica, nunca `"null"` ni una cadena vacía.
- **Duplicados**: la deduplicación en `leerNombresPacientes`; `key={pacienteId}` en cada `<li>`;
  los `id` de DOM con prefijo, para que el panel, la página y la búsqueda no choquen.
- **Lista vacía de tipos**: nunca `.in('tipo', [])`. Comprobado en el lector y en la prueba.
- **Concurrencia**: resolver dos veces la misma alerta (dos pestañas) devuelve `ok: false`
  («No se ha podido…») y el foco no se mueve. Dos resoluciones seguidas: la segunda pisa
  `pendiente`, y el foco sigue a la última. Es aceptable y no hay que «arreglarlo».
- **Permisos de tabla entera**: no aparece ninguna lectura nueva de tabla. Solo se leen
  `alertas_documentacion_nivel` (vista `security_invoker`) y `pacientes`, con la sesión del
  usuario y nunca con la clave de servicio.
- **Contenido clínico**: el `select` de 8 columnas no incluye nada clínico. `origen_tabla` y
  `origen_id` son identificadores y solo acaban en un `href` a una ruta que vuelve a validar.
- **Term-leak**: el término no aparece en ningún `href`, ni en `GrupoPresentado`, ni en
  `EstadoBusqueda`, ni en ningún `console.*`.
- **`Date` al cliente**: `GrupoPresentado` y `EstadoBusqueda` solo llevan `string`, `number`,
  `boolean`, `null` y arrays. `hoy` es una cadena.
- **Sin animación**: el `rg` del contrato, y además a ojo `transition` añadidas en la insignia o
  en la fila (el `transition` de `Button` ya existía).
- **Next 16**: `page.tsx` no es `async`; `searchParams` se espera dentro del `Suspense`;
  `redirect` sin `try` alrededor; ningún `use cache` ni `cacheLife`; la acción no captura la
  redirección de `exigirSesion`.
- **Territorio de T-047**: `git diff --name-only` no contiene `bloques.ts`, `parametros.ts` de
  `agenda/` (el de `documentacion/` sí puede), `page.tsx` de `agenda/`, `esqueletos.tsx`,
  `calendario.tsx` ni `vista.ts`.

## 6 · Territorio

Cierra el provisional del contrato. Ningún fichero fuera de esta lista:

```
lib/citas/agenda.ts
lib/citas/agenda.test.ts
app/(app)/agenda/documentacion.tsx
app/(app)/agenda/documentacion.test.tsx
app/(app)/agenda/resolver-alerta.tsx
app/(app)/agenda/resolver-alerta.test.tsx
app/(app)/agenda/marco.tsx
app/(app)/agenda/pendientes.ts
app/(app)/agenda/pendientes.test.ts
app/(app)/agenda/pendientes-ids.ts
app/(app)/agenda/pendientes-fila.tsx
app/(app)/agenda/pendientes-fila.test.tsx
app/(app)/agenda/documentacion/page.tsx
app/(app)/agenda/documentacion/contenido.tsx
app/(app)/agenda/documentacion/contenido.test.tsx
app/(app)/agenda/documentacion/parametros.ts
app/(app)/agenda/documentacion/parametros.test.ts
app/(app)/agenda/documentacion/filtros.tsx
app/(app)/agenda/documentacion/paginacion.tsx
app/(app)/agenda/documentacion/esqueleto.tsx
app/(app)/agenda/documentacion/buscador.tsx
app/(app)/agenda/documentacion/buscador.test.tsx
app/(app)/agenda/documentacion/acciones.ts
app/(app)/agenda/documentacion/acciones.test.ts
lib/i18n/es.ts                                   # solo bajo agenda.documentacion.*
accesibilidad/documentacion-pendiente.spec.ts
docs/interfaz.md                                 # solo §Agenda, punto 3
docs/bitacora/T-048.md
docs/state.md                                    # cierra «bandeja sin límite»; anota R7
# Condicional (§2.15), solo si el criterio 9 falla en la página por revalidación:
app/(app)/agenda/acciones-alertas.ts             # añadir revalidatePath('/agenda/documentacion'), nada más
app/(app)/agenda/acciones-alertas.test.ts
```

## 7 · Delegable

Nada, de acuerdo con el contrato. Lo único sin comportamiento sería `esqueleto.tsx` (diez
líneas) y las claves de `es.ts`, y encargarlo fuera cuesta más que escribirlo. La insignia es
justo la urgencia de D1; todo lo demás tiene foco, ARIA, roles, lectura o el buscador.

## Lo que no entra, y por qué

- **Números de página con elipsis**: el contrato pide Anterior, Siguiente y «Página X de Y» con
  `aria-current`.
- **Buscador sin JavaScript**: el buscador va envuelto en `useActionState` con un cliente que
  valida y relanza, así que sin JS no busca. El contrato solo exige que funcionen sin JS los
  enlaces de la paginación (y aquí también los filtros).
- **Corregir el esqueleto que late en `/agenda`**: es territorio de T-047; queda como hallazgo
  (R7).
- **Tocar `bloques.ts` o `criterioDocumentacion`**: el contrato lo prohíbe; aquí solo se importa.
- **Enlace «Volver a la agenda» en la página**: la navegación lateral ya lleva a Agenda y el
  contrato no lo pide.
- **Pluralizar `m` en el pie** («1 paciente»): el pie solo sale con más de 6 pacientes o con
  más de 1000 pendientes, y ahí el plural es correcto salvo en un caso imposible en la práctica
  (1000 pendientes de un solo paciente).
- Todo lo de §«Lo que no entra» del contrato.

---

## Resumen (para el gate)

1. **Qué se construye:**
   - una lectura acotada y declarada (`leerPendientes`: 8 columnas, `range(0, 999)`, `count: 'exact'`, `recortada`) y una de nombres en tandas de 100;
   - un módulo puro que agrupa, ordena, resume (D7) y da destino (D8);
   - una fila de paciente cliente con desplegable;
   - el panel con 6 pacientes y el pie «Ver todos»;
   - la página `/agenda/documentacion` paginada de 20, con filtros de tipo y nivel;
   - un buscador por Server Action cuyo término no sale de Next.
2. **Decisión 1:** `AlertaPendiente` conserva su nombre porque `bloques.ts` (T-047) lo importa; la función pasa a `leerPendientes` y las pruebas por rol solo cambian el nombre del mock.
3. **Decisión 2:** el foco tras resolver se decide cuando la alerta resuelta **desaparece de las props** (la revalidación ha llegado), por `id` de DOM: el nombre del paciente, el siguiente (o el último si era el último) o el encabezado. Hay un `eraUltimo` para la redirección de `?pagina`.
4. **Decisión 3:** la acción del buscador valida con Zod antes de la sesión, deriva el recorte de `cargarContexto` y `criterioDocumentacion`, no lee del `FormData` nada más que `termino`, `tipo` y `nivel`, y compara en memoria; el cliente relanza con el `FormData` guardado.
5. **P1, cerrada por el orquestador el 06-10-2026** (se comunica al propietario, que puede cambiarla): el resumen D7 sigue el orden del enum, «3 notas · 1 consentimiento · 2 informes — el más antiguo, hace 12 días».
6. **Revisar con más cuidado (1):** que el doble de PostgREST registre todas las llamadas (si no, D10b y el criterio 10 pasan por el motivo equivocado).
7. **Revisar con más cuidado (2):** que la prueba del criterio 9 falle si se enfoca antes del `rerender`.
8. **Revisar con más cuidado (3):** que `documentacion.test.tsx:26-60` solo cambie el identificador.
9. **Revisar con más cuidado (4):** que `tiposConsultados` devuelva `[]` y nunca el tipo pedido fuera de la lista blanca.
10. **Fuera de territorio:** ningún fichero de T-047 se toca. El esqueleto que late en `/agenda` (`EsqueletoLista` con `animate-pulse`) queda como hallazgo para `docs/state.md` (§1.14).

---

## Ronda 3 (06-10-2026)

Anexo de riesgo medio que cierra R2-H1 a R2-H4 de `tickets/T-048/revision.md`. Se ha leído la
implementación vigente en la rama `worktree-agent-afd4c4801e9671c9e` (HEAD `3108602`) sin
modificarla. Lo que este anexo dice **prevalece** sobre las secciones anteriores donde choque, y
la «Fe de erratas» de abajo lo enumera.

### R3.0 · Hechos verificados contra el código

| Hecho | Dónde |
|---|---|
| Cada segmento se envuelve en `ErrorBoundary > LoadingBoundary > HTTPAccessFallbackBoundary > RedirectBoundary > InnerLayoutRouter`. La página tiene **su propio** `RedirectBoundary`, por debajo de cualquier `layout.tsx` del mismo nivel. | `node_modules/next/dist/client/components/layout-router.js:619-650` |
| `RedirectErrorBoundary.getDerivedStateFromError` captura el error de redirección y **sustituye a los hijos** por `HandleRedirect`. Este hace `router.replace`/`push` dentro de `startTransition` y luego `reset()`. Los hijos se **desmontan** y vuelven a montarse desde cero, aunque la clave del segmento no cambie. La clave sin parámetros (`:549`) solo conserva el estado en una navegación normal, no a través de este límite. | `node_modules/next/dist/client/components/redirect-boundary.js:30-39, :57-90` |
| La redirección de `?pagina` se lanza al pintar `ContenidoDocumentacion` (`if (p.pagina > pag.ultima) redirect(...)`), detrás del `<Suspense>` de la página. No la lanza la acción. `action-handler.js` solo convierte en `x-action-redirect` la que lanza la propia acción. La de `contenido.tsx` viaja como error en el flujo RSC y la captura el `RedirectBoundary` de la página. | worktree `app/(app)/agenda/documentacion/contenido.tsx:87-88`, `page.tsx:32-34`; `node_modules/next/dist/server/app-render/action-handler.js:889-900` |
| Segundo desmontaje, independiente del primero: `Buscador` devuelve `<BuscadorInterno key={tipo|nivel|pagina}>`, y la lista (con su `ProveedorResolucion`) le llega como `children`. Pasar de `pagina=3` a `pagina=2` remonta la lista aunque no hubiera límite. | worktree `documentacion/buscador.tsx:38`, `contenido.tsx:153` |
| `pendiente`, `anuncio` y `enfocar` son estado de `ProveedorResolucion`, y la región `[data-estado-bloque]` se pinta dentro de él. Ambos se pierden en los dos desmontajes. | worktree `app/(app)/agenda/resolver-alerta.tsx:69-71, :116-121` |
| El `h2#documentacion-titulo` (`ID_TITULO`) está en `page.tsx`, dentro del segmento de página, y también se remonta. Como destino del foco sirve igual (se busca por `id` después del commit), pero no puede alojar estado. | worktree `documentacion/page.tsx:23-29`, `parametros.ts:14` |
| Con `cacheComponents: true`, cada segmento va además dentro de un `<Activity>` por clave de estado. Al salir de la ruta, el segmento queda **oculto con su estado** (hasta 3 rutas), y los efectos se limpian al ocultarlo y se repiten al volver. La guía oficial recomienda reiniciar el estado transitorio en la limpieza de un `useLayoutEffect`. | `layout-router.js:684-688`; `next.config.ts:20`; `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md:13-35` |
| Un `layout.tsx` no se vuelve a pintar al navegar y no recibe `searchParams`. | `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md:154, :180` |
| No hay `layout.tsx` en `app/(app)/agenda/` ni en `app/(app)/agenda/documentacion/`. | `ls` del worktree |
| `useRouter()` (que usa `HandleRedirect`) lee `AppRouterContext` y lanza un invariante si es nulo. `AppRouterContext` se exporta desde `next/dist/shared/lib/app-router-context.shared-runtime`, que es el mismo fichero que requiere `navigation.js`. `redirect(url)` sin tipo queda en `'replace'` fuera de una acción. | `redirect-boundary.js:27, :31, :94`; `node_modules/next/dist/client/components/redirect.js:51-52` |
| React 19.2.8 exporta `Activity`. La versión de `@testing-library/user-event` es 14.6.6 (ya en uso en `app/(app)/agenda/calendario.test.tsx`). La de `@playwright/test` es 1.56.1. | `node_modules/react/package.json`, `package.json:43` |
| El spec, al desplegar, hace `boton.focus(); keyboard.press('Enter')`. No hay Tab hasta el botón ni Espacio. | worktree `accesibilidad/documentacion-pendiente.spec.ts:131-132` |
| El spec solo mide alto y borde derecho del botón (`:124-126`) y de los enlaces de pendiente (`:137-141`). El enlace de nombre no se mide. | ídem |
| `pendientes-fila.test.tsx` abre y cierra solo con `fireEvent.click`. | worktree `app/(app)/agenda/pendientes-fila.test.tsx:115-129` |
| `ENLACE` lleva `inline-flex min-h-11` y **ningún ancho mínimo**. Lo comparten el nombre, los pendientes y «Ver todos». El botón `tamano="sm"` es `min-h-11 px-3`. | worktree `pendientes-fila.tsx:15, :76, :80-82`; `components/ui/button.tsx:19` |
| El nombre pintado es `[nombre, apellidos].join(' ')`. `apellidos` es `not null` y `length(trim) > 0`. | worktree `contenido.tsx:104`, `documentacion.tsx:92`; `supabase/migrations/20260822094547_esquema_base_organizacion_paciente_historia.sql:411` |
| Orden de pacientes: primero el nivel máximo, y el nivel nulo va detrás de cualquier nivel. Después, el pendiente más antiguo. Solo `nota_sin_firmar` abierta tiene nivel. | worktree `pendientes.ts:97-140`; `supabase/migrations/20261006120000_avisos_y_escalado.sql` (vista `alertas_documentacion_nivel`) |
| `escalar_notas_pendientes()` selecciona alertas `abierta`, `nota_sin_firmar` y `nivel_nota_pendiente(referencia_en, centro) = 3`. Inserta una `nota_pendiente_escalada` por administrador, idempotente por `(perfil_id, tipo, origen_tabla, origen_id)`. Corre cada 15 min y nunca cierra la notificación. Los informes no los lee. | `20261006120000_avisos_y_escalado.sql` §G y §H; índice en `:21` |
| **La siembra ya produce escalados**: las seis notas de Lucía, de Ana, abiertas por el disparador con `referencia_en = citas.fin` de martes pasados, y la de Iván, de hace 35 días. El fixture del spec añade **una** notificación más por administrador y por `db reset`, no una por pasada. | `supabase/seed-completo.sql:480-491, :540-563` |
| `fn_proteger_notificacion` solo deja cambiar `leida_en`, de nulo a `now()`. | `20261006120000_avisos_y_escalado.sql:24-58` |
| Hay un índice único de alerta abierta sobre `(origen_tabla, origen_id, tipo)`, y el `where not exists` del spec compara solo `origen_id`. Si una nota vieja del fixture sigue abierta con `origen_id …000`, el informe nuevo con ese mismo `origen_id` no entra. | `20260822094547_…:880-882`; spec `:58-60` |
| `~/.claude/pipeline/territorio.mjs:26` exige que no haya nada tras `territorio:`. Con el comentario en la misma línea respondía «T-048: sin territorio declarado, nada que comprobar» (salida real, antes de corregir el contrato). | `node ~/.claude/pipeline/territorio.mjs T-048` |

### R3.1 · Fe de erratas de este diseño

- **§0, fila de `layout-router.js:549`.** La conclusión «una redirección de `?pagina=3` a
  `?pagina=2` no desmonta `ProveedorResolucion`» es **falsa**. La clave sin parámetros es cierta,
  pero el `RedirectBoundary` de la página remonta el subárbol, y además la `key` de `Buscador`
  incluye `pagina` (R3.0).
- **§1.5, último párrafo.** «Sin desmontar el proveedor» se sustituye por R3.2. `eraUltimo` se
  mantiene, pero vive en una memoria por encima del límite.
- **§4, riesgo 4.** Se sustituye por los riesgos 1 a 4 de R3.6. La mención a la «meta tag» vale
  para la carga inicial del documento, no para la revalidación tras una acción, que es el caso
  de este criterio.
- **§1.5, reglas 1 a 6 y render.** La decisión pasa de la fase de render a un efecto, la región
  de estado sale del proveedor, y hay una regla nueva (prefijo ajeno). Todo está en R3.2.

### R3.2 · R2-H1: el foco y el anuncio sobreviven al remontaje

**Idea.** El estado que tiene que cruzar la redirección (qué se acaba de resolver y qué se
anuncia) y la región `role="status"` suben a una **memoria** montada en un `layout.tsx` propio de
`/agenda/documentacion`. Ese layout queda por encima del `RedirectBoundary` de la página y fuera
de la `key` de `Buscador`. El proveedor que se monte después del remontaje lee de la memoria y
decide.

#### a) `app/(app)/agenda/resolver-alerta.tsx` (modificar)

Tipos y piezas nuevas, todas exportadas:

```ts
export type Pendiente = {
  alertaId: string;
  pacienteId: string;
  prefijo: Prefijo;      // el bloque donde se resolvió
  indice: number;        // su posición en lo pintado al acertar (>= 0)
  eraUltimo: boolean;
};

/** Puro. null = la alerta sigue pintada: esperar. */
export function decidirDestino(
  p: Pendiente,
  bloque: { prefijo: Prefijo; encabezadoId: string; pacientes: readonly PacienteEnFoco[] },
): { id: string; texto: string } | null;

export function MemoriaResolucion({ children }: { children: ReactNode }): ReactNode;
export function useDescartarResolucion(): () => void;   // sin memoria → función vacía
```

**`decidirDestino`** aplica las reglas en este orden, y el orden es parte del contrato:

1. Si algún `pacientes[i].alertas` contiene `p.alertaId`, devuelve `null`.
2. Sea `base = t('agenda.documentacion.resuelta')`.
3. Si el paciente `p.pacienteId` está en `pacientes`, devuelve
   `{ id: idEnlacePaciente(bloque.prefijo, p.pacienteId), texto: base + ' ' + paciente.anuncio }`.
   Se usa el prefijo **del bloque**, no el del pendiente.
4. Si `pacientes` está vacío, devuelve `{ id: encabezadoId, texto: base }`.
5. Si `p.prefijo !== bloque.prefijo`, devuelve `{ id: encabezadoId, texto: base }`. Es una
   resolución hecha en la búsqueda y heredada por la lista tras la redirección: su `indice` no
   significa nada en otra lista.
6. Si no, el vecino: `p.eraUltimo ? pacientes[pacientes.length - 1] : pacientes[Math.min(p.indice, pacientes.length - 1)]`,
   devuelto como `{ id: idEnlacePaciente(bloque.prefijo, vecino.id), texto: base }`.

**`MemoriaResolucion`** (cliente) tiene:

- Estado `pendiente: Pendiente | null` y `anuncio: { texto: string; n: number }`.
- Un ref `ultimoCerrado: Pendiente | null`.
- Un contexto privado (`ContextoMemoria`) con un valor estable (`useMemo` / `useCallback`):
  `{ pendiente, anotar(p), cerrar(p, texto), descartar() }`.
  - `anotar(p)` hace `setPendiente(p)` con un objeto nuevo en cada llamada.
  - `cerrar(p, texto)` es **idempotente por identidad**: si `ultimoCerrado.current === p`, no
    hace nada. Si no, lo anota, hace `setPendiente(null)` y `setAnuncio(a => ({ texto, n: a.n + 1 }))`.
    En desarrollo, StrictMode repite el efecto que la llama, y sin esta guarda el anuncio
    saltaría dos veces.
  - `descartar()` hace `setPendiente(null)` y no anuncia nada.
- `useLayoutEffect(() => () => descartar(), [])`. Cuando Activity oculta la ruta (se navega a
  otra), el pendiente se tira. Al volver, nada roba el foco. Es el patrón de la guía
  `preserving-ui-state.md`.
- Este render, con la región **siempre montada**, una sola por memoria:
  `{children}<p role="status" aria-live="polite" aria-atomic="true" data-estado-bloque className="sr-only"><span key={anuncio.n}>{anuncio.texto || null}</span></p>`.

**`ProveedorResolucion`** mantiene la firma de hoy (`prefijo`, `encabezadoId`, `pacientes`,
`alAcertar?`, `children`):

- Lee `ContextoMemoria`. Si hay memoria, pinta `<BloqueResolucion {...props} />`. Si no la hay
  (el panel de `/agenda`, las pruebas existentes), pinta
  `<MemoriaResolucion><BloqueResolucion {...props} /></MemoriaResolucion>`. **No** se hace un
  `return` temprano antes de hooks: son dos componentes.
- `BloqueResolucion` (privado) conserva el ref `pacientesAhora`, actualizado en un efecto como hoy.
- `alResolver(r)` calcula `indice` y `eraUltimo` sobre `pacientesAhora.current` igual que hoy,
  llama a `memoria.anotar({ ...r, prefijo, indice: max(indice, 0), eraUltimo })` y después a
  `alAcertar?.()`.
- **Un efecto** con dependencias `[memoria.pendiente, pacientes, prefijo, encabezadoId, memoria.cerrar]`:
  - si no hay pendiente, sale;
  - calcula `d = decidirDestino(...)` y, si es `null`, sale;
  - hace `document.getElementById(d.id)?.focus()` y **después** `memoria.cerrar(pendiente, d.texto)`.
- Desaparecen el estado `enfocar` y el `setState` en fase de render.
- Render: `<ContextoResolucion.Provider value={{ alResolver }}><div data-bloque-pendientes>{children}</div></ContextoResolucion.Provider>`.
  Sin región dentro, sin `role` y sin `tabIndex`.
- `ResolverAlerta` no cambia.

**Invariante:** en la página, como mucho hay **un** `BloqueResolucion` montado bajo la memoria,
porque la búsqueda y la lista son ramas excluyentes (`buscador.tsx:152-198`). Si alguien
pintara dos a la vez, `cerrar` idempotente evita el doble anuncio, pero el foco lo decidiría el
primero que vea su pendiente. Por eso se anota en R3.9.

#### b) `app/(app)/agenda/documentacion/layout.tsx` (crear)

- Componente de servidor, **no `async`**, sin lecturas.
- `export default function LayoutDocumentacion({ children }: { children: ReactNode }) { return <MemoriaResolucion>{children}</MemoriaResolucion>; }`
- Nada más: ni marco, ni título, ni `Suspense`. No cambia el árbol visual. La región va
  `sr-only`, después del contenido.

#### c) `app/(app)/agenda/documentacion/buscador.tsx` (modificar)

- En `BuscadorInterno`, `const descartar = useDescartarResolucion();`.
- `limpiar()` llama a `descartar()` **antes** de `campo.current?.focus()`.
- `enviar(datos)` llama a `descartar()` después de validar.
- `relanzar` **no** descarta: es la continuación de la resolución.
- Por qué: si se pulsa «Limpiar búsqueda» con una resolución en vuelo, la lista que vuelve tiene
  otro prefijo y la regla 5 le llevaría el foco al encabezado, robándoselo al campo que
  `limpiar` acaba de enfocar.

#### d) Sin cambios

`contenido.tsx`, `page.tsx`, `documentacion.tsx` (el panel usa la memoria propia del
proveedor), `acciones-alertas.ts`. La `key` de `Buscador` **se queda**: con la memoria arriba, ya
no le cuesta el foco, y quitarla rompería D10 («cambiar de filtro o de página pierde la
búsqueda»).

#### e) Pruebas

**Nueva: `app/(app)/agenda/documentacion/remontaje.test.tsx`.** Reproduce el remontaje real, no
un `rerender`.

Arnés, de fuera a dentro, en el orden real de Next (layout > límite del segmento > página):

```
<AppRouterContext.Provider value={routerFalso}>       // next/dist/shared/lib/app-router-context.shared-runtime
  <MemoriaResolucion>                                  // lo que pinta documentacion/layout.tsx
    <RedirectBoundary>                                 // next/dist/client/components/redirect-boundary (el real)
      <PaginaFalsa />                                  // h2#ID_TITULO tabIndex=-1 + ContenidoFalso
    </RedirectBoundary>
  </MemoriaResolucion>
</AppRouterContext.Provider>
```

- **Datos.** `PaginaFalsa` lee un estado del arnés, `{ pagina, revalidada }`, que vive en un
  componente por encima de `AppRouterContext` y se expone a la prueba por un manejador del
  módulo de prueba.
  - Página 3: un solo paciente, `P21`, con una alerta.
  - Página 2: veinte pacientes, `P1` a `P20`.
- **`ContenidoFalso`.**
  - Si `pagina === 3 && revalidada`, llama a `redirect('/agenda/documentacion?pagina=2')` de
    `next/navigation` **durante el render**, como `contenido.tsx:87-88`.
  - Si no, pinta `<Buscador tipo={null} nivel={null} pagina={pagina}>` con una lista dentro:
    `<ProveedorResolucion prefijo="pagina" encabezadoId={ID_TITULO} pacientes=…>`, y por
    paciente un `<a id={idEnlacePaciente('pagina', id)} href="#">` y un `<ResolverAlerta>` real.
  - Así se reproducen **los dos** desmontajes: el límite y la `key`.
- **`routerFalso`.** `{ replace, push, refresh, prefetch, back, forward }`. `replace` y `push` son
  `vi.fn((href) => fijarDatos({ pagina: 2, revalidada: true }))`.
- **Mocks.**
  - `vi.mock('../acciones-alertas')` con `resolverAlerta` en `{ ok: true }`.
  - `vi.mock('./acciones')` con `buscarPendientes`.
  - **No** se mockea `next/navigation`: hacen falta los `redirect` y `unstable_rethrow` reales.
  - `console.error` espiado y silenciado, porque React registra el error capturado.

**Caso 1. «el último de la última página: tras la redirección real, foco al último de la
página 2 y anuncio en el mismo nodo»:**

1. Pintar, con `pagina: 3`.
2. Pulsar «Marcar como resuelta» de `P21` con `userEvent` y esperar a que el botón deje de
   estar `aria-disabled`.
3. Guardar `h2Antes = getElementById(ID_TITULO)` y
   `regionAntes = querySelector('[data-estado-bloque]')`.
4. `act(() => revalidar())`, que fija `revalidada: true`.
5. `await waitFor`:
   - `document.activeElement.id === idEnlacePaciente('pagina', 'P20')`.
6. Aserciones:
   - `routerFalso.replace` (o `push`) se llamó una vez con `'/agenda/documentacion?pagina=2'`;
   - **`getElementById(ID_TITULO) !== h2Antes`**: prueba que el remontaje ocurrió. Si alguien
     cambia el arnés por un `rerender`, esta aserción cae;
   - **`querySelector('[data-estado-bloque]') === regionAntes`**, y su texto contiene
     «Marcada como resuelta.»;
   - hay una sola `[data-estado-bloque]` en el documento.

**Caso 2. «resuelta desde la búsqueda y redirigida: foco al encabezado, anuncio en el mismo
nodo»:**

- Igual que el caso 1, pero antes de resolver se busca.
- Se escribe un término válido y se envía, y `buscarPendientes` devuelve un grupo `P21`. Se
  reutilizan los grupos presentados de `buscador.test.tsx`.
- Se despliega la fila con el teclado y se resuelve. Tras `revalidar()`:
  - el foco está en `#documentacion-titulo`;
  - la región es la misma y contiene «Marcada como resuelta.»;
  - `P20` **no** tiene el foco.

**Caso 3, gemelo de control. «sin redirección (la página sigue teniendo pacientes): el foco va
al vecino de su índice».**

- Página 3 con `P21` y `P22`. Se resuelve `P21`.
- La revalidación deja `P22` sin redirigir (no hay `redirect`).
- El foco va a `P22` y `replace` no se llama.
- Demuestra que la regla de `eraUltimo` no tapa el caso normal.

**Mutantes que la prueba debe matar**, y por qué falla cada uno:

| Mutante | Falla en |
|---|---|
| El estado vuelve a `ProveedorResolucion` (la ronda 2 tal cual) | Caso 1, paso 5. Tras el remontaje no hay pendiente y el foco queda en `body`. |
| La memoria se monta en `page.tsx`, en `Tarjeta` o dentro de `Buscador` | Caso 1, paso 5. Esas piezas se remontan con el límite. |
| La región se queda dentro del proveedor | Caso 1, identidad de `regionAntes`. Es un nodo nuevo, y una región que nace con contenido no se anuncia. |
| `eraUltimo` se sustituye por `min(indice)` | Caso 1. El foco iría a `P1`. |
| Se quita la regla 5 (prefijo ajeno) | Caso 2. El foco iría a `P20`. |
| Se decide al acertar y no cuando la alerta desaparece | Casos 1 y 3. El destino se calcularía con la lista vieja. |

**Ampliar `app/(app)/agenda/resolver-alerta.test.tsx`:**

- `it.each` sobre `decidirDestino`, cubriendo:
  - alerta aún pintada → `null`;
  - paciente presente con prefijo propio y con prefijo ajeno → su enlace con el prefijo del
    bloque, y el texto con su anuncio;
  - lista vacía → encabezado;
  - prefijo ajeno y paciente ausente → encabezado;
  - `eraUltimo` y `min(indice)`, cada uno con su gemelo.
- «La memoria oculta por `Activity` tira el pendiente».
  - Arnés: `<Activity mode={modo}><MemoriaResolucion><ProveedorResolucion …>` de `react`.
  - Pasos: se resuelve (ok), se pasa a `hidden` **antes** de que cambie la lista, se cambia la
    lista (la alerta ya no está) y se vuelve a `visible`.
  - Se espera que el foco siga donde estaba y que la región no anuncie nada nuevo.
  - Mutante: sin el `useLayoutEffect` de limpieza, el efecto del bloque se repite al volver y
    roba el foco.
- «`cerrar` es idempotente».
  - Llamarlo dos veces con el mismo `Pendiente` incrementa `n` una sola vez: la `key` del
    `span` cambia una vez.
- Los casos de `:217` y `:229` («(b) era el último y la lista nueva es otra más larga (otra
  página)» y su gemelo) se **renombran**: prueban la regla de `eraUltimo` con un `rerender`,
  no la redirección. El título nuevo cita `documentacion/remontaje.test.tsx` como evidencia de
  la redirección. Siguen pasando sin cambiar su cuerpo, porque el proveedor sin memoria crea
  la suya.
- Si alguna aserción busca `[data-estado-bloque]` **dentro** de `[data-bloque-pendientes]`,
  pasa a buscarla en el contenedor de la prueba: la región es ahora hermana del bloque.

**Ampliar `app/(app)/agenda/documentacion/buscador.test.tsx`.** Un caso «Limpiar búsqueda
con una resolución en vuelo no roba el foco del campo»:

- Arnés: `<MemoriaResolucion>` + `h2#ID_TITULO` + `<Buscador>`, con la lista hija envuelta en
  un `ProveedorResolucion prefijo="pagina"`.
- Pasos:
  - se busca;
  - se resuelve un resultado, y la segunda llamada a `buscarPendientes`, la de `relanzar`,
    devuelve una promesa que no se resuelve;
  - se pulsa «Limpiar búsqueda».
- Esperado: tras vaciar efectos, `document.activeElement` es el campo.
- Mutante: sin `descartar()` en `limpiar`, el foco va al `h2`.
- Gemelo con `enviar` (una búsqueda nueva en vez de limpiar): el foco no va al `h2`.

### R3.3 · R2-H2: «Tab al botón, Espacio despliega», literal

**Playwright** (`accesibilidad/documentacion-pendiente.spec.ts`, prueba 1). Se sustituyen las
líneas `:131-132` por este recorrido:

1. `await enlacePaciente.focus();` El ancla es el enlace del nombre, que en el DOM va justo
   antes del botón (`pendientes-fila.tsx:76-82`).
2. `await page.keyboard.press('Tab');` y `await expect(boton).toBeFocused();`
3. `await page.keyboard.press('Space');` y después:
   - `await expect(boton).toHaveAttribute('aria-expanded', 'true');`
   - `await expect(lista).toBeVisible();`
   - `await expect(boton).toBeFocused();`
4. Sigue el bucle de Tab que ya existe (`:148-156`) hasta «Marcar como resuelta», luego
   `Enter`, y las aserciones del foco y el anuncio (`:158-163`).
5. **Nadie** llama a `boton.focus()` ni a `boton.click()` en esta prueba.

**jsdom** (`app/(app)/agenda/pendientes-fila.test.tsx`).

- El caso de `:115-129` se renombra a «abre y cierra con el clic» y se queda como está.
- Caso nuevo: «Tab desde el nombre llega al botón; Intro abre y Espacio cierra y vuelve a
  abrir (`userEvent.keyboard`)».
  1. `const user = userEvent.setup();` y pintar con `modo="desplegable"`.
  2. Enfocar el enlace del nombre (`getByRole('link', { name: 'Ana López' })`) y hacer
     `await user.tab()`. Se espera `document.activeElement === boton`.
  3. `await user.keyboard('{Enter}')`:
     - `aria-expanded="true"`;
     - la lista sin `hidden`;
     - el foco en el botón.
  4. `await user.keyboard(' ')`:
     - `aria-expanded="false"`;
     - la lista con `hidden`.
  5. `await user.keyboard(' ')` otra vez:
     - `aria-expanded="true"`.
- Caso nuevo: «dos filas abiertas a la vez». Se abren dos filas con el teclado y las dos
  quedan `aria-expanded="true"`. Es el criterio 3: no es un acordeón.

**Mutantes que matan**, y por qué:

| Mutante | Falla en |
|---|---|
| `<div role="button" tabIndex={-1} onClick={…}>` | Paso 2 de jsdom y paso 2 de Playwright. Tab no se detiene en él. |
| `<div role="button" tabIndex={0} onClick={…}>` | Pasos 3 a 5 de jsdom y paso 3 de Playwright. Ni `user-event` ni el navegador convierten Intro o Espacio en `click` sobre un `div`. |
| `<div role="button" tabIndex={0} onKeyDown={Intro → toggle}>` | Paso 4 de jsdom y paso 3 de Playwright. Espacio no hace nada. |
| `<button>` con `onKeyDown` que hace `preventDefault` de Espacio | Paso 4 de jsdom. |

### R3.4 · R2-H3: 44 × 44 en el nombre y en el botón

**Hechos.** `ENLACE` no tiene ancho mínimo (R3.0). Un nombre corto pinta una caja más estrecha
que 44 px. La regla es «44 px de objetivo táctil en todo lo que se pulse»
(`docs/interfaz.md:242, :275`; ADR-044, ADR-041), y el criterio 12 la pide para el enlace de
nombre y para el botón.

**Arreglo** (`app/(app)/agenda/pendientes-fila.tsx`).

- Se añade `min-w-11` a `ENLACE`.
- Crece la caja pulsable, no el relleno visual. El texto sigue alineado a la izquierda (sin
  `justify-center`), así que la columna de nombres no se desalinea.
- Al ser compartida, cubre también los enlaces de pendiente y «Ver todos», que el criterio 12
  también nombra.
- El botón `sm` no necesita cambio: `px-3`, la insignia y el chevron ya pasan de 44. Si la
  medida dijera lo contrario, se añade `className="min-w-11"` en ese `<Button>` y en ningún otro.

**Fixture** (spec, `PREPARAR`).

- Se añade un paciente 22: `id a0480000-0000-4000-8000-000000000021`, `nombre 'Il'`,
  `apellidos 'Z'`. Se pinta «Il Z», unos 25 px a `text-sm`.
- Tiene un `informe_pendiente`, con `origen_id b0480000-0000-4000-8000-000000000121` y
  `fecha_referencia current_date - 999`.
- La marca de limpieza es el prefijo de `id`/`origen_id`, no el nombre, así que `LIMPIAR` ya lo
  cubre.
- **No** contiene «zzmarca»: la prueba 3 sigue esperando 21 coincidencias y «Hay 21 …», y no se
  toca.
- Cae justo detrás de `PRIMERO` en el orden (nivel nulo, segundo pendiente más antiguo), dentro
  de los 6 del panel y de la página 1.
- El comentario de cabecera del spec (`:13-17`) pasa a decir:
  - 22 pacientes;
  - solo informes;
  - uno de nombre corto, que existe para medir 44 px.

**Medidas** (spec).

- Prueba 1:
  - `mide44(enlacePaciente, 'el nombre del paciente')`;
  - `mide44(panel.locator('#panel-paciente-a0480000-0000-4000-8000-000000000021'), 'un nombre corto')`;
  - `mide44(boton, 'el desplegable')` en lugar de `:124-126`;
  - y en el bucle de `:137-141`, `mide44(enlace, 'un enlace de pendiente')`.
- Prueba 2, en la página:
  - `mide44(page.locator('#pagina-paciente-a0480000-0000-4000-8000-000000000021'), 'un nombre corto en la página')`.
- Mutante: quitar `min-w-11` hace que «Il Z» falle con «… es más estrecho que 44 px».

### R3.5 · R2-H4: el fixture no alimenta al escalado

**Decisión.** El fixture deja de tener **notas**: las 13 alertas de `PRIMERO` son
`informe_pendiente` con `origen_tabla 'informes'`. Desaparece el `update … referencia_en` de
`:71-74`. El cron solo lee `nota_sin_firmar` de nivel 3 (R3.0), así que ninguna fila del
fixture puede generar una notificación, ni durante la pasada ni si `afterAll` no llega a
correr. Es la única opción que no deja nada permanente. Una limpieza posterior siempre llega
tarde a una carrera con el cron.

**`PREPARAR`, en este orden, dentro del mismo `do $$`.**

0. Se cierra una nota vieja del fixture si quedó abierta por una pasada interrumpida de la
   ronda 2. Si no se cierra, bloquea el informe nuevo con su mismo `origen_id` (R3.0) y sigue
   escalando:
   `update public.alertas_documentacion set estado = 'resuelta', resuelta_en = now() where estado = 'abierta' and tipo = 'nota_sin_firmar' and origen_id::text like 'b0480000-0000-4000-8000-%';`
   - Es la misma transición que `LIMPIAR`, no es `DELETE`, y la tabla no es de las protegidas.
1. Se neutralizan las notificaciones que ya dejaron las pasadas de la ronda 2, que son como
   mucho una por administrador:
   `update public.notificaciones set leida_en = now() where leida_en is null and tipo = 'nota_pendiente_escalada' and origen_tabla = 'notas_clinicas' and origen_id = 'b0480000-0000-4000-8000-000000000000';`
   - `fn_proteger_notificacion` lo permite, porque solo cambia `leida_en` y lo fija la base.
   - No se borra nada.
2. Pacientes 0 a 21 (R3.4) y alertas: todas `informe_pendiente`.
   - `PRIMERO`: `fecha_referencia current_date - 1000`.
   - Nombre corto: `current_date - 999`.
   - Resto: `current_date - 5`.

**Consecuencia en la prueba 1.** `PRIMERO` deja de ser el primero: delante van los pacientes de
Ana con notas sin firmar (en la siembra, Lucía). Sigue entre los 6 del panel.

- El comentario de `:118` cambia a «entre los seis primeros: sin nivel, es el pendiente más
  antiguo».
- `await expect(enlacePaciente, 'PRIMERO no está en el panel: Ana tiene más de cuatro pacientes con notas sin firmar abiertas').toBeVisible()`
  deja el fallo legible si otra prueba siembra notas.
- Tras resolver el primero, siguen saliendo «12 pendientes».

**Lo que se pierde.** El spec ya no pinta un paciente de nivel 3. El criterio 12 no lo pide.
El criterio 5 lo cubre en jsdom (`pendientes-fila.test.tsx`, «la píldora de urgencia…»), y el
paso manual de escala de grises lo tiene con Lucía, de la siembra. El enlace de filtro «Muy
atrasada» de la prueba 3 es estático y sigue funcionando. Pregunta P-R3-1.

### R3.6 · Riesgos, por probabilidad

1. **Media: dos copias del módulo de `AppRouterContext` en Vitest.** Si la prueba importa una
   instancia y `navigation.js` requiere otra, `HandleRedirect` lanza «invariant expected app
   router to be mounted». Hoy `next/link` y `react` ya comparten instancia en las pruebas
   existentes, y los dos ficheros son CJS externalizados. Si ocurre, es un **BLOQUEO**. No se
   sustituye el límite real por uno de juguete, y no se toca `vitest.config` (fuera de
   territorio).
2. **Media: la regla del compilador `react-hooks/set-state-in-effect` marca la llamada a
   `memoria.cerrar` desde el efecto.** No debería, porque no es un `setState` local. Si la marca,
   no se desactiva la regla: se informa y se para.
3. **Baja-media (ya existía): orden de microtareas entre el resultado de la acción y el árbol
   revalidado.** `alResolver` calcula `indice` con `pacientesAhora` y supone que el árbol nuevo
   aún no se ha aplicado (`server-action-reducer` resuelve antes de aplicar). El caso 3 de
   `remontaje.test.tsx` no lo prueba, porque el arnés serializa. Se deja anotado, y Playwright
   (prueba 1) es la red.
4. **Baja: pendiente heredado por una navegación manual en vuelo.** Si se pulsa «Página 1»
   entre el acierto y la revalidación, la memoria (que no se oculta, porque es la misma ruta)
   entrega el pendiente a la página 1, y el foco salta a su `min(indice)`. Hace falta un clic
   en una ventana de unos 100 ms. Se acepta y se anota en la bitácora. Distinguirlo de la
   redirección exigiría marcar la URL, y eso queda descartado en R3.7.
5. **Baja: `PRIMERO` fuera de los 6 del panel**, si otra prueba siembra notas para Ana. El
   `toBeVisible` con mensaje lo hace legible.
6. **Baja: React escribe el error de redirección capturado en `console.error`** durante
   `remontaje.test.tsx`. Se espía para que la salida quede limpia, y **no** se usa para
   aserciones.

### R3.7 · Decisiones y alternativas descartadas

- **Memoria en `documentacion/layout.tsx`.** Es la única pieza propia por encima del
  `RedirectBoundary` de la página y fuera de la `key` de `Buscador`.
- **Descartado: marcar la URL** (`?resuelta=…`). El contrato fija el estado de la URL en
  `pagina`/`tipo`/`nivel`/`paciente`. Además, el servidor no sabe que hubo una resolución, y
  ensucia el historial que D10 protege.
- **Descartado: `useId` estable.** El identificador sobrevive al remontaje, pero el estado no.
- **Descartado: variable de módulo.** Se filtra entre pruebas y entre pestañas del mismo
  proceso, y la región seguiría naciendo con contenido.
- **Descartado: quitar la `key` de `Buscador` o el `redirect()`.** El primero no basta, porque
  el límite remonta igual. El segundo lo exige el criterio 8.
- **Descartado: `sessionStorage`.** D9 no admite almacenamiento del navegador.
- **Decidir en un efecto y no en el render.** Fijar el estado de un ancestro durante el render
  de un hijo es un error de React. Además, el efecto corre después del commit, cuando los `id`
  de destino ya existen.
- **Prefijo ajeno → encabezado (regla 5).** El `indice` de una lista de búsqueda no señala nada
  en la lista paginada. Pregunta P-R3-2.
- **Fixture sin notas mejor que limpiar notificaciones después.** Lo que no se genera no hay que
  limpiarlo, y la carrera con el cron desaparece.
- **`min-w-11` en `ENLACE` y no en cada uso.** Una sola regla cubre los tres enlaces que nombra el
  criterio 12.

### R3.8 · Cómo se cierra cada hallazgo y criterio afectado

| Hallazgo o criterio | Evidencia |
|---|---|
| R2-H1 · criterio 9 (b) tras la redirección | `npm test -- "app/(app)/agenda/documentacion/remontaje.test.tsx"`: tres casos en verde. Pegar además la salida de cada mutante de la tabla de R3.2 e) en rojo, como mínimo «estado en el proveedor», «sin regla 5» y «`min(indice)`», revertidos después. |
| R2-H1 · Activity y limpiar | `npm test -- "app/(app)/agenda/resolver-alerta.test.tsx" "app/(app)/agenda/documentacion/buscador.test.tsx"` en verde, con el mutante «sin `useLayoutEffect`» en rojo. |
| R2-H2 · criterio 3 | `npm test -- "app/(app)/agenda/pendientes-fila.test.tsx"` en verde, y el mutante `div role=button tabIndex=0 onClick` en rojo en el caso nuevo. |
| R2-H2 y R2-H3 · criterio 12 | `npx playwright test accesibilidad/documentacion-pendiente.spec.ts` en verde, tras `npx supabase db reset && npm run seed`. Además, `rg -n "boton\.(focus|click)\(" accesibilidad/documentacion-pendiente.spec.ts` no devuelve nada. Mutante: sin `min-w-11`, la prueba 1 en rojo con «un nombre corto es más estrecho que 44 px». |
| R2-H4 | `rg -n "'nota_sin_firmar'|referencia_en" accesibilidad/documentacion-pendiente.spec.ts` solo devuelve el `update` de cierre del paso 0. Tras **dos** pasadas del spec, como postgres, `select count(*) from public.notificaciones where origen_id::text like 'b0480000-%' and leida_en is null` da `0`, y `select count(*) from public.alertas_documentacion where origen_id::text like 'b0480000-%' and estado = 'abierta'` también da `0`. |
| Nada se rompe | `npm test`, `npm run lint` y `npm run build` limpios. `node ~/.claude/pipeline/territorio.mjs T-048` desde la rama lista sus ficheros, todos dentro, y no dice «sin territorio declarado». |

### R3.9 · Qué revisar (ronda 3)

1. **Que `remontaje.test.tsx` use el `RedirectBoundary` real** de
   `next/dist/client/components/redirect-boundary` y un `redirect()` real lanzado en render.
   Comprobar que la aserción `h2 !== h2Antes` está, porque es la que impide que el arnés degenere
   en un `rerender`.
2. **Que la región `[data-estado-bloque]` sea una sola en la página** y viva en la memoria. Que el
   nodo sea el mismo antes y después, que su `span` cambie de `key` una vez por acierto (no dos
   con StrictMode) y que nunca nazca con texto.
3. **El orden de las reglas de `decidirDestino`.** «Paciente presente» va antes que «prefijo
   ajeno», y «lista vacía» antes que «prefijo ajeno». Cambiar el orden da un destino distinto en
   la búsqueda → lista. Revisar los `it.each` contra la lista de R3.2 a).
4. **Que `cerrar` compare por identidad del `Pendiente`**, no por `alertaId`. Dos aciertos
   seguidos sobre alertas distintas tienen que anunciar dos veces, y el mismo pendiente
   repetido por StrictMode, una.
5. **Puertas laterales del pendiente.**
   - `limpiar` y `enviar` descartan; `relanzar` no.
   - Ocultar la ruta (Activity) descarta.
   - Una navegación por la paginación **no** descarta (riesgo 4, aceptado).
   - Que nadie más llame a `descartar`.
6. **Que el panel siga igual.** `documentacion.tsx` no cambia, y su proveedor crea su propia
   memoria. La prueba 1 de Playwright sigue encontrando `[data-estado-bloque]` dentro de
   `section[aria-labelledby="agenda-documentacion"]`.
7. **`layout.tsx`.** No `async`, sin lecturas, sin `use cache`, y sin marcado visible más allá
   de la región `sr-only`. `rg -n "use cache"` del contrato sigue vacío.
8. **Spec.**
   - Ninguna `nota_sin_firmar` se inserta.
   - Ningún `DELETE` aparece.
   - El `update` de `notificaciones` solo toca `leida_en is null` del `origen_id` exacto del
     fixture viejo.
   - El paciente corto no contiene «zzmarca».
   - La prueba 3 conserva sus 21.
9. **`min-w-11` sin `justify-center`.** La columna de nombres no se desalinea a 360 px. Hay que
   mirarlo en la captura del spec o a mano.
10. **Que los casos renombrados de `resolver-alerta.test.tsx:217, :229` no se vendan como
    evidencia de la redirección.**

### R3.10 · Territorio

Ficheros nuevos:

- `app/(app)/agenda/documentacion/layout.tsx`
- `app/(app)/agenda/documentacion/remontaje.test.tsx`

Los cubre el glob `app/(app)/agenda/documentacion/**` que ya está en el contrato. El resto
(`resolver-alerta.tsx`/`.test.tsx`, `pendientes-fila.tsx`/`.test.tsx`, `buscador.tsx`/`.test.tsx`
y el spec) ya estaba dentro. **No hace falta ampliar el territorio.**

**Corrección hecha en el contrato** (`tickets/T-048-documentacion-pendiente-agrupada.md`,
cabecera):

- La línea `territorio:` llevaba un comentario en la misma línea y el script no la reconocía.
  Salía en verde sin comprobar nada (R3.0).
- El comentario pasa a la línea anterior y la clave queda sola: `territorio:`. La lista no cambia.
- Con eso, el script ya lee los 19 globs.
- **La rama de la ronda 3 tiene que partir de un `main` que incluya esta corrección y este
  anexo**: la copia del contrato en la rama de la ronda 2 conserva la línea vieja.

### R3.11 · Delegable

Nada. Todo es foco, ARIA, el ciclo de vida de React o datos de la base. La única línea de
pintura (`min-w-11`) no justifica un encargo.

### R3.12 · Preguntas para el propietario

- **P-R3-1.** ¿Se acepta que el spec de Playwright deje de pintar un paciente de nivel 3, para
  que el fixture no pueda alimentar al escalado?
  - El nivel 3 sigue probado en jsdom (criterio 5) y a mano con Lucía, de la siembra.
  - **Recomendación: sí.** La alternativa (una nota de nivel 3 y una limpieza posterior)
    siempre pierde la carrera con el cron de 15 min, y deja una notificación falsa en la
    bandeja del administrador hasta el siguiente `db reset`.
- **P-R3-2.** Si se resuelve algo desde la búsqueda y la revalidación redirige de página, la
  búsqueda se pierde (la `key` de D10) y el foco va al título de la página con el anuncio
  «Marcada como resuelta.».
  - **Recomendación: sí.** Llevarlo al «último paciente» de una lista que el usuario no estaba
    mirando le deja en un sitio que no eligió. El título es el punto de partida que el
    criterio 9 (c) ya usa.
- Ninguna de las dos bloquea. Si el propietario no contesta, se implementa la recomendación.

### Lo que no entra en la ronda 3, y por qué

- **Cerrar la notificación de escalado cuando la alerta se resuelve.** Es el comportamiento de
  `escalar_notas_pendientes` (T-015), no de esta pantalla. Si se quiere, va a `docs/state.md`
  como hallazgo, con su propio ticket y su migración.
- **Que la siembra escale a Lucía e Iván.** Es intencionado: la siembra simula el estado real.
- **Distinguir una navegación manual en vuelo de la redirección** (riesgo 4). Exigiría estado
  en la URL o un protocolo con el servidor que el contrato no autoriza.
- **Tocar `vitest.config` o simular el enrutador entero.** Si el `RedirectBoundary` real no
  carga, se para (riesgo 1).

### Resumen de la ronda 3 (para el gate)

1. **Qué se construye:**
   - una memoria de resolución (`MemoriaResolucion`) en un `layout.tsx` nuevo de
     `/agenda/documentacion`, que guarda el pendiente y la única región `role="status"` por
     encima del `RedirectBoundary` de la página y de la `key` de `Buscador`;
   - el proveedor decide el foco en un efecto con una función pura (`decidirDestino`).
2. **Decisión 1:** el estado sube al layout y no a la URL ni a un módulo. Es la única pieza que
   el límite de redirección y la `key` no remontan, y el panel de `/agenda` se crea su propia
   memoria sin cambiar.
3. **Decisión 2:** reglas en orden: esperar, paciente presente, lista vacía, prefijo ajeno →
   título, `eraUltimo` / `min(indice)`. `limpiar`, `enviar` y la ocultación por Activity
   descartan el pendiente; `cerrar` es idempotente frente a StrictMode.
4. **Decisión 3:** el fixture del spec pasa a ser solo de informes, así que el cron no tiene nada
   que escalar. Antes cierra la nota vieja y marca como leídas las notificaciones que dejó la
   ronda 2, sin `DELETE`.
5. **R2-H2:** Tab desde el nombre al botón y Espacio despliega, en Playwright; Intro, Espacio y
   Espacio con `userEvent` en jsdom. Matan los mutantes `div role=button`.
6. **R2-H3:** `min-w-11` en `ENLACE`, y un paciente «Il Z» para medir 44 × 44 en el panel y en la
   página.
7. **Corrección del contrato:** la línea `territorio:` tenía un comentario y el script no
   comprobaba nada. Ya lee los 19 globs, y la rama nueva debe partir de ese `main`.
8. **Revisar con más cuidado (1):** que `remontaje.test.tsx` use el `RedirectBoundary` real y
   compruebe que el `h2` cambió de nodo; si no, vuelve a ser un `rerender`.
9. **Revisar con más cuidado (2):** la región única y el mismo nodo antes y después, y el orden
   de las reglas de `decidirDestino`.
10. **Revisar con más cuidado (3):** las puertas del pendiente (`limpiar`, `enviar`, Activity,
    navegación manual aceptada), y que el spec no inserte ninguna nota ni borre nada.
