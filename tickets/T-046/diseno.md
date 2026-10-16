# T-046 · Diseño: editor del borrador de factura

Arquitecto, 16-10-2026. Contrato: `tickets/T-046-editor-del-borrador.md`. Riesgo alto, `delegable: no`.
La base de datos no estaba en marcha al escribir esto, así que todo lo de abajo sale de leer el código.
Lo que no se ha podido comprobar va marcado **«sin verificar»**: el implementador lo comprueba
antes de escribir lo que dependa de ello.

---

## 0 · Hechos verificados contra el código

### Cadena del borrador (T-021) — `supabase/migrations/20261011120000_economico_esquema.sql`
- H1. `borradores_factura_versiones` (l.104-141). Columnas: `numero_version`, `huella`,
  `huella_anterior`, `algoritmo_version`, `contenido_canonico`, `paciente_id`, `profesional_id`,
  `centro_id`, `destinatario_nombre`, las cuatro `destinatario_nif_*` (`bytea` y `smallint`),
  `lineas jsonb`, `base`/`cuota_iva`/`total numeric(12,2)`, `descartado`, `creada_por` y `creada_en`.
  Restricciones: las cuatro del NIF van todas o ninguna, el nonce mide 12 bytes, la etiqueta 16 y la
  clave es la versión 1. Además, al menos una línea, `base + cuota_iva = total` y los signos
  coherentes.
- H2. `fn_sellar_version_borrador()` (l.295-626) es `security definer`.
  - Paso 0: 42501 «No puedes añadir una versión a este borrador…».
  - Paso 1: el llamante no manda `huella`, `huella_anterior`, `numero_version`, `paciente_id` ni
    `profesional_id`.
  - Bloquea la cabecera con `for no key update` y toma un candado consultivo por borrador.
  - Fija `numero_version` como el máximo más uno.
  - Coteja **por valor jsonb** las quince claves del sobre contra la fila, con un mensaje por clave.
    Para `numero_version` el mensaje es «El numero_version del sobre no es el que asigna la base
    (máximo + 1)» (l.~423).
  - Comprueba las líneas (l.~480-590):
    - seis claves;
    - el tipo de IVA casa con el régimen;
    - un `cita_id` no nulo existe y es del mismo paciente (l.576). **No mira estado, profesional ni
      bono.**
  - Importes: la suma de líneas es `total×100`; si todo es exento, la cuota es 0; si hay
    importe general, la cuota no puede ser 0 (l.600).
  - Paso 6.5: solo cuando `current_setting('role', true) in ('authenticated','anon')`, exige
    `creada_por = auth.uid()` y `creada_en` dentro de ±1 minuto.
  - La huella es `sha256(contenido_canonico || huella_anterior)` sobre **el texto que se manda**.
- H3. Las cotas de `20261011140000_*`:
  - el concepto tiene que ser visible;
  - el tipo de IVA no pasa de 10000;
  - la cuota tiene que caer en la banda `|cuota×100 − Q| ≤ Σ least(1,|q_i|)`.

  Con `desglosarDesdeTotal(G,'general')` sobre la suma general G, la banda se cumple siempre que
  G ≥ 3 céntimos. Con G ≤ 2 la cuota sale 0 y el sellado la rechaza (l.600). Ese es el hallazgo
  A4-H1, que pasa a este ticket (`docs/state.md`).
- H4. Cabecera `borradores_factura`:
  - `grant insert (id, paciente_id, profesional_id, creado_por)`; no tiene ni update ni delete;
  - `fn_validar_cabecera_borrador` (l.844-889) da 42501 «No puedes abrir este borrador…», o 23514
    «El profesional del borrador no atiende a ese paciente» cuando `profesional_id` no es
    `pacientes.profesional_id` o el paciente no existe.
- H5. Políticas (l.1119-1155):
  - la cabecera la lee el administrador, o el profesional cuyo `profesional_id` es él;
  - una versión se lee si su cabecera es legible;
  - el alta de una versión exige ser administrador, o profesional de la cabecera y asignado.
- H6. `citas_lectura` (`20260906120000_agenda_esquema.sql:691`): el administrador, o
  `profesional_id = auth.uid()`. El técnico no lee `citas`. `tarifas_paciente_lectura` (l.1100):
  el administrador o el profesional asignado.
- H7. `verificar_cadena_borrador(p_borrador_id uuid default null)` (l.639): cero filas quiere decir
  que la cadena está bien. El disparador de auditoría de las versiones (l.1061) excluye
  `destinatario_nif_cifrado` de lo que audita.
- H8. Los disparadores `before insert` de las versiones, por nombre, son `sellar_version_borrador`,
  `sellar_version_borrador_cotas` y `sellar_version_borrador_tras_envio` (este último en
  `20261014120000_proveedor_facturacion.sql:1005`). `scripts/rls/31-proveedor-facturacion.sql:180-185`
  (31.A10) afirma que los disparadores `like 'sellar_version_borrador%'` son exactamente esos tres.
  **Un disparador nuevo no puede empezar por ese prefijo.**
- H9. `scripts/rls/26-economico.sql:1012-1020` (26.J34) inserta como `postgres` una versión con una
  cita FUTURA y `programada`. Un disparador nuevo sobre citas tiene que limitarse a
  `authenticated` y `anon`, como hace el paso 6.5, o rompe el banco 26.

### Congelación y estado (T-026a) — `20261014120000_proveedor_facturacion.sql`
- H10. `fn_sellar_version_borrador_tras_envio`: si hay envío o evento `pendiente` responde 23514
  **«el borrador ya se preparó en el programa: no admite versiones nuevas»**. Con el envío
  `fallido`, la versión pasa.
- H11. Vista `borradores_factura_estado` con los estados `facturado`, `descartado`, `enviado`,
  `en_cola`, `fallido` y `sin_enviar`.
- H12. `encolar_envio_borrador` (l.885-963) es el patrón de permisos: `revoke all … from public,
  anon, authenticated, service_role` y después `grant execute … to authenticated`.

### Precio (T-023) — `20261013120000_cobros_y_pendiente.sql:100-121`
- H13. Toma la tarifa del paciente con `vigente_desde <= (c.inicio at time zone c.zona_horaria)::date
  order by vigente_desde desc, orden desc limit 1` y, si no hay, `tipos_terapia.tarifa_base`.
  Solo cuenta `estado='realizada' and bono_id is null`.
- H14. Columnas:
  - `tipos_terapia.tarifa_base numeric(10,2)` admite nulo;
  - `tipos_terapia.regimen` lleva `default 'exento_sanitario'` (`20260906120000:98-108`);
  - `tarifas_paciente`: `importe numeric(12,2) > 0`, `regimen_iva not null`, `vigente_desde date`
    y `orden`.

### Identificación y cifrado
- H15. `leer_identificacion(p_paciente_id)` (`20260916120000_*`) es invoker. Deja rastro
  `LECTURA_IDENTIFICACION`, que se deduplica en 15 minutos. Sin fila de identificación devuelve
  cero filas.
