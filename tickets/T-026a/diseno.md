# T-026a · Diseño — programa de facturación sin red

Arquitecto, 06-10-2026. Contrato: `tickets/T-026a-proveedor-facturacion-sin-red.md`.

**Este diseño es un delta sobre `tickets/T-026/diseno.md`.** Aquel documento sigue mandando en todo
lo que no se cambia aquí: nombres, firmas, columnas, códigos de error y bloques del banco. Este
fichero recoge cuatro cosas:
- lo que han movido T-021 (rondas 3 y 4), T-023 y T-049 desde que se escribió;
- los nombres que allí quedaron abiertos, ya cerrados;
- el banco con su fijación concreta;
- las comprobaciones de cada criterio, CA1 a CA25.

Donde los dos documentos choquen, **gana este**. El implementador no elige nada.

**Orden de arranque.** T-026a no se implementa hasta que T-021, T-043 (`20261012120000`) y T-023
(`20261013120000`, hoy solo diseñado) estén en `main`. La migración es `20261014120000`.

Antes de lanzar el verificador:
- `ls supabase/migrations | tail -3` en la rama: tiene que acabar en `20261014120000`;
- `select max(version) from supabase_migrations.schema_migrations` tiene que dar `20261014120000`.

Un `db reset` hecho desde `main` pierde la migración de la rama (memoria «Branch migration before
verifying»).

Antes de escribir la ruta o el panel, lee estas guías de `node_modules/next/dist/docs/`:
- `01-app/01-getting-started/15-route-handlers.md`;
- `03-api-reference/04-functions/connection.md`;
- `03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`.

---

## Preguntas abiertas al propietario

**Ninguna bloquea el diseño.** Q0-Q6 están respondidas o cerradas (contrato, Contexto). Las tres
decisiones de abajo parecían preguntas, pero se resuelven con un ADR o con lo fusionado:

- **Quién puede pulsar «Preparar»** (`encolar_envio_borrador`). Copia
  `borradores_factura_versiones_alta` tal como está en `main`: el administrador, o el profesional
  que es **autor y está asignado**. No copia la de lectura, que basta con estar asignado.
  - Encolar congela el borrador (§1.5.6 de T-026), así que es una escritura, no una lectura.
  - Si el propietario resuelve P-R3.1 de T-021 de otra forma, cambia la política de alta y esta
    réplica con ella. Queda anotado en «Para `docs/state.md`».
- **Con qué clave se descifra el NIF del destinatario.** Con `identificacion_cifrado_v1`, a través
  de `claveDeCifrado()` (`lib/cifrado/claves.ts:38`). La columna solo admite la versión de clave 1
  (`20261011120000:136`) y es la única clave AES del proyecto.
  - Es un contrato con T-046, el editor que cifra. Va a «Para `docs/state.md`».
- **El texto de las notificaciones.** Son textos fijos que cumplen el ADR-078 y están cerrados en
  §1.4. No es una decisión del propietario.

**Por verificar.** Son hechos que no llegué a abrir. Cada uno dice dónde se mira, y el implementador
lo comprueba antes de escribir la pieza:
- **V1.** Firma de `pg_temp.como(...)` y de `pg_temp.como_con_2fa(...)`: `scripts/rls/00-ayudantes.sql`.
- **V2.** Cómo inserta `26-economico.sql` (bloque B, la cadena de tres versiones) una versión 2 sobre
  un borrador que ya tiene la 1, con `sobre_borrador(..., p_numero_version)`. Se copia ese patrón
  para BORRC.
- **V3.** Si la ficha ya tiene un *error boundary* por bloque: `app/(app)/pacientes/[id]/ficha-cliente.tsx`.
  Si no lo tiene, vale la decisión D8 (try/catch en servidor).
- **V4.** Firma de `AvisoDeError`: `components/ui/piezas.tsx:257`.
- **V5.** Si `rol_actual()` devuelve el rol de un perfil `baja` o `suspendido`: su definición
  vigente, con `grep -ln "function public.rol_actual" supabase/migrations/*.sql | tail -1`.
  - Pase lo que pase, las funciones de §1.4 exigen además `perfiles.estado = 'activo'`.
- **V6.** Credenciales del administrador sembrado para el spec de Playwright: `scripts/seed.mjs` y
  `accesibilidad/acceso.spec.ts`.
