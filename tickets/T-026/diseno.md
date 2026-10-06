# T-026 · Diseño: proveedor de facturación (capa, adaptador, espejo mínimo y ajustes)

> Arquitecto, 05-10-2026. Contrato: `tickets/T-026-proveedor-facturacion-holded.md`.
> Dependencias: T-021, con su «## Ronda 2 (05-10-2026)», que manda; T-023, con el diseño cerrado.
> Migración: **`20261014120000_proveedor_facturacion.sql`**, que va después de 20261011120000 (T-021),
> 20261012120000 (T-043) y 20261013120000 (T-023).

## BLOQUEO parcial: qué se puede construir hoy y qué no

El contrato (`:33-52`) dice «No se empieza todavía» hasta tener dos cosas por escrito:
- las respuestas de Holded 1 a 4;
- la duda k.1.

El ADR-053, en (k) y en sus Consecuencias (`docs/decisions/ADR-053.md:89-117`), lo acota: lo que
bloquea es **el adaptador, no el esquema**. Literal: «Queda bloqueado: … arrancar el adaptador antes de
tener contestadas las dos preguntas de (k)».

A 05-10-2026 ninguna de las dos está contestada:
- `docs/legal/preguntas-holded.md` sigue en borrador;
- `docs/state.md:60` dice «Los envía el propietario tras revisión de asesor».

Este diseño separa las dos partes y pide al propietario que confirme el corte (**Q0**).

**T-026a, construible ya y sin una sola llamada de red a Holded:**
- el esquema completo;
- la interfaz `ProveedorFacturacion` y la proyección;
- el consumidor del outbox y el sincronizador, escritos contra la interfaz;
- el adaptador simulado, para las pruebas;
- el Vault, Ajustes y la ficha;
- el disparo periódico.

`holded.ts` existe, pero solo como esqueleto:
- tiene la constante `APPROVE_DOC = false` con su comentario;
- sus tres métodos lanzan `ErrorProveedor('no_disponible')`;
- su `FichaProveedor` dice `disponible: false`.

Con eso, el registro de proveedores no ofrece Holded en Ajustes y la app queda en modo degradado en
todas partes. Eso es exactamente el criterio manual 1.

**T-026b, cuando conteste Holded:**
- el cuerpo de los tres métodos de `holded.ts`, con las rutas, el JSON y los límites de peticiones;
- la traducción de sus estados a la situación cerrada de §1.2;
- qué errores son seguros de reintentar;
- el texto exacto de «sin plan de pago»;
- el enlace al borrador;
- los criterios manuales 2 y 3.

Si la respuesta de Holded obliga a cambiar la interfaz de §1.2, eso no se arregla en el adaptador: es
un hallazgo (contrato, `:197-198`).

Si el propietario no quiere partir, el diseño entero sigue valiendo, pero no se implementa nada hasta
tener las respuestas.

---

## 0 · Hechos verificados contra el código

| Hecho | Dónde | Efecto en el diseño |
|---|---|---|
| El outbox existe: `eventos_salientes(id, tipo, carga jsonb, estado {pendiente, entregado, fallido}, intentos smallint, ultimo_error text, proximo_intento, clave_idempotencia text unique, creado_en, actualizado_en, creado_por)`. Tiene RLS sin políticas, un índice parcial sobre los pendientes y un check de `tipo` con `^[a-z0-9_]+\.[a-z0-9_]+$` | `supabase/migrations/20260910120000…:48-75` | Se reutiliza (ADR-024 y contrato `:195`). La clave de idempotencia es `facturacion.enviar_borrador:<borrador_id>` |
| Sobre `eventos_salientes` solo tiene privilegios `postgres`: ni `authenticated` ni `service_role` | `information_schema.role_table_grants`, base local | Todo acceso desde Node pasa por funciones definer |
| `notificaciones` tiene `titulo`, `origen_tabla` y `origen_id`, y un índice único parcial `(perfil_id, tipo, origen_tabla, origen_id) where origen_id is not null` | `20261006120000:12-22` | Los avisos a los administradores se deduplican con `on conflict do nothing` |
| `fn_auditar(clave, columnas_omitidas…)` es genérica. `auditoria.registro_id` es `text` y `actor_id` admite nulo | `20260829150000:45-84`; columnas en la base local | Sirve tal cual para las tablas nuevas y para el ajuste, con clave `unico` |
| `pg_cron 1.6.4`, `pg_net 0.20.4` y `supabase_vault 0.3.1` están instalados. Ya hay un trabajo de cron (`escalar-notas-pendientes`, cada 15 minutos) | Base local; `20261006120000:500` | El disparo usa pg_cron y pg_net (Q3) |
| `net.http_post(url, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int)`, ejecutable por `postgres` | Base local | Firma de la llamada del cron |
| `vault.create_secret(new_secret, new_name, new_description, new_key_id)` y `vault.update_secret(secret_id, new_secret, new_name, new_description, new_key_id)` son definer. No existe `vault.delete_secret`, pero `postgres` puede hacer DELETE y SELECT sobre `vault.secrets` y leer `vault.decrypted_secrets` | Base local | La clave del cliente va al Vault desde una función definer cuyo dueño es `postgres` |
| T-021 (rama del worktree, por la Ronda 2): `borradores_factura(id, paciente_id, profesional_id, creado_por, creado_en)` no tiene capas y es destino de FK desde las versiones | `.claude/worktrees/agent-a19ecdb63f2c1e386/supabase/migrations/20261011120000_economico_esquema.sql` | Las tablas nuevas **pueden** llevar FK a la cabecera |
| `borradores_factura_versiones` es de solo adición, con capa 1 revocada también a `postgres` | Misma migración | Nada puede apuntarle con FK: `version_id` va sin FK y con disparador (contrato `:81-82`) |
| Las líneas de las versiones (`lineas jsonb`) traen `concepto`, `cantidad`, `precio_unitario_centimos`, `regimen_iva`, `tipo_iva_centesimas` y `cita_id`. La versión trae además `destinatario_nombre`, el NIF cifrado en cuatro columnas, `base`, `cuota_iva` y `total` (numeric(12,2), en euros), y `descartado` | Misma migración (sellado, `:295-345`) | La proyección es una lista blanca. `concepto` y `cita_id` no salen nunca |
| T-021 revoca todo a `service_role` en las tablas económicas | Misma migración | Las funciones definer devuelven los datos que el consumidor necesita, sin dar privilegios de tabla |
| `borradores_factura_estado` es una vista invoker con las columnas `borrador_id`, `ultima_version` y `estado ∈ {sin_enviar, descartado}` | Misma migración | Se redefine con `create or replace view`, con las mismas tres columnas en el mismo orden |
| Políticas de T-021. Cabecera: el administrador, o el profesional con `profesional_id = auth.uid()`. Cobros: las tres ramas; para el técnico, `paciente_id in (… centro_id in (select public.centros_actuales()))` | Misma migración | La RLS de las tablas nuevas cuelga de la cabecera. La vista del técnico copia la rama de cobros |
| Disparadores BEFORE de las versiones: `sellar_version_borrador` hace primero los permisos (paso 0) | Misma migración, `:331-345` | El disparador de congelación se llama `sellar_version_borrador_tras_envio`. Por orden alfabético va **después** del sellado, así que primero van los permisos y luego el cotejo |
| T-023 añade `validar_cobro` (invoker) y `grant insert (motivo)` sobre `cobros` | `tickets/T-023/diseno.md` | El disparador nuevo, `validar_cobro_factura_espejo`, se ordena después y no toca `motivo` |
| `regimen_iva` es un enum `('exento_sanitario','general')`. `lib/dinero` ofrece `Centimos`, `aCentimos`, `formatearImporte` y `TIPO_IVA_GENERAL = 21` | `lib/dinero/iva.ts`, `lib/dinero/importe.ts` | La interfaz trabaja en céntimos. La base guarda euros numeric(12,2), como T-021 |
| NIF: AES-GCM, `descifrar(clave, sobre)` y `claveDeCifrado()` (solo servidor, por RPC con lista blanca) | `lib/cifrado/aes-gcm.ts`, `claves.ts`, `bytea.ts` | El NIF se descifra en Node, en memoria, justo antes de proyectar. `clave_de_cifrado` no se toca |
| `zona_horaria_centro(uuid)` es definer y nunca devuelve nulo | Migraciones de T-014 | Para calcular la `fecha` del documento en hora local |
| Patrón de ruta: `connection()`, `Cache-Control: private, no-store` y `console.error` sin datos | `app/api/avisos/route.ts` | Lo copia la ruta de drenado |
| El proxy deja pasar sin sesión solo `['/login', '/prototipo']`, y su matcher cubre `/api/*` | `proxy.ts:10,59,124` | Hay que añadir `/api/facturacion/drenar` a las rutas públicas. Si no, pg_net recibe una redirección al login |
| Cliente de `service_role`: `crearClienteAdministracion()` | `lib/supabase/administracion.ts:39` | Lo usa el consumidor |
| Ajustes: el bloque `AccesosDeAdministracion` solo se pinta para el administrador. Patrón de página: `centros/page.tsx` (Suspense, `exigirSesion`, `estadoDeCuenta` y redirect si no es administrador) | `app/(app)/ajustes/page.tsx`, `app/(app)/ajustes/centros/page.tsx` | La página de Ajustes › Programa de facturación sigue ese patrón |
| Ficha: `facturacion={<Facturacion />}` es un estado vacío (`ficha.facturacionVacia`) | `app/(app)/pacientes/[id]/page.tsx:149-165` | Se sustituye por `PanelFacturacion`, con su propio Suspense |
| `t(clave)` no interpola: se usa `.replace('{programa}', …)`. Ya existe `sin-literales.test.ts` | `lib/i18n` | Todos los textos van a `lib/i18n/es.ts` |
| Vitest con jsdom y alias `server-only` → stub. Playwright con `testDir './accesibilidad'` y webServer `npm run start` | `vitest.config.ts`, `playwright.config.ts` | Pruebas de BD aparte (`*.bd.test.ts`). La prueba de la clave en el build, con Playwright |
| Bancos de RLS: 00-28 existen; T-021 usa el 26, T-043 el 29 y T-023 el 30 | `scripts/rls/` y diseños | El banco de T-026 es el **31** |
| `11-cobertura.sql` declara cada política en `v_declaradas` | `scripts/rls/11-cobertura.sql` | Hay que añadir las tres políticas nuevas |
| El linter tiene seis reglas: 1 (UPDATE, DELETE o TRUNCATE sobre una tabla de `TABLAS_SOLO_ADICION`), 2 (destructivo sin anunciar), 3 (`create table` sin `enable row level security` en el mismo fichero), 4 (definer sin `search_path`), 5 (nombres) y 6 (editar migraciones de `main`) | `scripts/lint-migraciones.ts` | La migración no tiene que disparar ninguna. `update eventos_salientes` y `update facturacion_ajuste` no están en la lista |
| No hay respuestas de Holded | `docs/legal/preguntas-holded.md:3` | BLOQUEO parcial, arriba |