- H16. `lib/cifrado/aes-gcm.ts`: `cifrar(clave, texto) → {cifrado, nonce, etiqueta}` (Buffer) y
  `descifrar(clave, sobre)`. `lib/cifrado/bytea.ts`: `aBase64`, y `desdeBytea`, que lee el `\x…`
  hexadecimal con que PostgREST devuelve un `bytea`. `lib/cifrado/claves.ts`: `claveDeCifrado()` y
  `VERSION_CLAVE = 1`. `lib/cifrado/identificacion.ts`: `descifrarIdentificacion(fila)`.
- H17. `lib/identidad/esquemas.ts`: `esquemaNif` y `esquemaCif` validan y normalizan.

### Dinero y huella
- H18. `lib/dinero`: `Centimos`, `aCentimos(texto)` (lectura española), `formatearImporte`,
  `desglosarDesdeTotal(total, regimen)`, `TIPO_IVA_GENERAL = 21` y `RegimenIva`.
- H19. `lib/huella/index.ts` exporta `canonizar`, `canonizarABytes`, `normalizarNfc` y `ValorJson`.
  El patrón de vectores frente a SQL está en `lib/huella/vectores-sql.test.ts`.
- H20. `scripts/rls/00-ayudantes.sql:274-311` `pg_temp.sobre_borrador(...)` serializa `lineas` con
  `p_lineas::text`, que es la forma de jsonb: espacio tras `:` y `,`, y claves ordenadas por
  longitud. **No es JCS.** Las otras catorce claves sí salen igual que en JCS (`to_json` escapa
  igual y las claves van en orden alfabético).

### Aplicación
- H21. `app/(app)/pacientes/[id]/panel-facturacion.tsx` es un Server Component:
  - `cargar(pacienteId, rol)`;
  - el técnico solo lee `facturas_espejo_cabecera`;
  - `puedePreparar` exige paciente activo, estado `sin_enviar` o `fallido`, y ser administrador o
    `b.profesional_id === usuario.id`;
  - el nombre del programa sale de `proveedorActivo()` (`@/lib/facturacion/registro`).

  `acciones-facturacion.ts` es el patrón de las acciones: `'use server'`, `exigirSesion()`, `z.uuid()`,
  traduce el error por código y fragmento, y llama a `revalidatePath`.
- H22. `app/(app)/pacientes/[id]/datos.ts` (`server-only`): `cargarPaciente` y `cargarRol` (con
  `cache` de React) y `cargarIdentificacion`. `panel-datos.tsx:98` **enseña el DNI en la ficha**,
  leído con rastro (ADR-060).
- H23. Primitivas que existen en `components/ui/`: `dialogo.tsx` (con foco atrapado, devolución de
  foco, cierre exterior y `focoInicial`), `seleccion.tsx` (`<select>` nativo compatible con
  `register()`), `field.tsx`, `area-texto.tsx`, `casilla.tsx`, `button.tsx` y `piezas.tsx`. **No
  falta ninguna primitiva** para este ticket.