- **V7.** Si las RPC de administración de T-041 (`dar_alta_centro`) exigen `aal2`.
  - Si lo exigen, `guardar_clave_proveedor_facturacion` y `quitar_proveedor_facturacion` copian
    esa guarda, y el spec entra con segundo factor.

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | La base local está en `20261012120000` (T-043 aplicada). En `main`, las migraciones acaban en `20261011140000` | `supabase_migrations.schema_migrations`; `ls supabase/migrations` |
| H2 | La política vigente `borradores_factura_lectura` es `((select rol_actual()) = 'administrador' OR ((select rol_actual()) = 'profesional_sanitario' AND es_profesional_asignado(paciente_id)))`. **No** compara `profesional_id`. La redefine la ronda 3 | `20261011130000_economico_ronda_3.sql:67`; `pg_policies` |
| H3 | La política vigente `borradores_factura_versiones_alta` es: admin, o profesional con `exists` sobre la cabecera, `b.profesional_id = auth.uid()` y `es_profesional_asignado(b.paciente_id)` | `pg_policies` |
| H4 | La política `cobros_lectura` tiene tres ramas. La del técnico es `paciente_id IN (select p.id from pacientes p where p.centro_id in (select centros_actuales()))`. `cobros_alta` añade `registrado_por = auth.uid()` | `pg_policies` |
| H5 | En `borradores_factura_versiones` hay tres disparadores BEFORE INSERT: `sellar_version_borrador` (definer, con el paso 0 de permisos solo para authenticated y anon y el mensaje 42501 «No puedes añadir una versión a este borrador: …») y `sellar_version_borrador_cotas` (invoker, tres 23514). Se ejecutan por orden alfabético | `20261011120000:331-347`; `20261011130000:78,129`; `20261011140000:16`; `pg_trigger` |
| H6 | Columnas de las versiones: `id, borrador_id, numero_version, huella, huella_anterior, algoritmo_version, contenido_canonico, paciente_id, profesional_id, centro_id, destinatario_nombre, destinatario_nif_cifrado, destinatario_nif_nonce, destinatario_nif_etiqueta, destinatario_nif_clave_version, lineas, base, cuota_iva, total, descartado, creada_por, creada_en`. La versión de clave es `destinatario_nif_clave_version`, no `version_clave` como dice T-026 §1.5.4 | `information_schema.columns` |
| H7 | En las líneas, `precio_unitario_centimos` es **con IVA**, igual que `total` | `20261011120000:155-161` |
| H8 | La cabecera `borradores_factura(id, paciente_id, profesional_id, creado_por, creado_en)` tiene el disparador `validar_cabecera_borrador`, que exige `profesional_id` = el profesional del paciente (o el del paciente en que se fusionó) | `fn_validar_cabecera_borrador` (catálogo) |
| H9 | `cobros` tiene los disparadores `auditar_cobros` e `impedir_*`. T-023 añade `validar_cobro` (BEFORE INSERT, invoker): 23514 «no puede ser posterior a hoy». Por orden alfabético va antes que `validar_cobro_factura_espejo` | `tickets/T-023/diseno.md` §1.1 (b) |
| H10 | `eventos_salientes(id, tipo, carga, estado, intentos smallint, ultimo_error, proximo_intento, clave_idempotencia text unique, creado_en, actualizado_en, creado_por)`. `tipo` tiene un check `'^[a-z0-9_]+\.[a-z0-9_]+$'`. Hay un índice parcial sobre `proximo_intento` con `where estado='pendiente'`. RLS activa y ninguna política | `20260910120000:32,48-75` |
| H11 | Columnas de `notificaciones`: `perfil_id, tipo, titulo, detalle (no vacío), origen_tabla, origen_id`. El índice `notificaciones_origen_unico (perfil_id,tipo,origen_tabla,origen_id) where origen_id is not null` exige repetir el predicado en `on conflict`. El patrón de destinatarios es `escalar_notas_pendientes` | `20261006120000:11-22,440-482`; `pg_constraint` |
| H12 | `fn_auditar()` acepta INSERT, UPDATE y DELETE. `TG_ARGV[0]` es la columna clave y el resto son columnas omitidas. `auditoria.registro_id` es `text`, así que la clave `unico` da `'true'` | catálogo; `auditoria` |
| H13 | `cobertura_solo_adicion()` devuelve una tabla. La comprobación es `select count(*) … = 0` | `scripts/rls/10-solo-adicion.sql:62` |
| H14 | El banco corre en una sola transacción con `rollback` y por orden alfabético. `01` fija PRO1, PRO2, TEC1, ADM, CA, CB, P1 (PRO1, CA) y P2 (PRO2, CB). BORR1 es de PRO1 sobre P1. `pg_temp.linea_borrador` y `pg_temp.sobre_borrador` existen | `scripts/test-rls.mjs:48-55`; `01-fijacion.sql:4-30,87-89,228-240`; `00-ayudantes.sql:274-338` |
| H15 | Módulos libres: el 31 lo está, y el 29 es de T-043. Desplazamientos de año libres: +2, +5, +9 y +11 | `ls scripts/rls`; `README.md` punto 10 |
| H16 | Extensiones: pg_cron 1.6.4, pg_net 0.20.4 y supabase_vault 0.3.1. `vault.create_secret` y `vault.update_secret` son definer, y `postgres` tiene DELETE sobre `vault.secrets`. Firma: `net.http_post(url, body jsonb, params jsonb, headers jsonb, timeout_milliseconds)` | catálogo |
| H17 | `app/api/avisos/route.ts`: `connection()` de `next/server`, `Cache-Control: private, no-store` y `Response.json` | `app/api/avisos/route.ts:1-56` |
| H18 | `proxy.ts`: `RUTAS_PUBLICAS = ['/login', '/prototipo']` y el emparejamiento `=== ruta \|\| startsWith(ruta+'/')`. El *matcher* incluye `/api` | `proxy.ts:10,59-61,124` |
| H19 | En la ficha, `Cuerpo` pasa `facturacion={<Facturacion />}`, que es un estado vacío. `cargarRol()` y `cargarPaciente()` usan `cache` de React, que es por petición y no es `use cache` | `app/(app)/pacientes/[id]/page.tsx:108-164`; `datos.ts:41,73` |
| H20 | `AccesosDeAdministracion` sale de `exigirSesion`, que devuelve `estadoDeCuenta`, y no pinta nada si el usuario no es administrador. Los enlaces comparten className y la clave i18n va en `ajustes.acciones.*` | `app/(app)/ajustes/page.tsx:18-63`; `lib/i18n/es.ts:113-130` |
| H21 | El patrón de una página solo para el administrador es `ajustes/centros/page.tsx`: un componente interno async y `redirect('/ajustes')` | `app/(app)/ajustes/centros/page.tsx:1-54` |
| H22 | Primitivas disponibles: `Dialogo{abierto, alCerrar, titulo, focoInicial, ancho}`, `Pildora{tono: success\|info\|warning}`, `Cargando{filas}`, `AvisoDeError`, `EstadoVacio`, `Button` y `Field` | `components/ui/dialogo.tsx:9-23`; `piezas.tsx:83,211,240,257` |
| H23 | Vitest corre en jsdom, con `server-only` sustituido por un stub e `include **/*.test.ts(x)`. Ya existen los scripts `test:rls`, `lint:migraciones`, `tipos` y `test:a11y` (Playwright) | `vitest.config.ts`; `package.json:7-19` |
| H24 | `lib/cifrado/aes-gcm.ts` exporta `descifrar(clave, {cifrado, nonce, etiqueta})`. `lib/cifrado/bytea.ts` exporta `desdeBytea(texto)`. `claveDeCifrado()` es server-only y tiene un caché del módulo para la clave, no para datos | `lib/cifrado/*.ts` |
| H25 | `lib/i18n/sin-literales.test.ts` recorre `app` y `components`: todo texto visible va al catálogo | `lib/i18n/sin-literales.test.ts:13-30` |
| H26 | POST de un route handler: nunca se cachea. `maxDuration` está permitido con cacheComponents, y `dynamic`, `revalidate` y `fetchCache` no | `next/dist/docs/01-app/01-getting-started/15-route-handlers.md:43,51,89`; `route-segment-config/index.md:19` |

---

## 1 · Piezas y contratos

El mapa de ficheros es el de T-026 §1.1, sin cambios. Lo que sigue son los deltas y los nombres
cerrados.

### 1.1 Migración `supabase/migrations/20261014120000_proveedor_facturacion.sql`

El orden de las secciones es el de T-026 §1.5.1-§1.5.10, con estos cambios.

**(a) §1.5.2 · Tablas.** Las tablas son las de T-026, sin cambios: `borradores_factura_envios`,
`facturas_espejo` y `facturas_anotaciones`.

Cada una lleva, en este orden:
1. `alter table … enable row level security`.
2. `revoke all on table public.<t> from public, anon, authenticated, service_role`.
3. `revoke update, delete, truncate on table public.<t> from postgres`.
4. `grant select on table public.<t> to authenticated`.
5. El disparador `impedir_modificacion_<t>`: `before update or delete`, `for each row`,
   `execute function public.fn_impedir_modificacion()`.
6. El disparador `impedir_truncado_<t>`: `before truncate`, `for each statement`, la misma función.
   Antes de escribirlo, comprueba cómo lo hace T-021 en `20261011120000` (`grep -n impedir_truncado`)
   y copia el patrón.
7. `create trigger auditar_<t> after insert on public.<t> for each row execute function public.fn_auditar('id')`.
8. `insert into public.tablas_solo_adicion …`, con las mismas columnas que la sección de T-021 en
   `20261011120000:1082-1090`.

**(b) Disparador `validar_envio_borrador`.** Lo ejecuta la función
`public.fn_validar_envio_borrador()`, que es definer, con `set search_path = ''`. Comprueba, en este
orden:
1. Que la versión `new.version_id` existe. Si no, 23503 «la versión del envío no existe».
2. Que `v.borrador_id = new.borrador_id` y `v.numero_version = new.numero_version`. Si no, 23514
   «la versión no es la del borrador del envío».
3. Que `new.paciente_id` es el `paciente_id` de la cabecera. Si no, 23514 «el paciente del envío no
   es el del borrador».

Cada mensaje lleva un fragmento único.