---

## 1 · Piezas y contratos

### 1.1 Mapa

```
supabase/migrations/20261014120000_proveedor_facturacion.sql   (esquema, RLS, funciones, cron)
lib/facturacion/proveedor.ts      interfaz, tipos y ErrorProveedor        (sin red)
lib/facturacion/proyeccion.ts     proyectarBorrador(): función pura, lista blanca
lib/facturacion/conceptos.ts      concepto genérico por régimen (Q4)
lib/facturacion/registro.ts       proveedor activo → implementación (server-only)
lib/facturacion/holded.ts         ÚNICO fichero con «holded» en código TS; T-026a: esqueleto
lib/facturacion/simulado.ts       adaptador en memoria, solo para pruebas
lib/facturacion/clave.ts          leer la clave del Vault (server-only, sin caché)
lib/facturacion/cola.ts           drenarEnvios(): consumidor del outbox
lib/facturacion/sincronizador.ts  sincronizar(): espejo y anotaciones
lib/facturacion/*.test.ts         pruebas unitarias; cola.bd.test.ts contra la base local
app/api/facturacion/drenar/route.ts               POST que llama el cron
app/(app)/ajustes/facturacion/{page,formulario-clave,acciones,esquemas}.tsx|ts
app/(app)/ajustes/page.tsx                         enlace en AccesosDeAdministracion
app/(app)/pacientes/[id]/{panel-facturacion.tsx,acciones-facturacion.ts,page.tsx}
proxy.ts                                           /api/facturacion/drenar entre las públicas
lib/i18n/es.ts                                     claves facturacion.* y ajustes.facturacion.*
scripts/rls/31-proveedor-facturacion.sql (+00, 01, 11, README)
scripts/lint-migraciones.ts (+ .test.ts)            tres tablas nuevas en TABLAS_SOLO_ADICION
lib/supabase/tipos-bd.ts                            regenerado (npm run tipos)
vitest.config.ts, vitest.bd.config.ts, package.json (solo scripts)
accesibilidad/facturacion-clave.spec.ts
```

### 1.2 `lib/facturacion/proveedor.ts`: la interfaz (ADR-053 e)

```ts
export type IdProveedor = 'holded';            // = enum proveedor_facturacion
export type ConceptoGenerico = string;          // solo sale de conceptos.ts

export interface LineaProyectada {
  concepto: ConceptoGenerico;
  cantidad: number;                // entero > 0
  precioUnitarioCentimos: Centimos;
  regimenIva: RegimenIva;          // 'exento_sanitario' | 'general'
  tipoIvaCentesimas: number;       // 0 o 2100
}
export interface BorradorProyectado {
  destinatario: { nombre: string; nif: string | null };
  fecha: string;                   // 'YYYY-MM-DD', hora local del centro
  lineas: readonly LineaProyectada[];
}
export interface HechosDeExpedicion {        // ADR-077 punto 7, "al aprobarse"; ni un campo más
  numero: string;
  fechaExpedicion: string;         // 'YYYY-MM-DD'
  baseCentimos: Centimos;
  cuotaIvaCentimos: Centimos;
  totalCentimos: Centimos;
  enlace: string;                  // https://…
}
export type DocumentoObservado =
  | { documentoId: string; situacion: 'borrador' | 'borrado_sin_aprobar' }
  | { documentoId: string; situacion: 'aprobado' | 'rectificado' | 'anulado'; hechos: HechosDeExpedicion };

export interface ProveedorFacturacion {
  crearBorrador(b: BorradorProyectado): Promise<{ documentoId: string }>;
  consultarDocumento(documentoId: string): Promise<DocumentoObservado>;
  listarDocumentosDesde(desde: Date): Promise<readonly DocumentoObservado[]>;
}
export interface FichaProveedor {           // datos estáticos, no son operaciones
  id: IdProveedor;
  nombre: string;                  // «Holded»: el único sitio fuera de holded.ts es el registro, que lo importa
  disponible: boolean;             // T-026a: false
  enlaceDeBorrador(documentoId: string): string | null;  // T-026a: null
}

export type CodigoErrorProveedor =
  | 'red' | 'limite'                                   // reintentables: el documento NO se creó
  | 'no_autorizado' | 'sin_plan' | 'rechazado'         // permanentes
  | 'ambiguo'                                          // la petición salió y no sabemos si creó (Q5)
  | 'no_disponible';                                   // adaptador sin implementar (T-026a)
export class ErrorProveedor extends Error {
  readonly codigo: CodigoErrorProveedor;
  readonly reintentable: boolean;   // solo 'red' y 'limite'
  // El mensaje es FIJO por código. Nunca incluye el cuerpo, las cabeceras ni la URL con parámetros
  // de la respuesta del proveedor.
}
```

**Invariantes del tipo:**
- **No hay** `aprobar`, `expedir`, `emitir`, `anular`, `rectificar` ni `descargarPdf` (ADR-053 b,
  ADR-078 1).
- `DocumentoObservado` **no tiene** campo de estado de pago, de estado del programa ni de líneas. El
  ADR-077 queda impuesto por el compilador.
- Plan B (ADR-078 7): un adaptador de fichero implementaría `crearBorrador`, escribiendo el fichero, y
  devolvería `situacion: 'borrador'` para siempre. El dominio no cambia.
- `BorradorProyectado` **no lleva referencia** a nuestro `borrador_id` (Q5, opción recomendada).

### 1.3 `lib/facturacion/proyeccion.ts`

```ts
export const PROYECCION_VERSION = 1;   // se sube si cambia lo que sale (y se guarda en el envío)
export function proyectarBorrador(entrada: VersionParaProyectar, nifEnClaro: string | null): BorradorProyectado;
```

- `VersionParaProyectar` es el tipo de lo que devuelve `reclamar_envios_facturacion` (§1.5.4): ya viene
  sin `concepto` y sin `cita_id`.
- La función **construye un objeto nuevo campo a campo**. Prohibido el spread y prohibido
  `Object.assign` sobre la entrada.
- El concepto sale de `conceptoGenerico(regimenIva)`, en `conceptos.ts`:
  - `exento_sanitario` → «Sesión de psicología»;
  - `general` → «Servicios profesionales de psicología».
  - Q4.
- Comprueba que `lineas` no está vacío, que `cantidad` es un entero positivo y que
  `precioUnitarioCentimos` pasa `comprobarCentimos`. Si algo falla, lanza un `Error` con mensaje fijo.
  La cola lo trata como permanente con el código `rechazado`.
- Hay dos capas: la RPC SQL no devuelve ni `concepto` ni `cita_id`, y la función TS los ignoraría
  aunque llegaran. La prueba negativa ataca la capa TS con una entrada contaminada a propósito (§3,
  criterio 3).

### 1.4 Adaptadores

**`holded.ts` en T-026a:**

```ts
// ADR-053 (b) y aclaración 4 de la AEAT: la app nunca aprueba. Sin parámetro, sin ajuste, sin bandera.
const APPROVE_DOC = false as const;
export const fichaHolded: FichaProveedor = { id: 'holded', nombre: 'Holded', disponible: false, enlaceDeBorrador: () => null };
export function crearProveedorHolded(opciones: { clave: string; fetch?: typeof fetch }): ProveedorFacturacion
```