- H24. Next 16 (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md` y `forms.md`):
  - una acción es un POST público: hay que autenticar, validar y acotar lo que devuelve dentro;
  - `revalidatePath` o `refresh` vuelven a pintar **la ruta actual** en la misma respuesta;
  - `useActionState(accion, inicial)` añade `prevState` como primer argumento;
  - las acciones se despachan una a una por cliente;
  - el cuerpo tiene un límite de 1 MB.
- H25. `vitest.bd.config.ts` (`npm run test:facturacion`) solo incluye
  `lib/facturacion/**/*.bd.test.ts` y carga `.env.local`. `vitest.config.ts` excluye `*.bd.test.ts`.
  El patrón de sesión real es `scripts/t032-alta.ts`: cliente anónimo más
  `signInWithPassword(<usuario>@psicogestion.test, psico1234)`.

### Sin verificar (el implementador lo comprueba primero)
- S1. Que PostgREST acepte `select=importe::text,…` en esta versión. Si no, la alternativa es una
  vista o una RPC `stable` que devuelva el texto.
- S2. Los nombres de las columnas de `pacientes` que da `cargarPaciente` (nombre, apellidos,
  centro).
- S3. Si la siembra deja citas `realizada` y qué DNI tiene cada paciente sembrado.
- S4. La interfaz de `scripts/psql.mjs` para correr SQL desde una prueba.
- S5. El nombre de la columna de `auditoria` que guarda los datos.
- S6. Si una cita `realizada` exige un `inicio` pasado. Afecta a las anclas del banco 32.
- S7. Si `formulario-cobro.tsx` usa `zodResolver` (sí lo usan `agenda/nueva/formulario-alta.tsx` y
  `ajustes/facturacion/formulario-clave.tsx`).

---

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/20261015120000_editor_borrador.sql` (sí hace falta)

No añade tablas ni columnas. Añade dos RPC y un disparador.

**A. `public.anadir_version_borrador`**: es el único camino de la aplicación para escribir una
versión.

```sql
create function public.anadir_version_borrador(
  p_borrador_id          uuid,
  p_descartado           boolean,
  p_centro_id            uuid,
  p_destinatario_nombre  text,
  p_nif_cifrado          text,   -- base64 o null (los tres a la vez)
  p_nif_nonce            text,
  p_nif_etiqueta         text,
  p_lineas               jsonb,
  p_base_centimos        bigint,
  p_cuota_centimos       bigint,
  p_total_centimos       bigint,
  p_creada_en            timestamptz,
  p_contenido_canonico   text
) returns integer               -- numero_version que asignó la base
language plpgsql
security invoker
set search_path = ''
```

- El cuerpo es un `insert into public.borradores_factura_versiones (borrador_id, algoritmo_version,
  contenido_canonico, centro_id, destinatario_nombre, destinatario_nif_cifrado, _nonce, _etiqueta,
  _clave_version, lineas, base, cuota_iva, total, descartado, creada_por, creada_en) values (…)`, con
  estos valores:
  - `algoritmo_version = 1`;
  - `decode(p_x, 'base64')`;
  - `clave_version = case when p_nif_cifrado is null then null else 1 end`;
  - importes `p_x_centimos::numeric / 100`, sin pasar por flotantes;
  - `creada_por = (select auth.uid())`;

  y termina con `returning numero_version`.
- Si los tres del NIF no son todos nulos o todos no nulos, 22023 «El NIF del destinatario va
  completo o no va (T-046)». La restricción de tabla haría lo mismo, pero con este mensaje la
  aserción tiene un fragmento propio.
- Al ser invoker, se aplican la RLS de la tabla y los cuatro disparadores. **No reimplementa ninguna
  comprobación.**

**B. `public.crear_borrador`**: crea la cabecera y la versión 1 en una sola sentencia (CA7).

```sql
create function public.crear_borrador(
  p_borrador_id uuid, p_paciente_id uuid, p_profesional_id uuid,
  <los mismos once parámetros de A desde p_centro_id, sin p_descartado>
) returns integer
language plpgsql security invoker set search_path = ''
```

- Hace `insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por)` con
  `auth.uid()`, y después `return public.anadir_version_borrador(p_borrador_id, false, …)`.
- Una RPC de PostgREST es una transacción: si la versión falla, la cabecera no queda.

**C. Disparador `validar_citas_version_borrador`**: `before insert on borradores_factura_versiones
for each row`. Ejecuta `public.fn_validar_citas_version_borrador()`, que es `security definer`,
`volatile`, `set search_path = ''`, con `revoke execute … from public, anon, authenticated,
service_role`.

- El nombre empieza por `v`, así que corre **después** de los tres `sellar_*`: los permisos (42501)
  y la congelación salen antes que cualquier lectura de `citas`. No casa con 31.A10 (H8).
- Orden del cuerpo:
  1. `if current_setting('role', true) not in ('authenticated','anon') then return new;` (H9).
  2. `if new.descartado then return new;`. Descartar nunca se atasca, y una versión descartada no
     retiene ninguna cita.
  3. `v_previas` son los `cita_id` de la versión `new.numero_version - 1` del mismo borrador, **si
     esa versión no está descartada**; si lo está, o no existe, el conjunto queda vacío.
     `numero_version` ya lo fijó el sellado.
  4. `v_nuevas` son los `cita_id` no nulos de `new.lineas`. Si hay alguno repetido dentro de la
     versión, 23514 **«La misma cita aparece dos veces en el borrador (T-046)»**. Esta comprobación
     se hace sobre la versión entera.
  5. Para cada cita de `v_nuevas` que no esté en `v_previas`, en orden ascendente de uuid, se toma
     `pg_advisory_xact_lock(hashtextextended('borrador_cita:' || cita_id, 0))`. Después:
     - estado distinto de `realizada` → 23514 **«La cita de la línea no está realizada (T-046,
       P-D1a)»**;
     - `c.profesional_id` distinto del `profesional_id` de la cabecera → 23514 **«La cita de la
       línea no es del profesional del borrador (T-046, P-D1b)»**;
     - `c.bono_id is not null` → 23514 **«La cita de la línea va en un bono (T-046, D4)»**;
     - la cita está en otro borrador (`b.id <> new.borrador_id`) cuya última versión no está
       descartada → 23514 **«La cita ya está en otro borrador sin descartar (T-046)»**.
- Las citas arrastradas de la versión anterior no se vuelven a comprobar. Así una corrección no se
  atasca por una cita que pasó a bono después; eso lo resuelve la acción (§2, D9).
- Que no exista o sea de otro paciente ya lo cubre el sellado (l.576), que corre antes.
- Los cuatro fragmentos no son prefijo unos de otros ni de ningún mensaje de T-021 o T-026a.
- `comment on function` y `comment on trigger` dicen el porqué de cada uno.

**D. Permisos**: `revoke all on function … from public, anon, authenticated, service_role` y
`grant execute … to authenticated` para A y B, como en H12.

**E.** No hay tabla nueva, así que no hacen falta las capas de solo adición. Tampoco hay rellenos.

### 1.2 Banco `scripts/rls/32-editor-borrador.sql` y su fila en `scripts/rls/README.md`

- Fijación propia, con uuid de prefijo `32320000-0000-4000-8000-…`:
  - un paciente P con profesional PRO1 asignado;
  - PRO2, otro profesional del mismo centro;
  - un técnico;
  - citas de P: realizada de PRO1 (dos), programada, cancelada, no_asistida, realizada de PRO2 y
    realizada con bono;
  - una cita de otro paciente;
  - una tarifa.
- Ancla según la regla 10 del README, con desplazamiento propuesto **+12**, añadido a la tabla de
  anclas (comprobar S6).
- `pg_temp.sobre_borrador_jcs(...)`: misma firma que `sobre_borrador`, pero las líneas van en JCS
  (`string_agg` de objetos con las claves en orden `cantidad, cita_id, concepto,
  precio_unitario_centimos, regimen_iva, tipo_iva_centesimas`, sin espacios). Es un ayudante del
  propio banco: `00-ayudantes.sql` no se toca.
- Bloques (cada negativa con su gemela, y `pg_temp.assert_lanza_codigo_msg` con el fragmento
  exacto):
  - **32.A catálogo**:
    - el orden de los disparadores `before insert` de las versiones es los tres `sellar_*` y
      después `validar_citas_version_borrador`;
    - `prosecdef` y `proconfig` (`search_path=""`) de la función.
  - **32.B ejecución**: `has_function_privilege` de A y B → `authenticated` sí; `anon` y
    `service_role` no. De la función del disparador → nadie.
  - **32.C crear**: como PRO1, `crear_borrador` con el texto de `sobre_borrador_jcs` → versión 1;
    `verificar_cadena_borrador(id)` da 0 filas.
  - **32.D CA7**: `crear_borrador` con una suma de líneas distinta del total → 23514 de T-021, y
    `count(*)` de cabeceras con ese id = 0.
  - **32.E citas**:
    - programada, cancelada, no_asistida, de PRO2, con bono, repetida y en otro borrador vivo: cada
      una con su fragmento;
    - gemelas:
      - la realizada de PRO1 entra;
      - tras descartar el otro borrador, la cita entra;
      - una corrección que arrastra una cita que pasó a bono después (bono puesto como `postgres`)
        entra;
      - descartar entra;
      - como `postgres`, una cita programada entra (exención por rol, H9).
  - **32.F permisos antes que cotejo**: el técnico y PRO2 con una cita inexistente reciben 42501
    (el del sellado o el de la cabecera), nunca el mensaje de la cita.
  - **32.G conflicto (CA3, en la base)**: `anadir_version_borrador` con el sobre de
    `numero_version` = partida+1 cuando la partida ya no es la última → 23514 «numero_version del
    sobre no es el que asigna la base».
  - **32.H congelado (CA4)**: con la fijación de T-026a (envío o evento `pendiente` insertado como
    `postgres`, como hace 31), `anadir_version_borrador`, sea corrección o descarte → 23514 «ya se
    preparó en el programa» y el `count` no cambia. Gemela: con el envío `fallido`, entra.
  - **32.V vectores**: para cada vector de `lib/economico/vectores-borrador.json`:
    - el literal `$vec$…$vec$` es igual, byte a byte, a `pg_temp.sobre_borrador_jcs(...)`;
    - `literal::jsonb = pg_temp.sobre_borrador(...)::jsonb`;
    - insertado como `postgres` en la fijación, la `huella` sellada vale el hexadecimal congelado.

### 1.3 `lib/economico/` (nuevo, la fábrica)

| Fichero | Contrato |
|---|---|
| `tipos.ts` | `type LineaBorrador = { concepto: string; cantidad: number; precio_unitario_centimos: Centimos; regimen_iva: RegimenIva; tipo_iva_centesimas: 0 \| 2100; cita_id: string \| null }`<br>`type NifCifrado = { cifrado: string; nonce: string; etiqueta: string } \| null` (base64) |
| `sobre-borrador.ts` | `construirSobreBorrador(e: EntradaSobreBorrador): { contenidoCanonico: string; normalizada: EntradaSobreBorrador }`. Entrada: `borradorId, numeroVersion, pacienteId, profesionalId, centroId \| null, creadaPor, creadaEn: Date, descartado, destinatarioNombre, nif: NifCifrado, lineas, baseCentimos, cuotaCentimos, totalCentimos`. Aplica `normalizarNfc` **una vez** a la entrada y devuelve la normalizada, que es la que va a las columnas. Uuid en minúsculas. `creada_en` = `toISOString()`. `esquema_version: 1`. `destinatario_nif` `{cifrado, clave_version: 1, etiqueta, nonce}` o `null`. Llama a `canonizar()`. No toca `lib/huella/**` |
| `vectores-borrador.json` | Seis vectores congelados: (1) NFC en concepto y destinatario (`e` + U+0301); (2) NIF nulo; (3) una línea con `cita_id` nulo; (4) NIF presente y mezcla general/exento con dos citas; (5) descartado, sin centro; (6) comillas y barra invertida en el concepto. Cada uno con su `contenido_canonico` y la huella de génesis en hexadecimal |
| `importes.ts` | `centimosDeNumeric(texto: string): Centimos` (regex `^\d+\.\d{2}$`, sin `Number(`). `calcularImportes(lineas): { base, cuota, total }`, con total = Σ cantidad×precio, G = Σ de las generales, cuota = `desglosarDesdeTotal(G,'general').cuota` si G>0 (si no, 0) y base = total − cuota. Lanza `ErrorCuotaMinima` si 0 < G ≤ 2 céntimos (A4-H1) |
| `precio.ts` | `fechaLocal(inicio: string, zona: string): string`, con `Intl.DateTimeFormat('en-CA', {timeZone})` → `AAAA-MM-DD`. `proponerLinea(cita, tarifas, tipo): { precioCentimos: Centimos \| null; regimen: RegimenIva \| null }`: la tarifa vigente (comparando `vigente_desde <= fecha`, orden por `vigente_desde desc, orden desc`) da precio **y** régimen; sin tarifa, `tarifa_base` da precio y el régimen va `null`; sin las dos, todo `null`. **No lee `tipos_terapia.regimen`** |
| `destinatario.ts` (`server-only`) | `cifrarNif(nifNormalizado): NifCifrado` (`cifrar` + `aBase64`). `arrastrarNif(fila: {cifrado, nonce, etiqueta: string \| null}): NifCifrado` (`desdeBytea` → `aBase64`; **no importa `descifrar`**) |
| `borrador.ts` (`server-only`) | El núcleo inyectable: `guardarBorrador(deps: { supabase, usuario, ahora: () => Date, claveDeCifrado, proveedor: () => string \| null }, entrada: EntradaGuardar): Promise<ResultadoGuardar>`. También `cargarEditor(deps, pacienteId, borradorId?)` y `cargarElegibles(deps, pacienteId)`. Lo detalla §1.4 |
| `*.test.ts` | `sobre-borrador.test.ts`, `vectores-borrador-sql.test.ts` (lee `scripts/rls/32-editor-borrador.sql`, extrae los `$vec$` y los compara con el JSON), `importes.test.ts`, `precio.test.ts`, `borrador.test.ts` (núcleo con un supabase falso) y `borrador.bd.test.ts` (sesión real) |

### 1.4 El núcleo `guardarBorrador`

```ts
type EntradaGuardar = {
  pacienteId: string;
  borradorId: string | null;          // null = crear
  partida: number | null;             // numero_version de partida; obligatorio al corregir
  descartar: boolean;
  destinatario: { modo: 'paciente' } | { modo: 'conservar' }
              | { modo: 'tercero'; nombre: string; tipo: 'fisica' | 'juridica'; nif: string | null };
  lineas: { cita_id: string | null; concepto: string; cantidad: number;
            precio_centimos: Centimos; regimen_iva: RegimenIva }[];
};
type ResultadoGuardar =
  | { ok: true; borradorId: string; numeroVersion: number }
  | { ok: false; error: 'no_disponible' | 'conflicto' | 'congelado' | 'descartado'
      | 'cita_no_elegible' | 'cita_en_otro_borrador' | 'cuota_minima' | 'validacion' | 'no_guardado';
      programa?: string; citas?: string[] };
```

Orden fijo:
1. Zod. La acción ya lo validó; el núcleo vuelve a hacer `parse`.
2. El rol con `rol_actual()`. Si es técnico → `no_disponible`.
3. El paciente se lee con RLS (`id, profesional_id, centro_id, nombre…`). Si no hay fila, o el
   profesional no es `profesional_id` → `no_disponible`.
4. Si se corrige:
   - la última versión se lee con RLS; si no hay fila → `no_disponible`;
   - si está descartada → `descartado`;
   - si `partida` no es la última → `conflicto`.
5. Las citas de **todas** las líneas con `cita_id` (si no es un descarte) se leen con RLS:
   - tienen que existir y ser del paciente, `realizada`, de `pacientes.profesional_id` y sin bono;
     si no → `cita_no_elegible` con sus ids;
   - no pueden estar en otro borrador vivo visible; si lo están → `cita_en_otro_borrador`.
6. El destinatario:
   - `paciente`: `rpc('leer_identificacion')` → `descifrarIdentificacion` → `cifrarNif`. Sin
     documento, NIF nulo. El nombre es el del paciente.
   - `tercero`: el nombre tecleado y `cifrarNif` del NIF ya normalizado por Zod, o nulo.
   - `conservar` (solo al corregir): el nombre y las cuatro columnas de la versión N, leídas con
     `select destinatario_nif_cifrado,…` y pasadas por `arrastrarNif`.
   - Un descarte usa siempre `conservar` y conserva las líneas.
7. `calcularImportes`; si da `ErrorCuotaMinima` → `cuota_minima`.
8. `construirSobreBorrador` con `numeroVersion = partida+1` (o 1), `creadaEn = ahora()` y
   `creadaPor = usuario.id`.
9. `rpc('crear_borrador' | 'anadir_version_borrador')` con las columnas de `normalizada`.
10. Traducción de errores: 42501 → `no_disponible`; 23514 con «no atiende a ese paciente» →
    `no_disponible`; «ya se preparó en el programa» → `congelado` (con `programa` =
    `proveedor()`); «numero_version del sobre no es» → `conflicto`; los cuatro fragmentos de §1.1.C
    → `cita_no_elegible` o `cita_en_otro_borrador`; cualquier otro → `no_guardado`, con
    `console.error(codigo, mensaje)` y **nunca la entrada**.

### 1.5 `app/(app)/pacientes/[id]/borrador/`

| Fichero | Contrato |
|---|---|
| `page.tsx` | Crear: `/pacientes/[id]/borrador`. Server Component. `await params`, como en la ficha. Si el paciente no es legible, o el rol es técnico, o el profesional no es el asignado → `notFound()`. Carga `cargarEditor` y `cargarElegibles` y pinta `<EditorBorrador modo="crear">` |
| `[borradorId]/page.tsx` | Corregir y descartar. Lo mismo; además `notFound()` si la cabecera no es legible o es de otro paciente. Si está descartado o congelado, pinta solo la lectura, con el estado y sin controles |
| `esquemas.ts` | `esquemaBorrador`, el mismo en el cliente y en la acción: líneas 1..50 (un tope del diseño); `concepto` recortado de 1..200 sin cortes de línea; `cantidad` entero 1..999 (las de sesión, 1 fijo); precio como texto español → `aCentimos` (1..99 999 999); `regimen_iva` **sin valor por defecto**, obligatorio, con el mensaje «Marca si la línea va exenta o al 21 %»; destinatario como unión discriminada; `nif` de tercero con `esquemaNif` o `esquemaCif` según `tipo`, o vacío → null; `borradorId` y `cita_id` con `z.uuid()`; `partida` entero ≥1 |
| `acciones.ts` | `'use server'`. `guardarBorradorAccion(prev, formData)` y `descartarBorradorAccion(prev, formData)`: `exigirSesion()`, `safeParse`, llamada a `guardarBorrador`, `revalidatePath('/pacientes/' + id)` y devolución de **solo** `ResultadoGuardar` (sin filas ni NIF). En caso de éxito, sin `redirect`: el cliente enseña «Guardado: versión N» y el enlace a la ficha |
| `editor-borrador.tsx` | `'use client'`, con react-hook-form y `zodResolver(esquemaBorrador)` y `useActionState`:<br>- las sesiones elegibles se marcan con `Casilla`; cada una con su fecha, precio y régimen propuestos (`Seleccion`, vacío si es `null`);<br>- «Añadir línea libre»;<br>- el destinatario se elige con un `<fieldset>` de radios: paciente, conservar (solo al corregir) o tercero (nombre, persona física o jurídica, NIF);<br>- la ayuda del concepto dice que no es sitio para nada clínico;<br>- la explicación del régimen dice qué es exento y qué es el 21 %, y que no se deduce del destinatario;<br>- los totales salen de `calcularImportes` y se pintan con `formatearImporte`;<br>- una línea cuya cita ya no es elegible se marca y bloquea el guardado hasta quitarla;<br>- el NIF guardado nunca llega: solo `tieneNif: boolean` |
| `dialogo-descartar.tsx` | `'use client'`. `Dialogo` de `components/ui/dialogo.tsx` con `focoInicial` en «Cancelar». Al confirmar, `descartarBorradorAccion`. Devuelve el foco al botón «Descartar» |
| `*.test.ts(x)` | `esquemas.test.ts`, `editor-borrador.test.tsx`, `dialogo-descartar.test.tsx`, `page.test.tsx` (`notFound` para el técnico) y `acciones.test.ts` (traduce los errores) |

### 1.6 Las demás piezas
- `panel-facturacion.tsx`: si el rol no es técnico y el usuario es administrador o el profesional
  asignado (`paciente.profesionalId === usuario.id`):
  - un enlace «Nuevo borrador» a `/pacientes/[id]/borrador`;
  - por borrador, «Corregir» a `/pacientes/[id]/borrador/[bid]` cuando el estado es `sin_enviar` o
    `fallido`, la última versión no está descartada y el usuario es administrador o
    `b.profesional_id === usuario.id`;
  - el número de la última versión («versión N»), si no se pinta ya;
  - la rama del técnico no se toca.
- `lib/i18n/es.ts`: claves `facturacion.borrador.*` con el vocabulario del ADR-078: «borrador»,
  «guardar», «corregir», «descartar» y «preparado en {programa}».
- `vitest.bd.config.ts`: `include` amplía a `lib/economico/**/*.bd.test.ts` (**fuera del territorio
  provisional**: ver §6).
- `accesibilidad/borrador.spec.ts` (E2E de humo; cubre el aviso del gate):
  1. administrador, a 360×740, en serie;
  2. paciente sembrado → Facturación → «Nuevo borrador»;
  3. una línea libre 21 % → guardar → «versión 1»;
  4. corregir el importe → «versión 2»;
  5. destinatario tercero con el CIF centinela → «versión 3»;
  6. «Descartar»:
     - el foco entra en el diálogo;
     - con Escape se cierra y el foco vuelve al botón;
     - se reabre y se confirma → «Descartado», sin ningún botón de borrar.

  Durante toda la prueba, `page.on('response')` recoge los cuerpos del editor y de la acción (el
  POST y el RSC) y comprueba que no aparecen ni el CIF centinela ni el DNI del paciente sembrado (S3).
  Deja datos, como `facturacion.spec.ts`.
- `lib/supabase/tipos-bd.ts`: se regenera con `npm run tipos` tras `db reset`.

---

## 2 · Decisiones y alternativas descartadas

- D1. **Hay migración.**
  - Sin ella, CA7 obliga a «crear la cabecera y compensar», y una tabla de solo adición no permite
    compensar.
  - Las reglas de P-D1a, P-D1b, D4 y la duplicidad quedarían solo en la aplicación, saltables por el
    grant de tabla entera (H5).
- D2. **RPC `security invoker`, no definer.** Reutiliza la RLS y los cuatro disparadores sin repetir
  la política (`.claude/rules/supabase.md`, «definer repite política»). Descartado el definer.
- D3. **Las RPC no construyen el sobre.** El sobre lo hace TypeScript, por la tarea 1 y por T-021
  D12; la base lo coteja. Descartado construirlo en SQL, porque dejaría el constructor TS sin uso
  real.
- D4. **Endurecer P-D1b (y P-D1a, D4 y la duplicidad) en la base**, en un disparador nuevo y no
  tocando el sellado. Redefinir `fn_sellar_version_borrador` volvería a abrir T-021 y sus vectores.
- D5. **El disparador solo comprueba las citas nuevas respecto a la versión anterior viva.** Las
  arrastradas no se recomprueban: descartar y corregir el importe no se bloquean por un cambio
  posterior de la cita. Descartado recomprobar todas en la base, porque una cita que pasa a bono
  dejaría el borrador sin poder descartarse.
- D6. **Duplicidad de cita entre borradores vivos: se impide en la base**, con un candado
  consultivo por cita y la función `volatile`, que relee después de esperar. Descartado impedirlo
  solo en pantalla: dos pestañas lo saltan. Descartado un índice único: `lineas` es jsonb y no hay
  tabla de líneas.
- D7. **Exención por rol (`authenticated`/`anon`)**, como el paso 6.5: protege 26.J34 y las
  fijaciones de `postgres`.
- D8. **Conflicto (CA3) por el cotejo de `numero_version` que ya existe**: el sobre lleva
  partida+1. No hace falta un parámetro nuevo ni un `if` propio; la acción lo comprueba antes para
  dar el mensaje sin llegar a la base.
- D9. **Una cita que pasa a bono, o deja de estar realizada, después de entrar en un borrador
  vivo.** La acción exige que **todas** las citas de una versión no descartada sigan siendo
  elegibles. El editor marca la línea y obliga a quitarla para guardar. Descartar siempre se puede.
  El bloqueo en origen (no asignar un bono a una cita que está en un borrador vivo) es de T-027 y
  se anota como hallazgo.
- D10. **Un borrador descartado no se corrige.** La acción responde `descartado` y la pantalla no lo
  ofrece. En la base no se prohíbe (no es un criterio), pero el disparador trata como nuevas las
  citas que siguen a una versión descartada.
- D11. **El editor nunca descifra el NIF guardado.** «Conservar» arrastra los bytes (hex → base64).
  Corregir el NIF de un tercero exige volver a teclearlo. Así no hace falta función de lectura nueva
  ni su rastro (D2 del contrato), y la reserva no la lleva.
- D12. **El destinatario paciente se relee por `leer_identificacion()` y se recifra con un nonce
  nuevo**, en lugar de copiar el criptograma de `pacientes_identificacion`. Así se cumple el
  contrato al pie de la letra (rastro y cifrado en servidor).
- D13. **`profesional_id` de la cabecera = `pacientes.profesional_id`.** Lo exige
  `fn_validar_cabecera_borrador`. Al crear, el administrador no elige profesional.
- D14. **`centro_id` = el centro actual del paciente** en cada versión. Es uno de los tres valores
  que acepta el sellado (6.2.bis). La alternativa de dejarlo siempre nulo se descarta, porque
  pierde el dato de en qué centro se preparó.
- D15. **Importes en céntimos de punta a punta.**
  - Las tarifas se leen como texto (`importe::text`) y pasan por `centimosDeNumeric`.
  - La RPC recibe `bigint` y divide en SQL.
  - La cuota se calcula sobre la suma general, no línea a línea. Línea a línea podría salirse de la
    banda.
- D16. **Cantidad**: 1 fija en las líneas de sesión (una línea por sesión, D1). En la libre se puede
  editar de 1 a 999, con 1 por defecto. El precio va de 1 céntimo en adelante: «nunca un 0
  silencioso».
- D17. **A4-H1 se resuelve en la aplicación**: si el importe general es de 1 o 2 céntimos, la
  aplicación rechaza con su propio mensaje. No se toca la cota de T-021.
- D18. **El editor es una ruta propia, no un diálogo dentro del panel.** Un formulario de N líneas no
  cabe a 360 px en un diálogo. Además, `revalidatePath` vuelve a pintar el editor y no la ficha, que
  pinta el DNI (H22, H24). Eso deja limpia la ventana de CA5.
- D19. **No hay `redirect` tras guardar.** El resultado se pinta en el editor y la vuelta a la ficha
  es un enlace. El DNI que pinta la ficha es una lectura legítima con rastro (ADR-060) y queda fuera
  de la ventana de CA5 (pregunta P2).
- D20. **El concepto propuesto es «Sesión del dd/mm/aaaa».** No usa el nombre de `tipos_terapia`,
  que puede describir el tratamiento.
- D21. **Las pruebas con sesión real, en `vitest.bd.config.ts`.** La alternativa de un script suelto
  como `t032-alta.ts` se descarta: no deja evidencia que se pueda repetir.

---

## 3 · Cómo se cierra cada criterio de aceptación

| CA | Demostración |
|---|---|
| CA1 | (a) `npm test -- lib/economico`: los vectores de `sobre-borrador.test.ts` y `vectores-borrador-sql.test.ts` coinciden con los literales del banco 32. (b) 32.V en `npm run test:rls`: igualdad byte a byte con `sobre_borrador_jcs` e igualdad `::jsonb` con `sobre_borrador`, más la huella congelada al insertar. (c) `borrador.bd.test.ts`: crear, corregir dos veces y descartar con sesión real (`ana@`) → `rpc('verificar_cadena_borrador', {p_borrador_id})` da `[]`. Lo literal del CA, «byte a byte frente a `sobre_borrador()`», es imposible (H20): ver P1 |
| CA2 | `borrador.bd.test.ts`: se leen la `huella` y el `contenido_canonico` de N antes y después de crear N+1 → iguales. Comando: `grep -rnE "\.(update\|delete\|upsert)\(" lib/economico "app/(app)/pacientes/[id]/borrador"` → vacío |
| CA3 | `borrador.bd.test.ts`: dos clientes con la sesión de `ana@` y `Promise.all` de dos `guardarBorrador` con la misma `partida` → uno `ok` y el otro `conflicto`; la cuenta de versiones es N+1. En la base: 32.G |
| CA4 | 32.H: en cola o enviado → 23514 «ya se preparó en el programa» y la cuenta no cambia; `fallido` → entra. `borrador.test.ts`: con ese error, el núcleo devuelve `congelado` con el `programa`, y la pantalla pinta «Ya se preparó en {programa}: no admite cambios» (`editor-borrador.test.tsx`) |
| CA5 | `borrador.bd.test.ts`:<br>- **paciente**: el administrador fija como centinela el DNI del paciente de la fijación (por la RPC de T-032 o como `postgres` por S4). Se crea con el modo paciente → las cuatro columnas no son nulas y `descifrar` da el centinela;<br>- **tercero**: lo mismo con un CIF centinela válido;<br>- **ningún rastro en claro**: `select … where row::text like '%centinela%'` como `postgres` sobre `borradores_factura_versiones` y `auditoria` da 0;<br>- **rastro de la lectura**: hay una fila `LECTURA_IDENTIFICACION` del usuario y el paciente en los últimos 15 minutos;<br>- **NIF o CIF mal**: con el dígito de control mal, el resultado es `validacion` y la cuenta no cambia;<br>- **conservar**: corregir con `conservar` deja las cuatro columnas de N+1 iguales, byte a byte, a las de N, y el espía que envuelve `descifrar` (`vi.mock('@/lib/cifrado/aes-gcm')` sobre el original) no tiene ninguna llamada con el `cifrado` de N.<br>Respuestas al navegador: `accesibilidad/borrador.spec.ts` (§1.6) |
| CA6 | `borrador.bd.test.ts`: `tecnico@`, un profesional no asignado (`bruno@`, comprobar S3) y un uuid inexistente → los tres reciben `{ok:false, error:'no_disponible'}` idéntico (`toEqual`), y la cuenta de cabeceras y versiones del paciente (leída como administrador) no cambia. Gemelas: `admin@` y `ana@` crean. En la base: 32.F |
| CA7 | 32.D (la cabecera no queda). `borrador.bd.test.ts`: `rpc('crear_borrador')` directo con un total mal → error, y `select` de la cabecera con ese id como administrador → 0 filas |
| CA16 | `borrador.bd.test.ts`: dos realizadas de la fijación → dos líneas con su `cita_id`. `cargarElegibles` no devuelve la cita con bono. `borrador.test.ts`, con un supabase falso: la cita con bono, la de otro paciente, las `programada`, `cancelada` y `no_asistida`, y la de otro profesional → `cita_no_elegible` y la `rpc` **no se llama**; gemela: la elegible llega a `rpc`. En la base: 32.E |
| Migración | `npx supabase db reset` sin errores. `select max(version) from supabase_migrations.schema_migrations` = `20261015120000`. `npm run lint:migraciones` con 0 hallazgos. `npm run test:rls` con el 32 en verde |
| CA8 | `lib/economico/precio.test.ts`: una cita el 2026-03-29 a las 00:30 en `Europe/Madrid` (22:30Z del 28), con la tarifa vigente desde el 29, toma la del 29; segunda zona `America/Santiago`. Sin tarifa → `tarifa_base`. Sin las dos → `null`. `esquemas.test.ts`: un precio vacío se rechaza |
| CA9 | `importes.test.ts`: exento → cuota 0; general 60,00 € → cuota = `desglosarDesdeTotal(6000,'general').cuota`; mezcla → la cuota solo de las generales; Σ líneas = total; 1 y 2 céntimos generales → `ErrorCuotaMinima`. Comando: `grep -rn "Number(" lib/economico "app/(app)/pacientes/[id]/borrador"` → vacío, o lo que salga se lista en la evidencia (índices, nunca importes) |
| CA10 | `precio.test.ts`: con `tipos_terapia.regimen='general'` y sin tarifa del paciente, el régimen es `null`. `esquemas.test.ts`: un régimen vacío se rechaza en la línea libre y en la de sesión sin tarifa. `borrador.bd.test.ts`: una tarifa exenta cambiada a general sella `general` y 2100. `editor-borrador.test.tsx`: el texto que explica exento frente a 21 % está en el DOM |
| CA17 | `borrador.bd.test.ts`: una sola línea libre al 21 % → entra, con la cuota de `lib/dinero`. `esquemas.test.ts`: sin concepto, sin importe o sin régimen → rechazo (la acción no llama al núcleo) |
| CA11 | `panel-facturacion.test.tsx`: para el técnico, `queryByRole('link', {name: /nuevo borrador/i})` es nulo; para el administrador y el asignado, está. `page.test.tsx`: técnico → `notFound`. Comando: `grep -rn "/borrador" "app/(app)/agenda"` → vacío |
| CA12 | `grep -rniE "\b(emitir\|facturar\|expedir\|aprobar\|crear factura\|verifactu)\b" lib/economico "app/(app)/pacientes/[id]/borrador" accesibilidad/borrador.spec.ts` más `git diff main -- lib/i18n/es.ts \| grep '^+' \| grep -iE …` → vacío |
| CA13 | `grep -rnE "use cache\|unstable_cache" lib/economico "app/(app)/pacientes/[id]/borrador"` → vacío |
| CA14 | Manual, según el guion del contrato, con capturas a 360 px en `tickets/T-046/` |
| CA15 | `npm test`, `npm run test:a11y`, `npm run test:rls`, `npm run test:facturacion` (incluye `lib/economico`), `npm run lint`, `npx next build --webpack` (H: junction) y `node ~/.claude/pipeline/territorio.mjs T-046` dentro del worktree |

---

## 4 · Riesgos, por probabilidad

1. **Alta: el texto TS no coteja con el sellado.** Puede fallar por NFC aplicado solo al sobre y no
   a las columnas, por un uuid en mayúsculas o por los milisegundos de `creada_en`. Se mitiga con el
   `normalizada` único, los vectores frente a 32.V y el `bd.test` real.
2. **Alta: el reloj de Docker en Windows se desvía** tras suspender el equipo, y el sellado da 23514
   «creada_en se aparta…». El núcleo lo traduce a `no_guardado`; la evidencia anota
   `wsl --shutdown` si aparece.
3. **Media: flotantes.** PostgREST sirve `numeric` como número JSON. Hay que leerlo con `::text`
   (S1). Si el cast no va, se necesita una RPC `stable` de lectura, y esa iría en la misma migración.
4. **Media: el orden y el nombre del disparador** (H8). Si se elige otro nombre, rompe 31.A10, o
   corre antes que los permisos y abre un oráculo de existencia de citas. 32.A lo fija.
5. **Media: banco 26 y fijaciones como `postgres`** (H9). Si se olvida la exención por rol, 26.J34
   se pone en rojo.
6. **Media: datos de las pruebas.** `test:facturacion` no es idempotente y la base de `test:rls` es
   compartida. Hacen falta uuid y nombres únicos por pasada en el `bd.test`; la fijación del banco
   va en `begin…rollback`.
7. **Media: CA5 en el E2E.** Si alguna respuesta vuelve a pintar la ficha (redirect o enlace con
   prefetch), el DNI del panel de datos aparece. La ventana de recogida tiene que acabar antes de
   volver a la ficha.
8. **Baja: interbloqueo de candados por cita.** Se toman en orden de uuid y después del candado del
   borrador, siempre en el mismo orden.
9. **Baja: el límite de 1 MB del cuerpo.** Con 50 líneas sobra.

---

## 5 · Qué revisar

**Entradas que elige el llamante, y su efecto**
- En `anadir_version_borrador` y `crear_borrador`:
  - `p_borrador_id`: la RLS y el paso 0 deciden;
  - `p_profesional_id`: la cabecera exige que sea el del paciente;
  - `p_centro_id`: el paso 6.2.bis;
  - `p_creada_en`: ±1 minuto;
  - `p_contenido_canonico`: el cotejo por valor;
  - `p_lineas`: el sellado, las cotas y el disparador nuevo;
  - los importes: la suma.
- Revisar que **no hay** parámetro para `creada_por`, `numero_version`, `paciente_id` de la versión,
  `huella` ni `algoritmo_version`.
- Que la acción **no** acepte `profesional_id` ni `centro_id` del formulario.
- Que `destinatario.modo='conservar'` en una creación sea un error de Zod.

**Pruebas que tienen que fallar, y por qué motivo exacto**
- Cada negativa de 32.E falla con **su** fragmento, no con el 42501 ni con el mensaje de la línea
  de T-021.
- Si se quita el disparador, 32.E pasa a «no lanza». Si se quita la exención por rol, 26.J34 falla.
- 32.D: si se convierte `crear_borrador` en dos llamadas separadas, el `count` de la cabecera es 1.
- CA3: si se quita `numero_version: partida+1` del sobre (y se usa el máximo leído en el momento),
  las dos correcciones entran.
- CA5 «conservar»: si `arrastrarNif` se cambia por descifrar y volver a cifrar, el espía ve el
  `cifrado` de N y las columnas difieren.
- CA6: las tres respuestas tienen que ser `toEqual` entre sí, no solo «error».

**Invariantes que se pueden saltar por otra puerta**
- **Grant de tabla entera** en las versiones (H5): un `insert` directo por PostgREST se salta la
  acción. Por eso P-D1a, P-D1b, D4 y la duplicidad van en el disparador, y 32.E las prueba con
  `insert` directo, no solo por la RPC.
- **Null**:
  - `cita_id` nulo no pasa por el disparador (línea libre, correcto);
  - si el NIF llega parcial, 22023;
  - `regimen_iva` nulo no puede llegar: Zod sin valor por defecto, y el sellado.
  - `tarifa_base` nula → precio nulo, nunca 0.
- **Duplicados**: la misma cita dos veces en una versión, y en dos borradores vivos, incluido de
  forma concurrente (candado más relectura `volatile`). Repasar que la consulta de «otro borrador
  vivo» use la última versión **de cada borrador** y no cualquier versión.
- **Concurrencia**: dos correcciones (CA3), corregir mientras se encola (`for key share` de T-026a)
  y descartar mientras se añade la cita a otro borrador (resultado conservador: rechazo).
- **Permisos antes que cotejo**: el técnico con un `cita_id` ajeno ve el 42501, no el mensaje de la
  cita (32.F). El disparador es definer y lee `citas` sin RLS: tiene que correr después de los
  `sellar_*`.
- **TRUNCATE, update y delete**: no hay tabla nueva. Comprobar que la migración no hace `grant` de
  nada sobre las tablas y que no añade `update` ni `delete` en ninguna parte.
- **Fuga del NIF**:
  - `console.error` nunca con la entrada;
  - el objeto que devuelve la acción solo tiene `ResultadoGuardar`;
  - el cliente nunca recibe columnas `destinatario_nif_*`;
  - la auditoría excluye `destinatario_nif_cifrado` (H7). Las otras tres columnas sí se auditan,
    pero sin la clave son inútiles; anotarlo si el revisor lo cuestiona.
- **Caché**: ni `use cache` ni `cache()` sobre datos del borrador. Sí es aceptable el `cache` de
  React de `cargarPaciente`, porque no persiste entre peticiones.

---

## 6 · Territorio (definitivo)

```
lib/economico/**
app/(app)/pacientes/[id]/panel-facturacion.tsx
app/(app)/pacientes/[id]/panel-facturacion.test.tsx
app/(app)/pacientes/[id]/borrador/**
lib/i18n/es.ts
accesibilidad/borrador.spec.ts
supabase/migrations/20261015120000_editor_borrador.sql
scripts/rls/32-editor-borrador.sql
scripts/rls/README.md
lib/supabase/tipos-bd.ts            # solo regenerado
vitest.bd.config.ts                 # NUEVO respecto al provisional: include de lib/economico/**/*.bd.test.ts
tickets/T-046/**
docs/bitacora/T-046*.md
docs/state.md
```

Fuera y sin tocar: `components/ui/**` (no falta ninguna primitiva, H23),
`scripts/rls/00-ayudantes.sql`, `lib/huella/**`, `lib/cifrado/**`, `lib/dinero/**`, `package.json`
y `app/(app)/pacientes/[id]/datos.ts` (solo se importa).

## 7 · Delegable

Nada. El contrato dice `delegable: no`: formulario, dinero, cifrado y cadena.

---

## Preguntas al propietario (no bloquean; cada una con recomendación)

- **P1 · CA1 «byte a byte frente a `pg_temp.sobre_borrador()`» no se puede cumplir al pie de la
  letra.** Ese ayudante escribe `lineas` como jsonb (`p_lineas::text`, con espacios y claves por
  longitud). El constructor TS emite JCS con `canonizar()`, como pide la tarea 1. Toda versión lleva
  al menos una línea, así que ningún vector coincide.
  **Recomendación:** cerrar CA1 con tres pruebas:
  - igualdad byte a byte frente a un ayudante JCS propio del banco 32 (`sobre_borrador_jcs`);
  - igualdad `::jsonb` frente a `sobre_borrador()`;
  - la huella congelada al insertar el texto TS por el disparador real.

  No se toca `00-ayudantes.sql`: está fuera del territorio y cambiaría los bytes de las fijaciones
  de otros bancos.
- **P2 · CA5, «ninguna respuesta al navegador».** La ficha pinta el DNI del paciente en el panel de
  Datos por diseño (ADR-060, `panel-datos.tsx:98`).
  **Recomendación:** que la ventana de la prueba sea el editor y la acción, desde guardar hasta ver
  el resultado. El editor no redirige a la ficha (D18 y D19).
- **P3 · Fila de `lib/economico/**` en `.claude/rules/pipeline.md`** (dueño: la fábrica). Ya lo dice
  el contrato; es solo el recordatorio.

## Hallazgos que se anotan en `docs/state.md` al cerrar
- **Para T-027**: asignar un bono a una cita que está en un borrador vivo debería impedirse en el
  origen. Hoy el editor solo lo marca (D9).
- Las citas de un paciente absorbido en una fusión no pueden entrar en un borrador del
  superviviente: el sellado exige `cita.paciente_id = borrador.paciente_id`. Requiere ticket si se
  quiere.

## Lo que no entra, y por qué
- Una función para enseñar en claro el NIF guardado, con su rastro. D11 la hace innecesaria.
- Prohibir en la base que un borrador descartado se reabra. No es un criterio; la acción y la
  pantalla ya lo impiden (D10).
- Tocar el sellado, las cotas, `00-ayudantes.sql` o `lib/huella`. Lo prohíben el contrato y el
  territorio.
- Citas de pacientes absorbidos, tutor de `representantes_paciente`, enviar (T-026b), bonos,
  rectificativas y plantillas: el contrato los deja fuera.
- Quitar el valor por defecto de `tipos_terapia.regimen`: queda fuera por P-D5.

---

## Resumen (diez líneas)

1. **Qué se construye:**
   - el editor del borrador en una ruta propia, `/pacientes/[id]/borrador[/<bid>]`, con su entrada
     en `PanelFacturacion` (solo para el administrador y el asignado);
   - el núcleo inyectable `lib/economico`: sobre TS en JCS, precio, importes y destinatario;
   - las Server Actions finas.
2. **Hay migración: `20261015120000_editor_borrador.sql`.**
   - Las RPC `crear_borrador` y `anadir_version_borrador`, invoker, crean la cabecera y la versión 1
     en una transacción (CA7).
   - El disparador `validar_citas_version_borrador` exige en la base P-D1a, P-D1b, D4 y que una cita
     no esté en dos borradores vivos, solo para `authenticated` y solo sobre las citas nuevas.
   - Banco `32-editor-borrador.sql`.
3. **Primera decisión:** endurecer las reglas de cita en la base, con un disparador nuevo nombrado
   para correr tras los `sellar_*` sin romper 31.A10. El grant de tabla entera haría saltable lo que
   solo exigiera la acción.
4. **Segunda decisión:** el editor nunca descifra el NIF guardado. «Conservar» arrastra los bytes;
   el paciente se relee por `leer_identificacion()` y se recifra. No hace falta función de lectura
   nueva.
5. **Tercera decisión:** el conflicto (CA3) sale del cotejo de `numero_version` que ya existe
   (partida+1). Una cita que pasa a bono después la para la acción, no la base: descartar nunca se
   atasca. Hallazgo para T-027.
6. **Dinero:**
   - céntimos de punta a punta: tarifas leídas como texto, `bigint` hacia la RPC y cuota sobre la
     suma general;
   - A4-H1 (1 o 2 céntimos generales) se rechaza en la aplicación;
   - el régimen nunca se toma de `tipos_terapia.regimen`.
7. **Territorio final:** el provisional más `vitest.bd.config.ts`, para las pruebas con sesión real
   de `lib/economico`. No falta ninguna primitiva de `components/ui/`.
8. **E2E de humo** `accesibilidad/borrador.spec.ts`: crear, corregir, tercero con CIF y descartar
   con el diálogo (foco, Escape y devolución) a 360 px, recogiendo las respuestas para CA5.
9. **Revisar con más cuidado:**
   - el orden y la exención por rol del disparador;
   - la relectura `volatile` tras el candado por cita;
   - que el texto TS y las columnas salgan de la misma entrada normalizada;
   - que nada devuelva ni registre el NIF.
10. **Preguntas al propietario:**
    - P1: CA1 «byte a byte frente a `sobre_borrador()`» es imposible (jsonb frente a JCS); se
      recomiendan tres pruebas en su lugar;
    - P2: la ventana de CA5 frente al DNI que pinta la ficha;
    - P3: la fila de `lib/economico` en `pipeline.md`.

## Respuestas del propietario (16-10-2026)

- **P1**: aceptada la recomendación. CA1 se cierra con tres pruebas: byte a byte frente a un ayudante JCS propio del banco 32, igualdad como jsonb frente a `pg_temp.sobre_borrador()`, y huella congelada del disparador real.
- **P2**: aceptada la recomendación. La prueba de CA5 mira solo las respuestas del editor y de sus acciones; la ficha queda fuera (ADR-060).
- **P3**: la fila de `lib/economico/**` en `.claude/rules/pipeline.md` la añade el propietario; no bloquea.
- **Diseño aprobado** para implementación.