**(c) §1.5.3 · Lectura.** Las tres políticas `*_lectura` se quedan como en T-026: `for select to
authenticated using (exists (select 1 from public.borradores_factura b where b.id = borrador_id))`.
Heredan la regla vigente de H2 sin copiarla.

La vista `facturas_espejo_cabecera` (`security_invoker = false`, `security_barrier = true`) cambia
**solo** la rama del profesional. Su `where` es exactamente:

```sql
where (select public.rol_actual()) = 'administrador'::public.rol_usuario
   or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
       and public.es_profesional_asignado(e.paciente_id))
   or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
       and e.paciente_id in (select p.id from public.pacientes p
                              where p.centro_id in (select public.centros_actuales())))
```

- `e.paciente_id` es igual a `b.paciente_id` por construcción: lo deriva `registrar_factura_espejo`
  del envío, y el envío lo valida contra la cabecera en (b).
- Usar `e.paciente_id` evita un join, y es carácter a carácter la rama de H2 con `e.` delante.
- La diferencia con T-026 (que añadía `b.profesional_id = auth.uid()`) va a la bitácora.
- Columnas: `id, paciente_id, proveedor, numero, fecha_expedicion, base, cuota_iva, total, url_proveedor, copiado_en`.
- `grant select … to authenticated` y `revoke all … from public, anon, service_role`.

**(d) §1.5.4 · Funciones de `service_role`.** Las firmas son las de T-026, y las cuatro columnas del
NIF del retorno de `reclamar_envios_facturacion` quedan cerradas. Retorno completo:

```sql
returns table (
  evento_id uuid, borrador_id uuid, version_id uuid, numero_version integer,
  destinatario_nombre text,
  destinatario_nif_cifrado bytea, destinatario_nif_nonce bytea,
  destinatario_nif_etiqueta bytea, destinatario_nif_clave_version smallint,
  lineas jsonb, fecha_documento date, ya_enviado_documento_id text)
```

- En `lineas` va `jsonb_agg(jsonb_build_object('cantidad', l->'cantidad', 'precio_unitario_centimos', l->'precio_unitario_centimos', 'regimen_iva', l->'regimen_iva', 'tipo_iva_centesimas', l->'tipo_iva_centesimas') order by ord)`,
  sobre `jsonb_array_elements(v.lineas) with ordinality`. Ni `concepto` ni `cita_id`.
- Todas las tablas del cuerpo llevan alias: es un `returns table` con nombres de columna (regla
  `supabase.md`).
- `fecha_documento` = `(now() at time zone public.zona_horaria_centro(coalesce(v.centro_id, pac.centro_id)))::date`.
- Las **notificaciones** de `registrar_fallo_envio_facturacion` y de
  `notificar_discrepancia_facturacion` siguen el patrón de H11:
  - destinatarios: `perfiles` con `rol = 'administrador'` y `estado = 'activo'`, todos;
  - `on conflict (perfil_id, tipo, origen_tabla, origen_id) where origen_id is not null do nothing`;
  - textos en §1.4.
- `registrar_fallo_envio_facturacion` deja en `ultimo_error` solo el código, de esta lista cerrada:
  `('red','limite','no_autorizado','sin_plan','rechazado','ambiguo','no_disponible','descartado')`.
- El retroceso es `least(interval '1 minute' * power(2, intentos), interval '6 hours')`. El paso a
  `fallido` llega con `p_permanente` o con `intentos >= 8`.
- `proveedor_facturacion_activo()` gana además `grant execute … to service_role`, para la ruta.

**(e) §1.5.5 · `encolar_envio_borrador`.** El paso 1 copia la política de H3:

```sql
if not coalesce(
     (select public.rol_actual()) = 'administrador'::public.rol_usuario
     or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
         and v_profesional_id = (select auth.uid())
         and public.es_profesional_asignado(v_paciente_id)), false) then
  raise exception 'No puedes preparar este borrador en el programa (T-026a)' using errcode = '42501';
end if;
```

- `v_profesional_id` y `v_paciente_id` se leen de la cabecera **antes** del `if`.
- Si la cabecera no existe, las dos variables quedan nulas, el `coalesce` da falso y sale **el mismo**
  mensaje. Así no hay oráculo de existencia. El administrador sobre un uuid que no existe recibe ese
  mismo 42501.
- El administrador activo se comprueba según V5.
- Después: `for update` sobre la cabecera; la comprobación del ajuste (23514 «no hay programa de
  facturación conectado»); la última versión (23514 «el borrador no tiene una versión que se pueda
  preparar»); y el envío ya existente, con la clave `'facturacion.enviar_borrador:' || p_borrador_id`
  y el reenvío desde `fallido`. Todo como en T-026.
- Si ya hay un envío y su evento está entregado, devuelve `envio.evento_id`.

**(f) §1.5.6 · Congelación.**
- Función `public.fn_sellar_version_borrador_tras_envio()`, definer.
- Disparador `sellar_version_borrador_tras_envio`, BEFORE INSERT.
- Toma `for key share` sobre la cabecera. Lanza 23514 «el borrador ya se preparó en el programa: no
  admite versiones nuevas» si existe un envío, o un evento `pendiente` con su clave.
- Actúa para **todo** rol, también `postgres` y `service_role`.
- Orden efectivo: sellado (permisos), luego cotas y por último congelación.
- El candado del sellado (`for no key update`) choca con el `for update` de `encolar`, y eso los
  serializa.

**(g) §1.5.7 · `cobros.factura_espejo_id`.** Sin cambios en la columna ni en el grant.
- Función `public.fn_validar_cobro_factura_espejo()`, definer, y disparador
  `validar_cobro_factura_espejo`.
- El paso 1 copia `cobros_alta` vigente (H4) entera, `registrado_por = auth.uid()` incluido. Solo
  actúa si `current_setting('role', true) in ('authenticated','anon')`, igual que el paso 0 de T-021.
  Mensaje: 42501 «No puedes registrar este cobro (T-026a)».
- Después, 23503 «la factura del cobro no existe» y 23514 «la factura del cobro es de otro paciente».

**(h) §1.5.8 · `borradores_factura_estado`.** Se redefine con las mismas columnas, en el mismo orden
y con el mismo tipo (`borrador_id uuid, ultima_version integer, estado text`), con
`security_invoker = true`. El cuerpo nuevo es el actual con el `CASE` ampliado:

```sql
case
  when exists (select 1 from public.facturas_espejo e where e.borrador_id = b.id) then 'facturado'
  when exists (select 1 from public.borradores_factura_envios s where s.borrador_id = b.id) then 'enviado'
  when public.estado_cola_borrador(b.id) = 'pendiente' then 'en_cola'
  when public.estado_cola_borrador(b.id) = 'fallido' then 'fallido'
  when u.descartado then 'descartado'
  else 'sin_enviar'
end
```

`estado_cola_borrador(uuid) returns text` es definer y `stable`. Copia H2 entera (es la tercera copia
de la regla de lectura) y devuelve nulo si no pasa.

**(i) §1.5.9 · Ajuste y Vault.** Como T-026, con tres precisiones:
- El secreto se llama `proveedor_facturacion_clave`.
- Las guardas de rol de `guardar_clave_proveedor_facturacion`, `quitar_proveedor_facturacion` y
  `estado_clave_proveedor_facturacion` son: administrador y `perfiles.estado = 'activo'`. Si no se
  cumplen, 42501 «solo el administrador gestiona el programa de facturación». Más `aal2` si se
  cumple V7.