- En T-026a, los tres métodos lanzan `new ErrorProveedor('no_disponible')`. `APPROVE_DOC` se
  referencia, por ejemplo con `void APPROVE_DOC`, para que el lint no lo dé por muerto.
- En T-026b, todo `fetch` lleva `cache: 'no-store'` y usa el `fetch` inyectado.
- La clave va solo en la cabecera que Holded indique. Nunca en la URL, nunca en un mensaje de error y
  nunca en un `console.*`.

**`simulado.ts`:** se exporta `crearProveedorSimulado()`, que devuelve `{ proveedor, ficha, control }`.
- `control.caido(true)` → `crearBorrador`, `consultar` y `listar` lanzan `ErrorProveedor('red')`.
- `control.perderRespuesta()` → la siguiente `crearBorrador` crea el documento y lanza
  `ErrorProveedor('ambiguo')`.
- `control.aprobar(id, hechos)`, `borrar(id)`, `anular(id)` y `rectificar(id)` cambian la situación.
- `control.documentos()` devuelve el recuento y el contenido recibido, que sirve para la prueba
  negativa de proyección.
- `control.cambiarHechos(id, hechos)` sirve para la discrepancia.
- Ningún fichero fuera de `*.test.ts` lo importa. Hay una prueba que lo comprueba recorriendo `app/` y
  `lib/`.

**`registro.ts`** (server-only):

```ts
export const FICHAS: Record<IdProveedor, FichaProveedor>;           // { holded: fichaHolded }
export async function proveedorActivo(): Promise<{ ficha: FichaProveedor; crear: (clave: string) => ProveedorFacturacion } | null>;
```

- Lee `proveedor_facturacion_activo()` (§1.5.6) con la sesión del usuario.
- Devuelve `null` si no hay ninguno o si `!ficha.disponible`. Es el **único** interruptor del modo
  degradado.

### 1.5 Migración `20261014120000_proveedor_facturacion.sql`

Cabecera del fichero: un comentario con ADR-053, 077 y 078, la lista del ADR-077 punto 7 y la frase
«nada de lo que copia este fichero sale de esa lista».

#### 1.5.1 Tipos

```sql
create type public.proveedor_facturacion as enum ('holded');
create type public.anotacion_documento_proveedor as enum ('borrado_sin_aprobar', 'rectificado', 'anulado');
```

#### 1.5.2 Tablas de solo adición

Todas llevan:
- `enable row level security` en el mismo fichero;
- las tres capas: `revoke update, delete, truncate … from public, anon, authenticated, service_role, postgres`, el disparador `impedir_modificacion_<t>` (before update or delete, por fila, `fn_impedir_modificacion()`) y el disparador `impedir_truncado_<t>` (before truncate, por sentencia);
- `insert into public.tablas_solo_adicion`;
- `create trigger auditar_<t> after insert … fn_auditar('id')`;
- grants: `select` a `authenticated`, que pasa por la RLS, y ningún `insert` a nadie salvo a través de las funciones definer. Ningún grant a `service_role`.

**`borradores_factura_envios`**: el vínculo borrador → documento (ADR-077 punto 4).

```sql
create table public.borradores_factura_envios (
  id                     uuid primary key default gen_random_uuid(),
  borrador_id            uuid not null references public.borradores_factura(id),
  version_id             uuid not null,          -- sin FK: versiones es de solo adición
  numero_version         integer not null check (numero_version > 0),
  paciente_id            uuid not null references public.pacientes(id),   -- derivado de la cabecera
  proveedor              public.proveedor_facturacion not null,
  proveedor_documento_id text not null check (length(proveedor_documento_id) between 1 and 200),  -- lo único "al crear" (ADR-077 p.7)
  proyeccion_version     smallint not null check (proyeccion_version > 0),
  fecha_documento        date not null,          -- la que mandó la app
  evento_id              uuid not null,          -- sin FK: el outbox es mutable
  enviado_en             timestamptz not null default now(),
  unique (borrador_id),
  unique (proveedor, proveedor_documento_id)
);
```

- Disparador `validar_envio_borrador`, before insert, definer:
  - la versión existe → si no, 23503;
  - es del `borrador_id` y su `numero_version` coincide → si no, 23514;
  - `paciente_id` = el de la cabecera → si no, 23514.
- No guarda una huella de la proyección: sería un oráculo para adivinar el NIF.

**`facturas_espejo`** (ADR-077 punto 1):

```sql
create table public.facturas_espejo (
  id                     uuid primary key default gen_random_uuid(),
  borrador_id            uuid not null references public.borradores_factura(id),  -- de la app
  paciente_id            uuid not null references public.pacientes(id),           -- de la app, derivado
  proveedor              public.proveedor_facturacion not null,
  proveedor_documento_id text not null,
  numero                 text not null check (length(trim(numero)) between 1 and 60),
  fecha_expedicion       date not null,
  base                   numeric(12,2) not null,
  cuota_iva              numeric(12,2) not null check (cuota_iva >= 0),
  total                  numeric(12,2) not null,
  url_proveedor          text not null check (url_proveedor ~ '^https://' and length(url_proveedor) <= 2000),
  copiado_en             timestamptz not null default now(),                       -- de la app
  check (base + cuota_iva = total),
  unique (proveedor, proveedor_documento_id),
  unique (borrador_id)
);
```

- **No tiene** estado, cobros, PDF, QR, registro de facturación, huella, líneas ni destinatario.
- `base` y `total` admiten negativos: una rectificativa por diferencias. Pero no llegan aquí porque no
  salen de un borrador (ADR-077, Consecuencias), y aun así no se cierra la puerta.

**`facturas_anotaciones`** (ADR-077 punto 2):

```sql
create table public.facturas_anotaciones (
  id                     uuid primary key default gen_random_uuid(),
  borrador_id            uuid not null references public.borradores_factura(id),  -- derivado del envío
  proveedor              public.proveedor_facturacion not null,
  proveedor_documento_id text not null,
  tipo                   public.anotacion_documento_proveedor not null,
  observada_en           timestamptz not null default now(),                       -- de la app; no es parámetro
  unique (proveedor, proveedor_documento_id, tipo)
);
```

No tiene texto libre.

**Linter:** `TABLAS_SOLO_ADICION` gana las tres tablas, más los casos en `lint-migraciones.test.ts`.
La cabecera `borradores_factura` **no** se toca (§2, D9).

#### 1.5.3 Lectura (RLS) y vista del técnico

| Rol | Envíos, espejo, anotaciones (tablas) | `facturas_espejo_cabecera` | `borradores_factura_estado` |
|---|---|---|---|
| administrador | todo | todo | todo |
| profesional_sanitario | los de sus borradores (`profesional_id = auth.uid()`) | los de sus borradores | los suyos (RLS de la cabecera) |
| tecnico_administrativo | **nada** | los de pacientes de sus centros (`centros_actuales()`) | nada (la cabecera le da 0) |
| anon / service_role | nada | nada | nada |

- Las políticas `borradores_factura_envios_lectura`, `facturas_espejo_lectura` y
  `facturas_anotaciones_lectura` son `for select to authenticated using (exists (select 1 from
  public.borradores_factura b where b.id = borrador_id))`. Heredan la RLS de la cabecera, así que no
  repiten la regla y no pueden divergir de ella.
- La vista `facturas_espejo_cabecera` va con `security_invoker = false` y `security_barrier = true`:
  - columnas: `id`, `paciente_id`, `proveedor`, `numero`, `fecha_expedicion`, `base`, `cuota_iva`,
    `total`, `url_proveedor`, `copiado_en`;
  - sin `borrador_id`, sin `cita_id`, sin líneas y sin destinatario;
  - su `where` repite las tres ramas:
    - `rol_actual() = 'administrador'`;
    - `or (rol_actual() = 'profesional_sanitario' and exists (select 1 from borradores_factura b where b.id = e.borrador_id and b.profesional_id = auth.uid()))`;
    - `or (rol_actual() = 'tecnico_administrativo' and e.paciente_id in (select p.id from pacientes p where p.centro_id in (select centros_actuales())))`.
  - grants: `select` a `authenticated` y `revoke all … from anon, service_role`.

#### 1.5.4 Funciones `security definer` de `service_role`

Todas llevan `set search_path = ''`, `revoke execute … from public, anon, authenticated` y
`grant execute … to service_role`.

**`reclamar_envios_facturacion(p_limite int default 10) returns table(...)`**
- Selecciona eventos `tipo = 'facturacion.enviar_borrador'`, `estado = 'pendiente'` y
  `proximo_intento <= now()`, con `order by proximo_intento`, `for update skip locked` y `limit`.
- A cada uno le da una concesión: `proximo_intento = now() + interval '5 minutes'`,
  `intentos = intentos + 1` y `actualizado_en = now()`. Un consumidor que muera a mitad libera el
  evento a los 5 minutos.