- La validación de la clave va antes que el Vault: 22023 «la clave no tiene un formato válido».
  `p_clave` solo aparece en esa validación y en las dos llamadas al Vault.

El cron es `cron.schedule('drenar-facturacion', '*/5 * * * *', $$select public.disparar_drenado_facturacion()$$)`.

**(j) §1.5.10.** Los `comment on` de T-026.

### 1.2 Linter

`scripts/lint-migraciones.ts:26-39` gana tres entradas en `TABLAS_SOLO_ADICION`:
`borradores_factura_envios`, `facturas_espejo` y `facturas_anotaciones`.

`lint-migraciones.test.ts` gana un caso por tabla, copiando los casos existentes de `cobros`: una
migración sintética sin `impedir_truncado_<t>` tiene que dar el hallazgo.

### 1.3 Banco `scripts/rls/31-proveedor-facturacion.sql`

**Ids.** En `01-fijacion.sql`, con el prefijo `a026` (todos `\set X '\'…\''`):

| Id | Uuid |
|---|---|
| BORRA | `a0260001-0000-4000-8000-000000000001` |
| BORRB | `a0260001-0000-4000-8000-000000000002` |
| VERA | `a0260002-0000-4000-8000-000000000001` |
| VERB | `a0260002-0000-4000-8000-000000000002` |

En el módulo 31, BORRC es `a0260001-0000-4000-8000-000000000003` y BORRD es
`a0260001-0000-4000-8000-000000000004`.

**Fijación en `01`.** Va después del bloque T-021 ronda 2. Todo se crea **por las funciones**: es la
regla «una prueba que construye a mano prueba el esquema».
1. Cabeceras: BORRA (P1, PRO1, creado por PRO1) y BORRB (P2, PRO2, creado por PRO2). Se insertan como
   `postgres`, igual que BORR1.
2. La versión 1 de cada una, sellada como en `01:231-240`:
   - BORRA, con la línea de `pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)` y destinatario
     'Ana Uno';
   - BORRB, con `pg_temp.linea_borrador('Sesión de psicoterapia', 1, 7000)` y destinatario 'Beto Dos';
   - `creada_en` distinto en cada una, un segundo después de la de BORR1, por el índice global de
     huellas (README punto 9).
   - `creada_en` es un literal pasado. Si fuera hoy o futuro, lleva `-- fecha-fija: creada_en como postgres`.
3. El ajuste: `call pg_temp.como_con_2fa(:ADM)` (o `como`, según V1/V7), luego
   `select public.guardar_clave_proveedor_facturacion('holded', 'claveFijacionT026a0001')` y
   `reset_sesion()`.
4. `call pg_temp.como_con_2fa(:ADM)`, luego `encolar_envio_borrador(:BORRA)` y
   `encolar_envio_borrador(:BORRB)`, y `reset_sesion()`.
5. `set local role service_role`. Después:
   - `reclamar_envios_facturacion(10)`, que devuelve los dos;
   - `registrar_envio_borrador(evento, 'holded', 'DOC-A', 1, :VERA, current_date)` y lo mismo para
     `'DOC-B'`. Los `evento_id` se leen con `\gset` de `eventos_salientes` por la clave.
   - `registrar_factura_espejo('holded','DOC-A','F-2026-0001', current_date, 6000, 0, 6000, 'https://programa.example/doc/A')`
     y lo mismo para B (7000).
   - `registrar_anotacion_documento('holded','DOC-A','rectificado')`.
   - `reset role`.

Los ids de versión VERA y VERB: `01` inserta las versiones con `id` explícito si el insert lo
admite. Si no, se leen con `\gset` por `borrador_id` y `numero_version = 1`.

**Fechas (regla del punto 10 del README).** El módulo 31 **no ancla nada a la agenda**: no crea
citas, ni series, ni disponibilidad. Usa dos tipos de fecha:
- `current_date` y `current_date - 1` (los cobros: `current_date - 1` es siempre «hoy o antes» en la
  zona del centro, porque Madrid va por delante de UTC);
- `now()`, para el outbox.

Así que no necesita desplazamiento de año. En la tabla del README se añade la fila
`| 31 | PRO1/CA, PRO2/CB | ninguna (sin agenda; cobros en current_date − 1) |`. **Reserva +5**,
con las variables `anio_31` y `lunes_31`, solo si el implementador tiene que crear una cita. En ese
caso se declara en la tabla. Comprobación: `node scripts/rls/fechas-fijas.mjs` en verde y los dos
`grep` del punto 10 sin líneas nuevas fuera de la tabla.

**Bloques.** Son A-N de T-026 §3, con estos ajustes:

- **A · Catálogo.**
  - Columnas exactas de las tres tablas, de la vista y de `borradores_factura_estado` (comparadas con
    `array_agg(column_name||':'||data_type order by ordinal_position)`).
  - Ninguna columna del espejo casa con `~* 'estado|pago|cobr|pdf|qr|registro|huella'`.
  - `prosecdef` y `proconfig = '{search_path=""}'` en todas las funciones nuevas.
  - `has_function_privilege` para anon, authenticated y service_role, función a función.
  - El orden de los disparadores de versiones: el `tgname` ordenado es exactamente
    `{sellar_version_borrador, sellar_version_borrador_cotas, sellar_version_borrador_tras_envio}`.
- **B · Solo adición.**
  - Insert en las tres tablas como ADM, PRO1 y TEC1: 42501.
  - Update, delete y truncate como authenticated (PRO1, que **sí** lee las filas de BORRA), como
    service_role y como postgres: 42501.
- **C · Espejo.**
  - Los mismos datos dos veces dan el mismo id.
  - Con `total + 100` y la base ajustada, 23505, y al releer, el total original.
  - `DOC-X` sin envío: 23503.
  - En BORRC, tras `borrado_sin_aprobar`: 23514.
- **D · Envíos.**
  - `registrar_envio_borrador` dos veces da el mismo id; con otro documento, 23505.
  - Los tres 23503 y 23514 de `validar_envio_borrador`, cada uno con su fragmento. Se provocan con un
    insert directo como `postgres`, porque es la única forma de pasar un `version_id` ajeno.
- **E · Anotaciones.**
  - `'pagado'::anotacion_documento_proveedor`: 22P02.
  - `enum_range` = `{borrado_sin_aprobar,rectificado,anulado}`.
  - `borrado_sin_aprobar` sobre DOC-A, que tiene espejo: 23514.
  - `anulado` sin espejo (BORRC): 23514.
  - Idempotencia: la misma anotación dos veces devuelve el mismo id.
- **F · Lectura.**
  - PRO1 lee 1 envío, 1 espejo y 1 anotación de BORRA, y 0 de BORRB.
  - PRO2 lo contrario.
  - ADM lee 2 envíos y 2 espejos, contando solo los dos ids de la fijación.
  - TEC1 lee 0 en las tres tablas.
- **G · Vista del técnico.**
  - TEC1 cuenta 1 sobre el espejo de A y 0 sobre el de B; la gemela ADM cuenta 2.
  - PRO1 cuenta 1 y PRO2 cuenta 1, cada uno el suyo: **se comparan los dos caminos**, la vista frente
    a la tabla con la RLS de la cabecera, para el mismo perfil.
  - Columnas sin `cita_id`, `lineas` ni `borrador_id`.