- Por cada evento devuelve:
  - `evento_id`, `borrador_id`, `version_id` y `numero_version`, de la última versión no descartada en
    el momento del reclamo;
  - `destinatario_nombre`, las cuatro columnas del NIF cifrado y `version_clave`;
  - `lineas`, reconstruidas con `jsonb_agg(jsonb_build_object('cantidad',…,'precio_unitario_centimos',…,'regimen_iva',…,'tipo_iva_centesimas',…))`: **sin `concepto` ni `cita_id`**;
  - `fecha_documento`, que es `(now() at time zone zona_horaria_centro(coalesce(v.centro_id, pac.centro_id)))::date`;
  - `ya_enviado_documento_id`, que no es nulo si ya existe el envío. Es el caso de un consumidor que
    murió entre registrar y responder: la cola solo marca el evento como entregado.
- Si la última versión está descartada, marca el evento como `fallido` con
  `ultimo_error = 'descartado'` y no lo devuelve.

**`registrar_envio_borrador(p_evento_id uuid, p_proveedor proveedor_facturacion, p_documento_id text, p_proyeccion_version smallint, p_version_id uuid, p_fecha_documento date) returns uuid`**
- El evento debe existir y ser `facturacion.enviar_borrador`. Si no, 22023.
- Deriva `borrador_id` de la carga y `paciente_id` de la cabecera.
- `insert … on conflict do nothing`:
  - si ya existía con el mismo `(borrador_id, proveedor, documento)`, devuelve su id;
  - si existía con otro documento, 23505.
- En la misma transacción pone el evento en `entregado`.

**`registrar_fallo_envio_facturacion(p_evento_id uuid, p_codigo text, p_permanente boolean) returns void`**
- `p_codigo` pertenece a la lista cerrada de `CodigoErrorProveedor`. Si no, 22023, y en ningún caso se
  escribe texto libre en `ultimo_error`.
- Si `p_permanente` o `intentos >= 8`:
  - `estado = 'fallido'`;
  - una notificación a cada administrador activo, con
    `tipo 'facturacion_envio_fallido'`, `origen_tabla 'borradores_factura'`,
    `origen_id = borrador_id` y `on conflict do nothing`;
  - el detalle es un texto fijo por código, sin el nombre del paciente.
- Si no, `proximo_intento = now() + least(interval '1 minute' * 2 ^ intentos, interval '6 hours')`.

**`registrar_factura_espejo(p_proveedor, p_proveedor_documento_id text, p_numero text, p_fecha_expedicion date, p_base_centimos bigint, p_cuota_iva_centimos bigint, p_total_centimos bigint, p_url_proveedor text) returns uuid`**
1. Busca el envío por `(proveedor, documento)`. Si no lo hay, 23503 («no hay envío para ese
   documento»). El borrador y el paciente se **derivan**: el llamante no los elige.
2. Si existe una anotación `borrado_sin_aprobar` para ese documento, 23514.
3. Convierte los céntimos a `numeric(12,2)` dividiendo entre 100.
4. Hace `insert … on conflict do nothing returning id`.
5. Si no insertó, compara la fila existente columna a columna: `numero`, `fecha_expedicion`, `base`,
   `cuota_iva`, `total` y `url_proveedor`.
   - Si todo es igual, devuelve su `id`.
   - Si algo difiere, `raise … using errcode = '23505'`. **Nunca hay UPDATE.**

**`registrar_anotacion_documento(p_proveedor, p_proveedor_documento_id text, p_tipo anotacion_documento_proveedor) returns uuid`**
- Sin envío → 23503.
- Coherencia:
  - `borrado_sin_aprobar` con espejo → 23514;
  - `rectificado` o `anulado` sin espejo → 23514.
- Es idempotente por `(proveedor, documento, tipo)`: devuelve el id existente.

**`documentos_para_sincronizar(p_proveedor, p_ids text[] default null, p_limite int default 50) returns table(proveedor_documento_id text, tiene_espejo boolean, anotaciones anotacion_documento_proveedor[])`**
- Con `p_ids` nulo, devuelve los envíos sin espejo y sin `borrado_sin_aprobar`, los más antiguos
  primero.
- Con `p_ids`, devuelve solo los de esa lista que tengan envío.

**`notificar_discrepancia_facturacion(p_proveedor, p_proveedor_documento_id text) returns void`**
- Avisa a los administradores activos con `tipo 'facturacion_discrepancia'`,
  `origen_tabla 'facturas_espejo'` y `origen_id = espejo.id`, deduplicado.
- Es la forma de «escalar el hallazgo» (contrato `:121-122`). No toca el espejo.

**`avanzar_cursor_sincronizacion(p_hasta timestamptz) returns void`**
- Hace `sincronizado_hasta = greatest(sincronizado_hasta, p_hasta)`.

**`clave_proveedor_facturacion() returns text`**
- Lee `vault.decrypted_secrets` por el nombre `proveedor_facturacion_clave`.
- Devuelve nulo si no hay ninguna.

#### 1.5.5 `encolar_envio_borrador(p_borrador_id uuid) returns uuid`: definer, para `authenticated`

1. **Primero los permisos.** El llamante tiene que ser administrador, o
   `profesional_sanitario` con `b.profesional_id = auth.uid()` y `es_profesional_asignado(b.paciente_id)`.
   Si no lo es, o si el borrador no existe, **42501 con el mismo mensaje** en los dos casos: no hay
   oráculo de existencia.
2. Toma `select … for update` sobre la cabecera.
3. Si no hay proveedor configurado y disponible en `facturacion_ajuste`, 23514.
4. Si no hay versión, o la última está descartada, 23514.
5. Si ya hay envío, devuelve el `evento_id` del envío: no hace nada más.
6. Hace `insert into eventos_salientes (tipo, carga, clave_idempotencia, creado_por, proximo_intento)
   values ('facturacion.enviar_borrador', jsonb_build_object('borrador_id', p_borrador_id),
   'facturacion.enviar_borrador:' || p_borrador_id, auth.uid(), now()) on conflict (clave_idempotencia)
   do nothing`.
   - La carga **solo** lleva el id: los datos se leen al reclamar.
7. Si el evento ya existía en `fallido`: `estado = 'pendiente'`, `intentos = 0`,
   `proximo_intento = now()` y `ultimo_error = null`. Es el reenvío manual.
   - Si existía en `pendiente`, no se toca.
8. Devuelve el id del evento.

Grants: `revoke … from public, anon` y `grant execute … to authenticated`.

#### 1.5.6 Congelación del borrador enviado

Disparador `sellar_version_borrador_tras_envio`, before insert sobre `borradores_factura_versiones`,
definer:
- toma `for key share` sobre la cabecera;
- si existe envío, o un evento `pendiente` con su clave, lanza 23514: «el borrador ya se preparó en el
  programa: no admite versiones nuevas».
- Si el evento está `fallido`, deja pasar: el borrador se puede corregir y volver a preparar.

El orden alfabético lo pone después de `sellar_version_borrador`, así que los permisos van antes.

Por qué hace falta: sin esto, una versión creada después de enviar haría que el envío apuntara a una
versión que ya no es la vigente. El vínculo que pide la FAQ dejaría de ser «la versión que salió».

#### 1.5.7 `cobros.factura_espejo_id` (contrato `:96-99`)

```sql
alter table public.cobros add column factura_espejo_id uuid;   -- nula, sin default, sin FK
grant insert (factura_espejo_id) on public.cobros to authenticated;
```

Disparador `validar_cobro_factura_espejo`, before insert, definer, que solo actúa si
`new.factura_espejo_id is not null`:
1. Reproduce la política `cobros_alta` del llamante, para `authenticated`. Si no pasa, 42501. Así va
   antes que el cotejo y no hay oráculo.
2. Si el espejo no existe, 23503.
3. Si `espejo.paciente_id <> new.paciente_id`, 23514.

`cobros` no tiene UPDATE, así que no hace falta cubrir la actualización. `bonos.factura_espejo_id`
**no entra** (§«Lo que no entra»).

#### 1.5.8 Redefinición de `borradores_factura_estado`

`create or replace view` con las mismas columnas, en el mismo orden, con los mismos tipos y con
`security_invoker = true`. `estado` vale:
- `'facturado'`, si hay espejo para el borrador;
- si no, `'enviado'`, si hay envío;
- si no, `'en_cola'` o `'fallido'`, según `public.estado_cola_borrador(b.id)`;
- si no, `'descartado'` o `'sin_enviar'`, como en T-021.

`estado_cola_borrador(uuid) returns text` es definer, `stable` y devuelve `'pendiente'`, `'fallido'` o
nulo. Lee el outbox **solo** si el llamante pasa la política de lectura de la cabecera: si no, nulo.
Hace falta porque el invoker no puede leer el outbox.

La anotación no va en esta vista: la ficha la lee de `facturas_anotaciones`.

#### 1.5.9 Ajuste y secreto (ADR-053 f)

```sql
create table public.facturacion_ajuste (
  unico              boolean primary key default true check (unico),
  proveedor          public.proveedor_facturacion,          -- null = sin proveedor
  secreto_id         uuid,                                  -- id en vault.secrets; nunca la clave
  sincronizado_hasta timestamptz,
  actualizado_por    uuid references public.perfiles(id),
  actualizado_en     timestamptz not null default now(),
  check ((proveedor is null) = (secreto_id is null))
);
alter table public.facturacion_ajuste enable row level security;   -- sin políticas
revoke all on public.facturacion_ajuste from public, anon, authenticated, service_role;
create trigger auditar_facturacion_ajuste
  after insert or update of proveedor, secreto_id or delete on public.facturacion_ajuste
  for each row execute function public.fn_auditar('unico');
```