- **H · Cobros.** Todos como authenticated, con `fecha = current_date - 1` y `registrado_por` = el
  propio.
  - ADM, cobro de P2 con el espejo de BORRA: 23514.
  - TEC1, cobro de P1 (centro A) con el espejo de BORRB: 23514.
  - ADM con un espejo inexistente: 23503.
  - PRO2, cobro de P1 con un espejo inexistente: 42501 con el fragmento «No puedes registrar este
    cobro». No 23503.
  - Gemela: ADM, cobro de P1 con el espejo de BORRA, entra.
- **I · Encolar.**
  - PRO2 sobre BORRA y sobre `gen_random_uuid()`: los dos textos son idénticos, comparados con
    `sqlerrm` capturado.
  - ADM tras `quitar_proveedor_facturacion()`: 23514 «no hay programa». Después se vuelve a guardar.
  - BORRD, con la última versión descartada: 23514 «no tiene una versión que se pueda preparar».
  - Dos veces sobre BORRC da el mismo `evento_id`.
  - BORRC en `fallido`, encolado de nuevo: `estado = 'pendiente'`, `intentos = 0` y `ultimo_error` nulo.
- **J · Congelación.**
  - Versión nueva de BORRA como `postgres`: 23514 «ya se preparó en el programa».
  - Versión nueva de BORRC con el evento `pendiente`: 23514.
  - BORRC con el evento `fallido`: entra (V2 para el sobre de la versión 2).
  - PRO2 añadiendo una versión a BORRA como authenticated: 42501 con el fragmento «No puedes añadir
    una versión a este borrador». La versión es válida, para que no la pare el disparador de cotas.
- **K · Estado.** BORRC recorre `sin_enviar` → `en_cola` → `fallido` → `en_cola` → `enviado` →
  `facturado`, y BORRD da `descartado`. Las columnas son las de T-021.
- **L · Vault.**
  - TEC1 y PRO1 reciben 42501 en guardar, quitar y estado.
  - ADM guarda `'SENTINELA_T026_' || repeat('x',16) || 'abcd'`.
  - `estado_clave_proveedor_facturacion()` devuelve `ultimos4 = '••••abcd'`.
  - `select` sobre `facturacion_ajuste` como authenticated: 42501.
  - Tras `quitar`, `count(*) from vault.secrets where name = 'proveedor_facturacion_clave'` = 0.
- **M · Auditoría.**
  - Hay una fila `INSERT` en `auditoria` por cada fila de la fijación en las tres tablas y en el
    ajuste.
  - `select count(*) from auditoria where estado_posterior::text like '%SENTINELA_T026_%'` = 0, y lo
    mismo con `estado_anterior`.
- **N · Reclamo.**
  - Un segundo reclamo inmediato devuelve 0: la concesión de 5 minutos con `now()` constante en la
    transacción.
  - Las claves de las líneas: `= '{cantidad,precio_unitario_centimos,regimen_iva,tipo_iva_centesimas}'`.
  - El retroceso crece: entre fallos, `update eventos_salientes set proximo_intento = now() - interval '1 second'`
    como `postgres` (el outbox es mutable), y se comparan `proximo_intento - now()` de los intentos 1 y 2.
  - En el intento 8, `fallido`, con una notificación por administrador activo. Al repetir el fallo,
    el recuento no cambia.
  - El evento de BORRD (descartado) pasa a `fallido` con `ultimo_error = 'descartado'`.

**`00-ayudantes`.** Solo ids, si `01` no los declara: allí se declaran.

**`11-cobertura`.** En `v_declaradas` entran `borradores_factura_envios_lectura`,
`facturas_espejo_lectura` y `facturas_anotaciones_lectura`.

**README.** La fila del módulo 31 en la tabla de módulos y su fila de franja.

### 1.4 `lib/facturacion/` y textos fijos de SQL

Ficheros, firmas y comportamiento: los de T-026 §1.2-§1.4 y §1.6, con estas precisiones.

**`nif.ts`** (nuevo, `import 'server-only'`):
- Firma: `descifrarNifDestinatario(fila: Pick<FilaReclamada, 'destinatario_nif_cifrado'|'destinatario_nif_nonce'|'destinatario_nif_etiqueta'|'destinatario_nif_clave_version'>): Promise<string | null>`.
- Con las cuatro nulas, devuelve `null`.
- Con `clave_version !== 1`, lanza un `Error` de mensaje fijo, y la cola lo trata como `rechazado`.
- Si no, `descifrar(await claveDeCifrado(), { cifrado: desdeBytea(…), nonce, etiqueta })`.

**`cola.ts`.** `FilaReclamada` es el tipo de la fila de §1.1 (d), sacado de `tipos-bd.ts`
(`Database['public']['Functions']['reclamar_envios_facturacion']['Returns'][number]`).
`VersionParaProyectar` = `FilaReclamada`.

**`registro.ts`.** Exporta `FICHAS`, `proveedorActivo()` (con la sesión del usuario) y
`proveedorActivoServicio()` (con `crearClienteAdministracion()`). Las dos devuelven `null` si
`!ficha.disponible`. En T-026a siempre devuelven `null`.

**Textos fijos de SQL** (en la migración, no en i18n):

| Uso | `tipo` | `titulo` | `detalle` |
|---|---|---|---|
| Envío fallido | `facturacion_envio_fallido` | «Borrador sin preparar en el programa» | Por código: `ambiguo` → «No se sabe si el borrador llegó al programa de facturación. Compruébalo allí antes de volver a prepararlo.»; `descartado` → «El borrador se descartó antes de prepararse.»; el resto → «No se pudo preparar el borrador en el programa de facturación.» |
| Discrepancia | `facturacion_discrepancia` | «Factura distinta en el programa» | «Los datos de una factura del programa de facturación ya no coinciden con los copiados. Revísala en el programa.» |

Ninguno nombra al paciente, ni al programa, ni usa «emitir», «facturar» o «aprobar».

### 1.5 Ruta `app/api/facturacion/drenar/route.ts`

Como T-026 §1.6, con estos valores cerrados:
- `export const maxDuration = 60`, por debajo de la concesión de 300 s.
- Ni `dynamic` ni `revalidate` (H26).
- Cabeceras `{'Cache-Control':'private, no-store'}` y `responder()`, copiadas de `app/api/avisos/route.ts`.
- La comparación del secreto: `const a = Buffer.from(recibido); const b = Buffer.from(esperado); if (a.length !== b.length || !timingSafeEqual(a, b)) → 401`.
- Si `proveedorActivoServicio()` es `null`, 200 `{ estado: 'sin_proveedor' }`. En T-026a es siempre
  este caso.
- `console.error('[facturacion] drenar', codigo)` y nada más.

`proxy.ts:10` queda `['/login', '/prototipo', '/api/facturacion/drenar']`. `.env.example` gana
`FACTURACION_DRENAR_SECRETO=`.

### 1.6 Ajustes › Programa de facturación

Como T-026 §1.7. Ficheros:
- `app/(app)/ajustes/facturacion/page.tsx`
- `formulario-clave.tsx`
- `dialogo-desconectar.tsx`
- `acciones.ts`
- `esquemas.ts`
- `page.test.tsx`
- `formulario-clave.test.tsx`
- `acciones.test.ts`