`sincronizado_hasta` queda fuera de la auditoría: se mueve cada 5 minutos.

| Función | Para | Qué hace |
|---|---|---|
| `guardar_clave_proveedor_facturacion(p_proveedor, p_clave text) returns void` | authenticated | 1. Si no es administrador activo, 42501. 2. Valida la clave: `length` entre 16 y 256 y `^[A-Za-z0-9._-]+$`. Si no pasa, 22023 con mensaje fijo. 3. Crea `proveedor_facturacion_clave` con `vault.create_secret` o la reemplaza con `vault.update_secret`. 4. Hace upsert del ajuste. **`p_clave` no aparece en ningún `raise`, `format` ni `notice`.** |
| `quitar_proveedor_facturacion() returns void` | authenticated | Solo administrador. Hace `delete from vault.secrets where name = 'proveedor_facturacion_clave'` y pone `proveedor` y `secreto_id` a nulo. La cola pendiente se queda: sin proveedor, el consumidor no hace nada (§1.6) |
| `proveedor_facturacion_activo() returns proveedor_facturacion` | authenticated | Devuelve el proveedor o nulo. No revela nada más |
| `estado_clave_proveedor_facturacion() returns table(proveedor, ultimos4 text, actualizado_en)` | authenticated, solo administrador (si no, 42501) | Devuelve `'••••' \|\| right(clave, 4)`, nunca más |
| `clave_proveedor_facturacion()` | service_role | §1.5.4 |
| `disparar_drenado_facturacion() returns void` | ninguno (lo llama cron, como `postgres`) | 1. Lee del Vault `facturacion_drenar_url` y `facturacion_drenar_secreto`. 2. Si falta alguno o no hay proveedor, no hace nada. 3. Si no, `net.http_post(url, '{}'::jsonb, '{}'::jsonb, jsonb_build_object('Authorization', 'Bearer ' \|\| secreto, 'Content-Type', 'application/json'), 10000)` |

`select cron.schedule('drenar-facturacion', '*/5 * * * *', 'select public.disparar_drenado_facturacion()');`

Los dos secretos del drenado los da de alta quien despliega, con `vault.create_secret` en SQL, y van
documentados en la bitácora. En local no existen, así que el cron no hace nada y las pruebas llaman a
la cola directamente.

#### 1.5.10 Comentarios

Cada tabla, función y vista lleva su `comment on`. El de `facturas_espejo` cita el ADR-077 punto 7 y
dice «no se actualiza nunca».

### 1.6 Node: cola, sincronizador y ruta

**`lib/facturacion/clave.ts`** (server-only): `leerClaveProveedor(): Promise<string | null>`.
- Llama a `crearClienteAdministracion().rpc('clave_proveedor_facturacion')`.
- Sin `use cache`, sin memorizar en un módulo y sin registrar el resultado.

**`lib/facturacion/cola.ts`:**

```ts
export async function drenarEnvios(dep: {
  bd: SupabaseClient<Database>;            // service_role
  proveedor: ProveedorFacturacion; idProveedor: IdProveedor;
  descifrarNif: (fila) => Promise<string | null>;
  limite?: number;
}): Promise<{ enviados: number; reintentos: number; fallidos: number }>;
```

Por cada fila de `reclamar_envios_facturacion`:
1. Si `ya_enviado_documento_id`, llama a `registrar_envio_borrador` con ese id, que es idempotente y
   marca el evento como entregado, y sigue.
2. Descifra el NIF y llama a `proyectarBorrador` y a `proveedor.crearBorrador`.
3. Si va bien, llama a `registrar_envio_borrador`.
   - Si **esta** llamada falla después de crear el documento, el evento queda `pendiente` con su
     concesión.
   - En el siguiente reclamo `ya_enviado_documento_id` es nulo, así que se crearía otro documento.
   - Para evitarlo, se reintenta `registrar_envio_borrador` hasta 3 veces en la misma ejecución. Si
     sigue fallando, se registra el fallo como permanente con el código `ambiguo`: un humano comprueba
     en el programa (§4, R5).
4. Ante `ErrorProveedor` llama a `registrar_fallo_envio_facturacion(evento, codigo, !reintentable)`.
5. Cualquier otro error cuenta como `rechazado` y permanente.

Registra solo `console.error('[facturacion] envio', codigo)`. Nunca el error, la fila, la proyección
ni la clave.

**`lib/facturacion/sincronizador.ts`:**

```ts
export async function sincronizar(dep: { bd; proveedor; idProveedor; ahora: Date }): Promise<{ copiados: number; anotados: number; discrepancias: number }>;
```

- **Pasada A** (los pendientes de aprobar): `documentos_para_sincronizar(p_ids => null)` y, por cada
  uno, `consultarDocumento`:
  - `aprobado` → `registrar_factura_espejo`;
  - `borrado_sin_aprobar` → `registrar_anotacion_documento`;
  - `rectificado` o `anulado` sin espejo → primero el espejo con sus hechos y luego la anotación;
  - `borrador` → nada.
- **Pasada B** (los cambios posteriores):
  1. Lee `listarDocumentosDesde(sincronizado_hasta ?? ahora - 1 día)`.
  2. Lo filtra con `documentos_para_sincronizar(p_ids => ids)`. Lo que no tiene envío se ignora: son
     facturas hechas directamente en el programa.
  3. Aplica las mismas reglas.
  4. Al final llama a `avanzar_cursor_sincronizacion(inicio_de_la_ejecución - 10 min)`.
- Un 23505 de `registrar_factura_espejo` → `notificar_discrepancia_facturacion` y `discrepancias++`.
  Nunca hay reintento con otros datos ni actualización.
- `sincronizar` **solo lee** del proveedor. Que esto sea así es el ADR-078 1, «ni una acción encadenada
  a una sincronización».

**`app/api/facturacion/drenar/route.ts`:**
- Es `export async function POST(request: Request)`. Antes de escribirla se lee
  `node_modules/next/dist/docs/` sobre route handlers.
1. `await connection()`.
2. Sin `FACTURACION_DRENAR_SECRETO` en el entorno, 503. Si la cabecera `Authorization: Bearer` no
   coincide (comparada con `timingSafeEqual` sobre buffers de la misma longitud; si las longitudes
   difieren, 401), 401.
3. Si `proveedorActivo()` devuelve nulo, 200 `{ estado: 'sin_proveedor' }`.
   - Aquí `proveedorActivo` se resuelve con el cliente de administración: una variante
     `proveedorActivoServicio()` en `registro.ts`, que lee `facturacion_ajuste` a través de
     `clave_proveedor_facturacion` y `proveedor_facturacion_activo`. Hay que darle `execute` sobre esta
     última también a `service_role`.
4. `leerClaveProveedor()`. Luego `drenarEnvios` y después `sincronizar`, cada uno en su `try`.
5. Responde 200 con `{ enviados, reintentos, fallidos, copiados, anotados, discrepancias }` y
   `Cache-Control: private, no-store`.

`proxy.ts`: `/api/facturacion/drenar` entra en `RUTAS_PUBLICAS`. La protege el secreto, no la sesión.
`.env.example` gana `FACTURACION_DRENAR_SECRETO=` (§6).

### 1.7 Interfaz

Antes de escribirla: `docs/interfaz.md` §Ajustes (cada bloque, solo para el rol que lo puede usar) y
ADR-078 3 para el vocabulario.

**Ajustes › Programa de facturación** (`app/(app)/ajustes/facturacion/`):
- **`page.tsx`**, Server Component, con el patrón de `centros/page.tsx`:
  - Suspense;
  - `exigirSesion()` y `estadoDeCuenta`;
  - si no es administrador, `redirect('/ajustes')`.
  - Muestra:
    - el estado: «Sin programa conectado», o «{programa} conectado · clave ••••abcd · actualizada el …», sacado de `estado_clave_proveedor_facturacion()`;
    - el formulario;
    - «Probar conexión»;
    - «Desconectar».
  - Con `FICHAS` sin ninguna disponible, como en T-026a, enseña el texto «Todavía no hay ningún
    programa de facturación disponible para conectar» y ningún formulario. Nada de controles sin una
    acción detrás.
- **`formulario-clave.tsx`**, `"use client"`, con react-hook-form y el mismo esquema Zod que la acción:
  - `<input type="password" autoComplete="off">`, sin `defaultValue`;
  - tras guardar, `reset()`.
- **`esquemas.ts`**: `esquemaClaveProveedor = z.object({ proveedor: z.enum(['holded']), clave: z.string().trim().min(16).max(256).regex(/^[A-Za-z0-9._-]+$/) })`.
  El enum sale de `IdProveedor`.
- **`acciones.ts`**, `'use server'`, con tres acciones:
  - `guardarClaveProveedor(prev, formData)` valida con Zod y llama a la RPC
    `guardar_clave_proveedor_facturacion` con la sesión del usuario. Devuelve `{ ok: true }` o
    `{ error: 'clave_invalida' | 'sin_permiso' | 'fallo' }`. **Nunca devuelve ni registra la clave.**
    Usa `revalidatePath('/ajustes/facturacion')`.
  - `probarConexion()`:
    1. Si no es administrador, error.
    2. `leerClaveProveedor()` y luego `crear(clave).listarDocumentosDesde(new Date())`. Solo lee.
    3. Responde `{ ok: true }` o `{ error: CodigoErrorProveedor }`.
    - La UI traduce `sin_plan` con su frase literal: «Tu cuenta de {programa} no tiene un plan que
      permita conectar otras aplicaciones. Revísalo en {programa}.». Nunca enseña un 401 crudo. El
      texto definitivo depende de lo que conteste Holded (T-026b).
  - `desconectarProveedor()` pasa por un diálogo de confirmación con `components/ui/` (la primitiva de
    diálogo de T-007) y llama a `quitar_proveedor_facturacion`.
- **`app/(app)/ajustes/page.tsx`**: un enlace «Programa de facturación» en `AccesosDeAdministracion`.

**Ficha › Facturación** (`panel-facturacion.tsx` y `acciones-facturacion.ts`): sustituye a
`<Facturacion />` con su propio `<Suspense>`.
- **Administrador y profesional**:
  - lee `borradores_factura_estado` junto con los datos de cabecera y total de la última versión, con su
    sesión y bajo la RLS;
  - también `facturas_anotaciones` y `facturas_espejo` de esos borradores.
  - Por fila muestra fecha, total y estado:

| `estado` | Texto | Acción |
|---|---|---|
| `sin_enviar` | «Sin enviar» | «Preparar borrador en {programa}», solo si hay proveedor activo |
| `en_cola` | «Preparándose en {programa}» | ninguna |
| `fallido` | «No se pudo preparar» con el motivo fijo por código. Si es `ambiguo`: «Comprueba en {programa} si el borrador llegó antes de volver a prepararlo» | «Preparar borrador en {programa}» |
| `enviado` | «Borrador enviado» | «Abrir en {programa} para emitir», si `enlaceDeBorrador` no es nulo |
| `facturado` | «Emitida en {programa} · nº {numero}» | enlace al documento (`url_proveedor`) |
| `descartado` | «Descartado» | ninguna |

  - La anotación se añade como pastilla: «Borrado en {programa} sin emitir», «Rectificada en {programa}»
    o «Anulada en {programa}».
  - Sin proveedor activo no hay **ningún** botón: modo degradado (contrato `:72-74`).
- **Técnico**: lee `facturas_espejo_cabecera` del paciente y muestra la lista «Emitidas en {programa}»,
  con número, fecha, total y enlace. No ve borradores.
- **`prepararBorradorEnProveedor(borradorId)`** (`'use server'`):
  - valida un uuid con Zod;
  - llama a la RPC `encolar_envio_borrador` con la sesión del usuario;
  - usa `revalidatePath` de la ficha;
  - **no** llama al proveedor: el envío va por el outbox (contrato `:107`).
- Sin `use cache` en ningún sitio (ADR-043).
- Textos en `lib/i18n/es.ts`, con `{programa}` sustituido por `ficha.nombre`.

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartada, y por qué |
|---|---|---|
| D1 | Partir en T-026a y T-026b (Q0) | Esperar entero: retrasa a T-023b un esquema que el ADR-053 k no bloquea. Escribir el adaptador ya: contra una API supuesta (regla 1, contrato `:52`) |
| D2 | El borrador y el paciente del espejo y de las anotaciones se derivan del envío, no son parámetros | Pasarlos como parámetros: un error del sincronizador colgaría la factura de otro paciente |
| D3 | La carga del outbox solo lleva `borrador_id`. Los datos se leen al reclamar | Proyectar al encolar: el NIF descifrado se quedaría en una tabla mutable. Y la versión podría cambiar entre encolar y enviar |
| D4 | Congelar las versiones mientras hay cola o envío; dejar pasar si está `fallido` | Congelar para siempre al encolar: un error de importe no se podría corregir antes de que llegue. No congelar: el envío dejaría de apuntar a la versión vigente |
| D5 | Sin referencia a `borrador_id` en lo que sale. Idempotencia por la clave del outbox, la concesión, `unique(borrador_id)` y `ambiguo` → `fallido` con aviso (Q5) | Mandar la referencia: añade un dato a la lista cerrada del ADR-053 i, y eso exige ADR |
| D6 | Céntimos en TS, `numeric(12,2)` en SQL, conversión en la función | Céntimos en las columnas: rompe la coherencia con `cobros` y las versiones de T-021 |
| D7 | La RLS de las tres tablas cuelga de la cabecera (`exists`) | Repetir la regla del profesional: dos copias que pueden divergir |
| D8 | Vista definer para el técnico, con las tres ramas | Dar RLS al técnico sobre `facturas_espejo`: vería `borrador_id` y podría cruzarlo |
| D9 | La cabecera `borradores_factura` no gana capas | No es necesario para ningún criterio y es de T-021. Las FK a la cabecera funcionan porque `postgres` conserva sus privilegios sobre ella |
| D10 | Disparo con pg_cron y pg_net contra una ruta con secreto (Q3) | Cron de Vercel: ata el despliegue a Vercel y no se prueba en local. Llamar a Holded desde SQL: la clave pasaría por pg_net y sus tablas de cola |
| D11 | Probar conexión con `listarDocumentosDesde(now)` | Un método `probar()` en la interfaz: ensancha el contrato de tres métodos (`:56-59`) |
| D12 | Clave en el Vault por función definer, enmascarada a cuatro caracteres | Variable de entorno: no la puede poner el cliente desde la app (ADR-053 f). Columna cifrada con la clave de la app: no es el Vault que pide el contrato |
| D13 | `quitar` borra el secreto | Dejarlo huérfano: la clave del cliente seguiría en la base sin uso |
| D14 | `ultimo_error` y las notificaciones solo con códigos | El texto del proveedor: podría llevar la clave, datos del cliente o PII |
| D15 | El título de la sección es «Programa de facturación» | «Facturación» a secas: el ADR-078 3 prohíbe presentarse como facturación |
| D16 | Sin `bonos.factura_espejo_id` | La factura de un bono no sale de un borrador, así que nada la llenaría (contrato `:98-99`) |

---

## 3 · Cómo se cierra cada criterio de aceptación