Precisiones:
- `page.tsx` sigue el patrón de H21. Si `FICHAS` no tiene ninguna ficha disponible, pinta solo
  `ajustes.facturacion.ningunoDisponible`: ni input, ni botones.
- `page.test.tsx`:
  - hace `vi.mock('@/lib/facturacion/registro')` para los dos casos, real y simulado disponible;
  - mockea `next/navigation`, con un `redirect` que lanza, para PRO y TEC;
  - **importa además `../page`** (Ajustes) para comprobar que el enlace solo sale en
    `AccesosDeAdministracion` con rol de administrador. El test de `ajustes/page.test.tsx` queda fuera
    del territorio.
- El enlace en `app/(app)/ajustes/page.tsx` va después de `altasCentro`, con la misma className,
  `href="/ajustes/facturacion"` y la clave `ajustes.acciones.programaFacturacion`.
- `acciones.ts`: `guardarClaveProveedor`, `probarConexion` y `desconectarProveedor`, con las firmas de
  T-026. `acciones.test.ts` comprueba que el valor devuelto por `guardarClaveProveedor` no contiene el
  centinela (`JSON.stringify`).

### 1.7 Ficha › Facturación

`app/(app)/pacientes/[id]/panel-facturacion.tsx` es un Server Component async con dos props,
`{ pacienteId: string; rol: RolUsuario }`.
- En `page.tsx`: `facturacion={<Suspense fallback={<Cargando filas={4} />}><PanelFacturacion pacienteId={id} rol={rol} /></Suspense>}`,
  y la función `Facturacion()` se borra.
- La carga de datos va dentro de `try { … } catch { return <AvisoDeError …/> }` (D8). Así, que falle
  la facturación no tumba la ficha.
- `EstadoBorrador` se exporta desde `app/(app)/pacientes/[id]/estado-borrador.tsx`. Es la pieza
  delegable (§7) y tiene esta firma:
  `EstadoBorrador({ estado, texto }: { estado: 'sin_enviar'|'en_cola'|'fallido'|'enviado'|'facturado'|'descartado'; texto: string })`.
  Pinta `Pildora`, con el tono `success` para `facturado`, `warning` para `fallido` e `info` para el resto.
  - **Fuera del territorio declarado.** O se añade `estado-borrador.tsx` al territorio, o la pieza
    vive dentro de `panel-facturacion.tsx`. Decisión: **dentro de `panel-facturacion.tsx`**, como
    función exportada. El CLI recibe solo esa función.
- «Preparar» se pinta si `proveedorActivo() !== null`, `estado ∈ {sin_enviar, fallido}` y
  (`rol === 'administrador'` o (`borrador.profesional_id === usuario.id` y el usuario está asignado)).
  - El usuario está asignado porque la RLS ya le deja leer el borrador. Falta solo la autoría, que es
    lo que añade la regla de alta.
  - Es solo la presentación: la guarda real está en `encolar_envio_borrador`.
- `acciones-facturacion.ts`: `prepararBorradorEnProveedor(borradorId)` devuelve `{ ok: true }` o
  `{ error: 'sin_permiso' | 'sin_programa' | 'no_preparable' | 'fallo' }`.
  - El error se elige por `code` y por fragmento: 42501 → `sin_permiso`; 23514 «no hay programa» →
    `sin_programa`; 23514 «se pueda preparar» → `no_preparable`.
  - Termina con `revalidatePath('/pacientes/' + pacienteId)`.

**Claves i18n nuevas** (`lib/i18n/es.ts`). Textos cerrados; `{programa}` = `ficha.nombre`:

| Clave | Texto |
|---|---|
| `ajustes.acciones.programaFacturacion` | Programa de facturación |
| `ajustes.facturacion.titulo` | Programa de facturación |
| `ajustes.facturacion.ningunoDisponible` | Todavía no hay ningún programa de facturación disponible para conectar |
| `ajustes.facturacion.sinConectar` | Sin programa conectado |
| `ajustes.facturacion.conectado` | {programa} conectado · clave {ultimos4} · actualizada el {fecha} |
| `ajustes.facturacion.clave` | Clave de acceso de {programa} |
| `ajustes.facturacion.guardar` | Guardar clave |
| `ajustes.facturacion.probar` | Probar conexión |
| `ajustes.facturacion.conexionCorrecta` | La conexión con {programa} funciona |
| `ajustes.facturacion.desconectar` | Desconectar |
| `ajustes.facturacion.desconectarConfirmar` | ¿Desconectar {programa}? Los borradores que estén en cola no se prepararán hasta que vuelvas a conectarlo. |
| `ajustes.facturacion.errores.clave_invalida` | La clave no tiene un formato válido |
| `ajustes.facturacion.errores.sin_permiso` | Solo el administrador gestiona el programa de facturación |
| `ajustes.facturacion.errores.fallo` | No se pudo guardar. Inténtalo de nuevo |
| `ajustes.facturacion.errores.{red,limite,no_autorizado,rechazado,ambiguo,no_disponible}` | Un texto fijo por código, sin cifras ni respuestas del programa |
| `ajustes.facturacion.errores.sin_plan` | Tu cuenta de {programa} no tiene un plan que permita conectar otras aplicaciones. Revísalo en {programa}. |
| `facturacion.panel.titulo` | Borradores |
| `facturacion.panel.estado.sin_enviar` | Sin enviar |
| `facturacion.panel.estado.en_cola` | Preparándose en {programa} |
| `facturacion.panel.estado.fallido` | No se pudo preparar |
| `facturacion.panel.estado.fallidoAmbiguo` | Comprueba en {programa} si el borrador llegó antes de volver a prepararlo |
| `facturacion.panel.estado.enviado` | Borrador enviado |
| `facturacion.panel.estado.facturado` | Emitida en {programa} · nº {numero} |
| `facturacion.panel.estado.descartado` | Descartado |
| `facturacion.panel.preparar` | Preparar borrador en {programa} |
| `facturacion.panel.abrir` | Abrir en {programa} para emitir |
| `facturacion.panel.anotacion.borrado_sin_aprobar` | Borrado en {programa} sin emitir |
| `facturacion.panel.anotacion.rectificado` | Rectificada en {programa} |
| `facturacion.panel.anotacion.anulado` | Anulada en {programa} |
| `facturacion.panel.emitidas` | Emitidas en {programa} |
| `facturacion.panel.error` | No se pudo cargar la facturación. El resto de la ficha sigue disponible |
| `facturacion.panel.errores.*` | Uno por cada error de `prepararBorradorEnProveedor` |

Sin proveedor activo, el panel no tiene `{programa}` que sustituir. En ese caso pinta los estados
sin el nombre del programa:
- `en_cola` → `facturacion.panel.estado.en_colaSinPrograma`, «En cola»;
- `facturado` → `facturacion.panel.estado.facturadoSinPrograma`, «Emitida · nº {numero}».

Ninguna clave contiene «Holded».

### 1.8 Pruebas de `lib/facturacion` y su configuración