| # | Criterio | Comprobación |
|---|---|---|
| 1 | `approveDoc` solo como constante `false`; ninguna llamada a la aprobación | `grep -rn "approveDoc\|APPROVE_DOC" lib/` → solo las líneas de `holded.ts`, la constante y su `void`. `grep -rniE "approve\|/approve" app components lib proxy.ts --exclude=*.test.ts` → solo esa constante. En T-026b, además, `holded.test.ts` con `fetch` simulado comprueba que ninguna URL pedida contiene `approve` y que el cuerpo de creación lleva `approveDoc: false` |
| 2 | Dos veces, un documento y un envío | `lib/facturacion/cola.bd.test.ts` (`npm run test:facturacion`, contra la base local y con el simulado): borrador de la fijación → `encolar_envio_borrador` ×2 (mismo `evento_id`) → `drenarEnvios` ×2 **en paralelo** (`Promise.all`) → `control.documentos().length === 1` y `count(borradores_factura_envios where borrador_id = …) = 1`. Más el caso `perderRespuesta`: 1 documento, 0 envíos, evento `fallido` con `ambiguo` y la notificación creada. Banco 31-D: `registrar_envio_borrador` ×2 da el mismo id, y con otro documento, 23505 |
| 3 | La proyección no manda `tipo_terapia`, `cita_id` ni diagnóstico | `proyeccion.test.ts`: una entrada con `tipo_terapia`, `cita_id`, `diagnostico` y `concepto: 'TCC ansiedad'` metidos en las líneas y en la raíz → `JSON.stringify(salida)` no contiene ninguna de esas claves ni esos valores, y las claves de la salida son exactamente `destinatario, fecha, lineas` y las de cada línea, las de `LineaProyectada`. Banco 31-N: las líneas que devuelve `reclamar_envios_facturacion` no tienen las claves `concepto` ni `cita_id` |
| 4 | La clave no aparece en el navegador, el HTML ni el paquete | `accesibilidad/facturacion-clave.spec.ts`: entra como administrador, guarda una clave centinela (`SENTINELA_T026_` + 20 caracteres), recarga la página, abre la ficha y recoge **todas** las respuestas (`page.on('response')`, también RSC) → ninguna contiene el centinela. Después recorre `.next/` (static y server) con `fs` → ninguna coincidencia. Unitario: `guardarClaveProveedor` devuelve un objeto sin la clave, comprobado contra el centinela. Banco 31-M: la `auditoria` no contiene el centinela |
| 5 | `insert` como `authenticated` falla; por la función entra | Banco 31-B: `insert` sobre cada tabla como ADM, PRO1 y TEC1 → 42501. Banco 31-C/D/E: las funciones, como `service_role`, insertan |
| 6 | `update`, `delete` y `truncate` fallan para todo rol; `cobertura_solo_adicion()` = 0 | Banco 31-B: como `authenticated`, `service_role` y `postgres` → 42501. `10-solo-adicion` recoge las tres tablas del catálogo con la fila de `01`. `select public.cobertura_solo_adicion() = 0` |
| 7 | Mismos datos dan el mismo id; total distinto da 23505 y la fila no cambia | Banco 31-C: `registrar_factura_espejo` ×2 iguales → mismo id. Con `p_total_centimos + 100` (y la base ajustada) → 23505, y una relectura de la fila: total original |
| 8 | Sin columnas de estado, cobro, PDF, QR ni RF | Banco 31-A: `array_agg(column_name order by ordinal_position)` de `facturas_espejo` es igual a la lista exacta de §1.5.2, y no hay `column_name ~* 'estado\|pago\|cobr\|pdf\|qr\|registro\|huella'` |
| 9 | `tipo` fuera de vocabulario | Banco 31-E: `registrar_anotacion_documento(…, 'pagado')` → 22P02, y `enum_range` igual a los tres valores |
| 10 | El técnico ve las cabeceras de su centro y no las de otro, sin `cita_id` ni líneas | Banco 31-G: TEC1 cuenta 1 sobre el espejo del centro A y 0 sobre el del centro B; la gemela ADM cuenta 2. Las columnas de la vista, en `information_schema.columns`, son la lista exacta, sin `cita_id`, `lineas` ni `borrador_id`. TEC1 sobre `facturas_espejo` (la tabla) cuenta 0 |
| 11 | Un cobro con el espejo de otro paciente da 23514, también como técnico | Banco 31-H: ADM y TEC1 (paciente de su centro, espejo de otro paciente) → 23514; con un espejo inexistente → 23503; PRO2 sin permiso sobre el paciente → 42501 antes que el cotejo; la gemela del espejo correcto pasa |
| 12 | Con el proveedor caído, sigue en cola y no sale como facturado | `cola.bd.test.ts`: `control.caido(true)` → `drenarEnvios` → evento `pendiente`, `intentos = 1`, `proximo_intento > now()`, 0 envíos, `borradores_factura_estado.estado = 'en_cola'`. Banco 31-N: el retroceso y la transición a `fallido` en el intento 8 |
| 13 | `holded` no aparece fuera de `lib/facturacion/` | `grep -rniI holded app components lib proxy.ts scripts/*.ts --exclude-dir=facturacion` → vacío. Lo de `lib/supabase/tipos-bd.ts`, que es la etiqueta del enum generada y el contrato manda el enum (`:78`), se lista y se justifica en la evidencia. SQL y bancos no son «código» de la app, igual que en el contrato |
| 14 | Manual: sin proveedor | La app arranca sin ajuste; la ficha no tiene botones; los cobros de T-023 funcionan. Captura en la evidencia |
| 15 | Manual: Holded real | **T-026b.** En T-026a queda marcado «fuera: T-026b» |
| 16 | Manual: la clave, enmascarada y sin releer | Guardar, recargar → «••••abcd» y un input vacío. No hay ruta ni acción que la devuelva (`grep -rn "clave_proveedor_facturacion" app` → vacío; solo la usa `lib/facturacion/clave.ts`) |
| 17 | `test:rls`, `lint:migraciones`, `lint` y `build` | La salida de los cuatro en la evidencia |

**Banco `scripts/rls/31-proveedor-facturacion.sql`**, por bloques:
- **A**: catálogo, columnas exactas, privilegios por columna, ACL de las funciones (`has_function_privilege` para anon, authenticated y service_role) y `prosecdef` con `proconfig` igual a `search_path=""`.
- **B**: solo adición, por rol.
- **C**: espejo; 23503 sin envío; 23514 tras borrado.
- **D**: envíos.
- **E**: anotaciones y coherencia.
- **F**: lectura (ADM, PRO1, PRO2 y TEC1) y gemelas.
- **G**: vista del técnico.
- **H**: cobros.
- **I**: `encolar` (permisos primero: PRO2 sobre un borrador de PRO1 y un uuid inexistente dan **el mismo** mensaje 42501; sin proveedor, 23514; descartado, 23514; dos veces, el mismo id; desde `fallido`, vuelve a `pendiente`).
- **J**: congelación (con envío, 23514; en `fallido`, pasa; PRO2 recibe 42501 del sellado, no 23514).
- **K**: transiciones de `borradores_factura_estado` y columnas iguales a las de T-021.
- **L**: Vault y ajuste (TEC1 y PRO1 → 42501 en guardar, quitar y estado; ADM guarda; `estado` devuelve solo cuatro caracteres; `facturacion_ajuste` es ilegible para `authenticated`; `quitar` borra la fila de `vault.secrets`).
- **M**: auditoría (una fila por insert en las tres tablas y en el ajuste; el centinela no aparece en `auditoria`).
- **N**: reclamo (`skip locked` con dos sesiones vía `dblink` no, que no está: se prueba la concesión, porque un segundo reclamo inmediato devuelve 0), retroceso, `fallido` y notificación deduplicada.

**Fijación en `01`.** Usa borradores **nuevos**, no BORR1: el banco 26 añade versiones a BORR1 y la
congelación lo rompería.
- `BORRA` es un paciente del centro A, de PRO1. `BORRB` es uno del centro B.
- Cada uno lleva su versión, su envío, su espejo y una anotación de `rectificado` sobre `BORRA`.
- Todo se crea **con las funciones** de §1.5.4, como `service_role`. Así la fila de `10-solo-adicion`
  existe para las tres tablas.
- El ajuste de proveedor se pone con `guardar_clave_proveedor_facturacion` como ADM, con una clave
  ficticia de la fijación.

**`00-ayudantes`**: los uuid nuevos. **`11-cobertura`**: las tres políticas en `v_declaradas`.

---

## 4 · Riesgos, por probabilidad

1. **Alta: las respuestas de Holded cambian cosas.**
   - Puede pasar que «borrado sin aprobar» no se pueda consultar, que `listar` no filtre por fecha de
     modificación o que no exista el enlace al borrador.
   - Mitigación: la interfaz está pensada para absorberlo en el adaptador. Si no basta, hallazgo y Q
     nueva, sin rodeo.
2. **Media: concesión de 5 minutos frente a un `crearBorrador` lento.** Si el proveedor tarda más de 5
   minutos, otro consumidor podría reclamar el evento y crear un segundo documento.
   - Mitigación: `timeout` del fetch en 30 s (T-026b) y `maxDuration` de la ruta por debajo de la
     concesión.
3. **Media: la clave en los registros de Postgres o de PostgREST.** `log_statement` registra los
   parámetros de las RPC.
   - Mitigación: la llamada va como RPC con parámetros, no como SQL literal. Hay que comprobar en la
     verificación que `log_statement` no es `all` en la instancia (en Supabase por defecto, `none`).
     Se anota en la bitácora como requisito de despliegue.
4. **Media: pg_net guarda las peticiones en `net.http_request_queue` y `net._http_response`**, con
   las cabeceras, y ahí va el secreto del drenado, no la clave del cliente.
   - Mitigación: el secreto del drenado solo sirve para disparar el drenado, que es idempotente. Rotarlo
     es un `vault.update_secret` más el cambio de la variable de entorno.
5. **Baja: respuesta perdida, con el documento creado pero sin envío.**
   - Mitigación: `ambiguo` → `fallido` con aviso, y el texto de la ficha pide comprobar en el programa.
     Un duplicado sería un **borrador** en el programa, no una factura.
6. **Baja: redesplegar con otra `PROYECCION_VERSION` a mitad de un reintento.** El envío guarda la
   versión con la que salió: es trazable.
7. **Baja: dos sincronizaciones solapadas.** Es inocuo porque todo es idempotente. Solo duplica
   llamadas a la API.
8. **Baja: T-023 y T-026 tocan `cobros`** con disparadores distintos (`validar_cobro` y
   `validar_cobro_factura_espejo`).
   - Mitigación: este va en la migración posterior y no toca `motivo`. Se verifica con
     `max(version)` antes del verificador.

---

## 5 · Qué revisar

**Qué elige el llamante y qué efecto tiene**
- [ ] En `encolar_envio_borrador`, el llamante elige **solo** `p_borrador_id`. La carga, la clave de
  idempotencia y `creado_por` los pone la función.
- [ ] En `registrar_factura_espejo`, el llamante (`service_role`) elige el documento y los hechos, pero
  **no** el borrador ni el paciente: se derivan del envío.
- [ ] `observada_en` y `copiado_en` no son parámetros.
- [ ] En `cobros`, `authenticated` solo gana `insert (factura_espejo_id)`. No hay UPDATE.
- [ ] En `guardar_clave_proveedor_facturacion`, `p_clave` no aparece en ningún `raise`, `format`,
  `notice` ni en el valor devuelto. Se busca `p_clave` en la migración: solo debe salir en la
  validación y en las dos llamadas al Vault.

**Qué prueba debe fallar, y por qué motivo exacto**
- [ ] I: PRO2 sobre el borrador de PRO1 y sobre un uuid inexistente → **el mismo** texto 42501. Si
  difieren, hay oráculo.
- [ ] J: PRO2 añadiendo una versión a un borrador enviado → 42501 del **sellado**, no 23514 de la
  congelación. Si sale 23514, el orden alfabético de los disparadores está mal.
- [ ] H: PRO2 con un cobro de un paciente ajeno y un espejo inexistente → 42501, no 23503.
- [ ] C: el total distinto → 23505, y la relectura demuestra que no hubo UPDATE.
- [ ] B: `postgres` también recibe 42501 en update, delete y truncate de las tres tablas.

**Invariantes que se podrían saltar por otra puerta**
- [ ] **Null**: `cobros.factura_espejo_id` nulo no dispara la validación, y es lo correcto. Pero el
  `check (proveedor is null) = (secreto_id is null)` del ajuste tiene que estar.
- [ ] **Duplicados**: `unique(borrador_id)` en el envío y en el espejo; `unique(proveedor, documento)`
  en los dos; `unique(proveedor, documento, tipo)` en las anotaciones.
- [ ] **Concurrencia**:
  - `for update` de la cabecera en `encolar`;
  - `for key share` en la congelación;
  - `skip locked` y concesión en el reclamo;
  - la prueba paralela del criterio 2.
- [ ] **Permisos de tabla entera**:
  - ningún `grant insert` sin columnas;
  - ningún grant a `service_role` sobre las tablas (todo por funciones);
  - `facturacion_ajuste` sin un solo grant;
  - la vista con `revoke` a `anon` y `service_role`.
- [ ] **TRUNCATE**: el disparador `before truncate` existe en las tres, y hay `revoke truncate` también
  a `postgres`.
- [ ] **El outbox mutable no es la fuente**: ningún estado de la UI dice «enviado» sin una fila en
  `borradores_factura_envios`.
- [ ] **La lista del ADR-077 punto 7**: se recorren las columnas de las tres tablas y cada una es «del
  programa, en la lista» o «de la app». Nada más.
- [ ] **ADR-078**:
  - `grep -rniE "\b(emitir|facturar|expedir|aprobar|crear factura|verifactu)\b" app components lib/i18n` → solo las cadenas permitidas, «Abrir en {programa} para emitir» y «Emitida en {programa}», y textos previos ajenos al ticket;
  - ningún control llama a `crearBorrador` desde una petición del usuario.
- [ ] **ADR-043**: ni `use cache` ni `unstable_cache` en `lib/facturacion`, `ajustes/facturacion` ni el
  panel.
- [ ] **El simulado no llega a producción**: lo comprueba la prueba de importaciones.
- [ ] `proxy.ts` añade **solo** `/api/facturacion/drenar`, y la ruta sin el secreto da 401 o 503,
  nunca 200.

---

## 6 · Territorio

Para el frontmatter del contrato (lo escribe el propietario o el arquitecto):

```
territorio:
  - supabase/migrations/20261014120000_proveedor_facturacion.sql
  - scripts/rls/00-ayudantes.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/11-cobertura.sql
  - scripts/rls/31-proveedor-facturacion.sql
  - scripts/rls/README.md
  - scripts/lint-migraciones.ts
  - scripts/lint-migraciones.test.ts
  - lib/supabase/tipos-bd.ts
  - lib/facturacion/**
  - lib/i18n/es.ts
  - app/api/facturacion/drenar/route.ts
  - app/(app)/ajustes/page.tsx
  - app/(app)/ajustes/facturacion/**
  - app/(app)/pacientes/[id]/page.tsx
  - app/(app)/pacientes/[id]/panel-facturacion.tsx
  - app/(app)/pacientes/[id]/panel-facturacion.test.tsx
  - app/(app)/pacientes/[id]/acciones-facturacion.ts
  - proxy.ts
  - .env.example
  - accesibilidad/facturacion-clave.spec.ts
  - vitest.config.ts
  - vitest.bd.config.ts
  - package.json            # solo scripts: test:facturacion; ninguna dependencia nueva
  - tickets/T-026/**
  - docs/bitacora/T-026*.md
  - docs/state.md
```

---

## 7 · Delegable

Casi nada. Todo toca la clave, el outbox, la RLS o el vocabulario regulado. Como mucho, un CLI de
volumen podría hacer la **pastilla visual de estado y de anotación** (`EstadoBorrador`): un componente
puramente de pintura que recibe `estado` y el texto ya traducido, sin acciones. El resto, la fábrica.

---

## Lo que no entra, y por qué

- **El cuerpo de `holded.ts` y los criterios manuales con Holded** → T-026b. Lo bloquea el ADR-053 k.
- **El editor del borrador**: crearlo desde la cita y elegir destinatario, NIF y líneas. Ningún
  contrato lo construye (Q1). Las pruebas usan borradores de la fijación.
- **`bonos.factura_espejo_id`**: no tiene de dónde llenarse (D16).
- **Atribuir una rectificativa a su original**: no está en la lista del ADR-077 punto 7 y depende de
  Holded Q4. Solo se anota `rectificado` sobre el original.
- **El listado de facturas, el cobro contra una factura y su selector** → T-023b. T-026 le deja la
  columna `cobros.factura_espejo_id` con su validación, la vista `facturas_espejo_cabecera` y el
  estado del borrador.
- **Enlazar un cobro ya registrado con una factura posterior** → T-023b (Q2).
- **El plan B de fichero**: el ADR-078 7 dice «diseñado, no construido».
- **Capas en la cabecera `borradores_factura`** (D9).
- **Una concesión para la sincronización**: es idempotente y no la necesita.
- **Disparar el drenado justo después de pulsar «Preparar»** (`after()`): el contrato pide el outbox
  fuera de la petición. La espera de hasta 5 minutos se ve como «Preparándose».
- **Añadir la pregunta de idempotencia a `docs/legal/preguntas-holded.md`**: está fuera del
  territorio. Va como hallazgo para `docs/state.md`.

---

## Preguntas abiertas al propietario

**Respondidas (05-10-2026)**: Q0 = partir en T-026a (ya, sin red, con simulado) y T-026b (adaptador real de Holded, tras su respuesta) · Q1 = ticket nuevo para el editor del borrador, antes de activar el envío · Q4 = concepto según el IVA («Sesión de psicología» exento; «Servicios profesionales de psicología» general) · Q6 = Ajustes › Programa de facturación solo para el administrador. Cerradas por el orquestador con la recomendada: Q2 (asignación de solo adición en T-023b), Q3 (pg_cron + pg_net), Q5 (sin referencia nuestra; la pregunta de idempotencia va a `docs/legal/preguntas-holded.md`). Contratos por redactar: T-026a/T-026b, T-023b y el editor del borrador.

**Q0 · ¿Se parte el ticket?**
- (a) **T-026a ya** (esquema, capa, cola, sincronizador, Vault, Ajustes y ficha, con Holded «no
  disponible») y **T-026b** cuando contesten Holded y el asesor (k.1).
- (b) Esperar a tenerlo todo.
- **Recomendada: (a).** El ADR-053 k bloquea el adaptador, no el esquema, y T-023b necesita el
  espejo.

**Q1 · ¿Quién construye el editor del borrador?** Hoy nadie crea borradores desde la interfaz: ni
T-021, ni T-023, ni T-026.
- (a) Un ticket nuevo, antes de activar la facturación.
- (b) Meterlo en T-026a.
- **Recomendada: (a).** Es formulario y dinero, y merece diseño propio. T-026 no lo necesita para
  sus criterios automáticos.

**Q2 · Cobros anteriores a la factura.** `cobros.factura_espejo_id` solo se fija al registrar el
cobro, y un cobro anticipado no se puede enlazar después.
- (a) En T-023b, una tabla de asignación de solo adición, `cobros_facturas`.
- (b) Aceptar que solo se enlazan los cobros posteriores.
- **Recomendada: (a)**, decidida en T-023b.

**Q3 · Cómo se dispara el drenado.**
- (a) pg_cron + pg_net contra la ruta, con un secreto en el Vault.
- (b) Cron de Vercel.
- **Recomendada: (a).** No ata el despliegue y ya hay un precedente de pg_cron.

**Q4 · El concepto genérico.**
- (a) Exento: «Sesión de psicología». General: «Servicios profesionales de psicología».
- (b) Otro texto fijo que elija el propietario.
- **Recomendada: (a).** No es clínico (ADR-053 i) y distingue el pericial, que va al 21 %.

**Q5 · Idempotencia frente al programa.**
- (a) No mandar ninguna referencia nuestra. La idempotencia se garantiza en la app, y una respuesta
  perdida queda «fallida» con aviso para comprobar en el programa.
- (b) Mandar `borrador_id` como referencia opaca para deduplicar. Eso exige un ADR que amplíe la lista
  cerrada del ADR-053 i.
- **Recomendada: (a)**, y añadir a `docs/legal/preguntas-holded.md` cómo deduplica Holded una creación
  repetida y si admite una clave de idempotencia en cabecera.

**Q6 · ¿Quién ve Ajustes › Programa de facturación?**
- (a) Solo el administrador.
- (b) También el profesional autónomo de una consulta unipersonal.
- **Recomendada: (a).** La clave es de la cuenta del cliente, la matriz de Ajustes reserva al
  administrador lo de empresa, y en una consulta unipersonal el profesional suele ser también
  administrador.