- `vitest.config.ts`: `exclude` gana `'**/*.bd.test.ts'`.
- `vitest.bd.config.ts` (nuevo):
  - `include: ['lib/facturacion/**/*.bd.test.ts']`;
  - `environment: 'node'`;
  - el mismo alias de `server-only`;
  - antes de `defineConfig`, `process.loadEnvFile('.env.local')` si existe (`existsSync`). No se usa
    `dotenv` ni `loadEnv` de vite: ninguna dependencia nueva.
  - `testTimeout: 30000`.
- `package.json`: `"test:facturacion": "vitest run --config vitest.bd.config.ts"`.

**`cola.bd.test.ts`.** Prepara sus datos con `ejecutarSql(localizarContenedor(), guion)` de
`scripts/psql.mjs`.
- El guion concatena `scripts/rls/00-ayudantes.sql` con un bloque propio, que hace por orden:
  1. crea, con ids nuevos (`crypto.randomUUID()`), una cabecera de P1 sembrado o de la fijación del
     seed, y su versión 1 sellada con `sobre_borrador`;
  2. pone el ajuste, con `pg_temp.como…(admin)` + `guardar_clave_proveedor_facturacion` (el
     administrador activo se lee con `\gset`);
  3. llama a `encolar_envio_borrador` dos veces y hace `pg_temp.assert` de que el id es el mismo.
- Si el guion sale con un código distinto de 0, la prueba falla.
- Lo demás va con `crearClienteAdministracion()` y `crearProveedorSimulado()`.
- Confirma filas y no es idempotente, igual que `test:huellas`. Va en CLAUDE.md, en la línea de
  comandos de la bitácora, no en el fichero, que está fuera del territorio.

---

## 2 · Decisiones y alternativas descartadas

Valen D1-D16 de T-026. Además:

| # | Decisión | Descartada, y por qué |
|---|---|---|
| D17 | La rama del profesional de la vista es `es_profesional_asignado(e.paciente_id)`, copiada de H2 | La de T-026 (`b.profesional_id = auth.uid()`): es la regla de la ronda 2, que T-021 ya no aplica |
| D18 | `encolar` y la visibilidad de «Preparar» copian la política de **alta** de versiones | Copiar la de lectura: un profesional asignado y no autor congelaría el borrador de otro |
| D19 | La congelación actúa también para `postgres` y `service_role` | Solo para authenticated: el banco, o un error del sincronizador, dejaría una versión posterior al envío |
| D20 | El NIF se descifra con `identificacion_cifrado_v1` en `lib/facturacion/nif.ts` | Una clave propia de facturación: la columna fija la versión 1 y no hay otra clave en el Vault. Exigiría un ADR |
| D21 | El banco 31 no ancla nada a la agenda y reserva +5 | Tomar un año ya: ninguna guarda de reloj lo necesita, y un ancla sin uso es ruido para `fechas-fijas.mjs` |
| D22 | El error de la ficha se captura en servidor (try/catch → `AvisoDeError`) | Un `error.tsx` de segmento: tumbaría la ficha entera. Un boundary de cliente: un fichero más fuera del territorio |
| D23 | `EstadoBorrador` vive en `panel-facturacion.tsx` | Un fichero propio: no está en el `territorio:` |
| D24 | `vitest.bd.config.ts` carga `.env.local` con `process.loadEnvFile` | `dotenv`: es una dependencia nueva, que el contrato prohíbe |
| D25 | Las notificaciones van a todo administrador activo, no al designado | Al designado (`administrador_avisos_id`): CA12 dice «una por administrador» |

---

## 3 · Cómo se cierra cada criterio de aceptación

| CA | Comprobación |
|---|---|
| CA1 | `npx supabase db reset` sin error. `select max(version)…` da `20261014120000`. `npm run lint:migraciones` da 0 hallazgos |
| CA2 | Banco 31-B, `10-solo-adicion` (las tres tablas, cada una con su fila de `01`) y `select count(*) from cobertura_solo_adicion()` = 0 |
| CA3 | Banco 31-C |
| CA4 | Banco 31-A, con la lista exacta de T-026 §1.5.2 |
| CA5 | Banco 31-E |
| CA6 | Banco 31-F y 31-G |
| CA7 | Banco 31-H |
| CA8 | Banco 31-I, con los textos comparados por igualdad |
| CA9 | Banco 31-J y el orden de disparadores de 31-A |
| CA10 | Banco 31-K |
| CA11 | Banco 31-L y 31-M |
| CA12 | Banco 31-N |
| CA13 | `grep -rn "approveDoc\|APPROVE_DOC" lib/` y `grep -rniE "approve" app components lib proxy.ts --exclude=*.test.ts`: solo `holded.ts`, la constante y su `void` |
| CA14 | `npm run test:facturacion` (`cola.bd.test.ts`). `drenarEnvios` dos veces con `Promise.all` da `control.documentos().length === 1` y un envío. En el caso `perderRespuesta`: 1 documento, 0 envíos, evento `fallido` con `ambiguo` y la notificación |
| CA15 | `proyeccion.test.ts`, con la entrada contaminada en la raíz y en las líneas. Las claves de la salida son exactamente esas, y el concepto, el de Q4 por régimen |
| CA16 | `cola.bd.test.ts` con `caido(true)` |
| CA17 | `sincronizador.test.ts`, con un `bd` simulado que registra las RPC llamadas. Un espía en `crearBorrador` comprueba que nunca se llama |
| CA18 | `accesibilidad/facturacion-clave.spec.ts`, que corre **después** de `npm run build`. Recorre `.next/static` y `.next/server`. Más `acciones.test.ts` |
| CA19 | `lib/facturacion/ruta-drenar.test.ts` (el territorio da `route.ts`, no su prueba): importa `@/app/api/facturacion/drenar/route`. Sin la variable → 503; cabecera distinta de la misma longitud → 401; de distinta longitud → 401; nunca 200 sin secreto. El diff de `proxy.ts` es una sola cadena |
| CA20 | Los dos `grep` del contrato. `lib/facturacion/importaciones.test.ts` recorre `app/` y `lib/`: ningún fichero que no sea `*.test.ts` importa `simulado` |
| CA21 | `app/(app)/ajustes/facturacion/page.test.tsx` y `formulario-clave.test.tsx`: `type="password"`, sin `defaultValue`, `reset()` tras éxito, y el diálogo de «Desconectar» abre y llama a la acción |
| CA22 | `panel-facturacion.test.tsx`: los seis estados, las tres pastillas, que no hay botón sin proveedor, la lista del técnico sacada de la vista y «Preparar» → `encolar_envio_borrador` (con el cliente mockeado y sin importar el registro de proveedores) |
| CA23 | El `grep` del vocabulario, con el resultado listado en la evidencia. `grep -rn "use cache\|unstable_cache" lib/facturacion app/(app)/ajustes/facturacion app/(app)/pacientes/[id]/panel-facturacion.tsx` vacío |
| CA24 | La captura de pantalla del guion manual: la ficha sin botones y un cobro de T-023 registrado |
| CA25 | La salida de los seis comandos y `node ~/.claude/pipeline/territorio.mjs T-026a`. Ojo: el `territorio:` del contrato lleva comentarios en la misma línea, y el script los lee mal (`state.md`). Hay que comprobarlo también a mano con `git diff --name-only main` |

---

## 4 · Riesgos, por probabilidad

1. **Alta · T-023 cambia al implementarse.** El nombre `validar_cobro`, el mensaje o la vista pueden
   variar. Mitigación: antes de escribir 31-H, se lee la migración `20261013120000` fusionada y se
   copia de allí. Lo que haya cambiado va a la bitácora.
2. **Alta · La fijación de `01` rompe otros módulos.** Ensucia los recuentos de 26 y 22: más
   versiones, más notificaciones y más auditoría. Mitigación:
   - borradores nuevos y no BORR1;
   - ninguna notificación en `01`;
   - antes de la evidencia, se ejecuta `test:rls` entero. Si algún recuento fijo se rompe, se cambia
     por la comparación de dos caminos (regla `pruebas.md`), solo en el módulo 31 o en la fijación.
3. **Media · El orden de los disparadores.** Si alguien renombra `sellar_version_borrador_tras_envio`,
   PRO2 recibe 23514 en lugar de 42501. Mitigación: 31-A fija el orden por catálogo.
4. **Media · `cola.bd.test.ts` frágil.** Depende del seed y del contenedor (`localizarContenedor`
   puede elegir otro, según `state.md`). Mitigación: imprime `Contenedor:` y busca el administrador
   con `\gset`, sin fijar su id.
5. **Media · La clave en registros.** `log_statement` y pg_net: los riesgos 3 y 4 de T-026 siguen en
   pie.
6. **Baja · Tercera copia de la regla de lectura.** `estado_cola_borrador` y la vista pueden divergir
   de H2 si T-021 vuelve a cambiarla. Mitigación: 31-F/G comparan caminos, y queda anotado en
   `state.md`.
7. **Baja · A4-H1 de T-021.** Una línea general con cuota menor de medio céntimo no sella. No afecta a
   la proyección, que no recalcula IVA. Pasa a T-046, que es el editor.

---

## 5 · Qué revisar

Vale la lista de T-026 §5 entera. Además:

**Qué elige el llamante**
- [ ] `encolar_envio_borrador`: solo `p_borrador_id`. La guarda es la política **de alta** de H3,
  copiada carácter a carácter, y el mensaje es el mismo para ajeno e inexistente.
- [ ] `cobros.factura_espejo_id`: el llamante elige el espejo. El disparador replica `cobros_alta`
  con `registrado_por = auth.uid()` antes de mirar el espejo.
- [ ] `reclamar_envios_facturacion`: ni `concepto` ni `cita_id` en las líneas, y la clave de versión
  se llama `destinatario_nif_clave_version`.
- [ ] `guardar_clave_proveedor_facturacion`: `grep -n p_clave` en la migración da solo la validación
  y las dos llamadas al Vault.

**Qué prueba debe fallar, y por qué motivo exacto**
- [ ] 31-J: PRO2 recibe el fragmento «No puedes añadir una versión a este borrador», no «ya se
  preparó». Como `postgres`, la congelación sí salta.
- [ ] 31-H: PRO2 recibe «No puedes registrar este cobro», no 23503. Y T-023 no se adelanta, porque
  la fecha es `current_date - 1`.
- [ ] 31-I: los dos textos de 42501 se comparan por igualdad, no por fragmento.
- [ ] 31-G: con la rama del profesional de T-026, la `b.profesional_id`, el resultado sería el mismo
  para PRO1. Tiene que haber un caso que la distinga: el administrador como profesional asignado no
  autor, **o** lo deja anotado como mutante no matado en la evidencia.
- [ ] Mutantes que miden el banco, uno por guarda:
  - quitar el paso de permisos de `encolar`;
  - cambiar el orden de los disparadores;
  - la rama del técnico de la vista sin `centros_actuales()`;
  - quitar la congelación para `postgres`.

**Invariantes por otra puerta**
- [ ] **Null**: `factura_espejo_id` nulo no valida. En `encolar`, el borrador inexistente da nulos y
  el `coalesce(…, false)` los convierte en 42501, nunca en un paso libre.
- [ ] **Duplicados**: los `unique` de T-026, y las notificaciones con `on conflict … where origen_id is not null`.
- [ ] **Concurrencia**:
  - el `for update` de `encolar` frente al `for no key update` del sellado;
  - el `for key share` de la congelación;
  - `skip locked` y la concesión;
  - las dos llamadas a `drenarEnvios` en paralelo.
- [ ] **Permisos de tabla entera**:
  - ningún grant a `service_role` sobre las tablas;
  - `facturacion_ajuste` sin grants;
  - `\dp` de las tres tablas y de la vista en la evidencia.
- [ ] **TRUNCATE**: `impedir_truncado_<t>` en las tres tablas y `revoke truncate` a `postgres`.
- [ ] **Caché**: el panel no usa `cache` de React para nada del borrador. Solo vale el `cargarRol`
  que ya existe.
- [ ] **«Holded»**: ni en `lib/i18n/es.ts` ni en `app/`.

---

## 6 · Territorio

El contrato lo declara, y este diseño no le añade nada. La prueba de la ruta va en
`lib/facturacion/ruta-drenar.test.ts` (CA19) y `EstadoBorrador` en `panel-facturacion.tsx` (D23),
justo para no salirse del territorio. `tickets/T-026a/**` incluye este fichero.

---

## 7 · Delegable

Solo `EstadoBorrador` (§1.7): la función, sin estado, que recibe `estado` y `texto` y pinta
`Pildora` con el tono de la tabla. Su prueba de pintura: un caso por estado y el tono que le toca.

El CLI recibe la firma y el tono. La fábrica integra la función dentro de `panel-facturacion.tsx`.
Todo lo demás toca la clave, el outbox, la RLS o el vocabulario regulado, y lo hace la fábrica.

---

## Lo que no entra, y por qué

- Todo lo de T-026 «Lo que no entra».
- Cambiar `borradores_factura_lectura`, la alta de versiones o P-R3.1: son de T-021, y aquí solo se
  copian.
- Arreglar el `current_date + 1600` de `30-cobros.sql` (T-023): es otro módulo y otro ticket. Va como
  hallazgo.
- Acotar A4-H1 en Zod: no hay ningún formulario de líneas en este ticket; es de T-046.
- Tocar `CLAUDE.md` para documentar `test:facturacion`: está fuera del territorio. Va a la bitácora y
  a `state.md`.

---

## Para `docs/state.md`

- **T-026a · contrato con T-046**: el NIF del destinatario se cifra con `identificacion_cifrado_v1`
  (versión 1), y `lib/facturacion/nif.ts` lo descifra con esa clave.
- **T-026a · tres copias de la regla de lectura del borrador**: `borradores_factura_lectura`, la rama
  del profesional de `facturas_espejo_cabecera` y `estado_cola_borrador`. Y dos de la regla de alta:
  `borradores_factura_versiones_alta` y `encolar_envio_borrador`. Si P-R3.1 de T-021 cambia, cambian
  todas.
- **T-023 · `30-cobros.sql` usa `current_date + 1600`**: rompe la regla 1 del punto 10 del README
  (T-049). Requiere ancla anual o justificación.
- **Holded Q5**: añadir a `docs/legal/preguntas-holded.md` cómo deduplica Holded una creación repetida
  y si admite una clave de idempotencia en cabecera.
- **`test:facturacion`**: confirma filas y no es idempotente (como `test:huellas`). Falta en la tabla
  de comandos de `CLAUDE.md`.
- **A4-H1 (T-021)** pasa a T-046.
