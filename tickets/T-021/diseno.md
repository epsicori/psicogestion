# T-021 · Diseño — Dominio económico: esquema

> Copiado tal cual del commit `79e039f` (rama `T-021-economico-esquema`, nunca integrada), donde vivía como sección final del contrato `tickets/T-021-economico-esquema.md`. Aprobado el 12-09-2026. Lo que ya no casa con main está en la adenda del final; **donde choquen, manda la adenda**.

## Diseño aprobado · 12-09-2026

### 0 · Hechos verificados contra el código, no supuestos

| Hecho | Dónde se comprobó | Consecuencia |
|---|---|---|
| **El enum `regimen_iva` YA EXISTE**, con los valores `exento_sanitario` y `general`, y `tipos_terapia.regimen` lo usa | `supabase/migrations/20260906120000_agenda_esquema.sql:62` y `:101` | **La primera tarea del ticket no se hace**: no se crea un enum nuevo. Ver §1 |
| `fn_impedir_modificacion()` es **genérica y reutilizable**, y ya se usa con `before truncate ... for each statement` | `20260815192424_…:141`, `:269` | Las tres tablas inmutables la reutilizan; no se escribe otra |
| **El cifrado NO ocurre en SQL**: `pacientes_identificacion` guarda cuatro columnas (`_cifrado`, `_nonce` de 12, `_etiqueta` de 16, `_clave_version`) y el AES-256-GCM lo hace la aplicación con `node:crypto` y claves del Vault | `20260822094547_…:366-385` | **No hay «función de cifrado» que reutilizar.** `destinatario_nif` son CUATRO columnas, no una. Ver §3 |
| `fn_auditar()` lleva dentro un mapa `c_recorte` de columnas que **no** se copian a `auditoria` | `20260829150000_…:299-312` | Añadir una tabla con columnas sensibles exige `create or replace` de esa función de T-004. Ver §3 |
| **`fn_sellar_version_nota()` está atada al sobre de once claves de la nota** (`v_esperadas`) y encadena por `paciente_id` | `20260829210000_cadena_de_huellas.sql:143-159` | No se puede reutilizar tal cual para un borrador, cuyo sobre es otro. Ver §2 |
| `lib/huella/` **sí** es reutilizable en su parte de verdad: `canonizar()` (JCS), `normalizarNfc()` y los vectores congelados son genéricos; lo específico de la nota es `sobre.ts` y `firmarVersionNota()` | `lib/huella/index.ts` | El canonicalizador se reutiliza; el sobre del borrador es nuevo |
| `es_profesional_asignado(paciente_id)` y `centros_actuales()` existen y son el patrón de las políticas | T-001, T-002 | Se reutilizan; la RLS del dominio económico no inventa predicados |

### 1 · El IVA: no se crea el enum, se reutiliza — y hay una discrepancia de nombres

El ticket manda crear `regimen_iva` con `exento_20_uno_3` y `general_21`. **Ese enum ya
existe desde T-010 con los valores `exento_sanitario` y `general`**, y `tipos_terapia.regimen`
ya tiene filas apuntando a él. Crear otro es imposible (mismo nombre) y renombrar sus valores
es tocar un tipo en uso para ganar solo claridad de nombre.

**Decisión: se reutiliza el existente, y la referencia legal va donde no estorba** — en el
`comment on type`, que es donde el ticket quería que constara el motivo: terapia y evaluación
exentas por el **art. 20.Uno.3.º LIVA**, informe pericial o para aseguradora al **21 %**.

**Anotado para una persona**: `exento_sanitario`/`general` describen la situación; los nombres
del ticket describen la norma. El segundo par es mejor para quien lea una declaración, pero
cambiarlo es `alter type ... rename value` sobre un tipo en uso y **eso se decide fuera de
este ticket**. Lo que no puede pasar es que convivan los dos.

### 2 · La cadena de huellas del borrador: hermana, no generalización

El ticket dice «la cadena de huellas de T-005 se reutiliza; no escribas otra». Al abrir la
función, lo que hay es un disparador que **valida un sobre de once claves concretas de la nota
clínica** y encadena por `paciente_id`. Un borrador tiene otro sobre —líneas, base, cuota,
total, destinatario— y encadena por `borrador_id`.

Hay dos maneras de cumplir el espíritu del ticket, y se elige la segunda:

1. **Generalizar `fn_sellar_version_nota()`** a un disparador parametrizado que sirva a las
   dos. Es lo más elegante sobre el papel y **lo más caro que se puede hacer aquí**: esa
   función pasó tres revisiones con Opus, tiene 192 aserciones detrás y protege la cadena
   **clínica**. Tocarla para dar servicio a una cadena económica es arriesgar lo grave para
   ahorrar duplicación en lo menos grave.
2. **Escribir `fn_sellar_version_borrador()` como hermana**, con la misma forma —mismas
   comprobaciones de que el llamante no manda la huella, mismo `digest(...,'sha256')`, mismo
   encadenado por posición, misma era de algoritmo— y su propio sobre. **Se reutiliza el
   patrón y el canonicalizador; no se reutiliza el código.**

Lo que **sí** se comparte de verdad: `canonizar()` y `normalizarNfc()` de `lib/huella/`, que
son genéricos y ya tienen sus vectores congelados. El sobre del borrador vive en
`lib/economico/sobre-borrador.ts`, con su propio `esquema_version` empezando en 1.

Y su verificador hermano: `verificar_cadena_borrador(uuid)`, con la misma forma de salida que
`verificar_cadena_huellas(uuid)` para que el guion de comprobación se parezca.

### 3 · El NIF del destinatario: cuatro columnas, y un recorte de auditoría

No hay función de cifrado en SQL. El patrón real del ADR-029 es **cuatro columnas** y el
cifrado **en la aplicación**:

```
destinatario_nif_cifrado        bytea not null
destinatario_nif_nonce          bytea not null check (octet_length(...) = 12)
destinatario_nif_etiqueta       bytea not null check (octet_length(...) = 16)
destinatario_nif_clave_version  smallint not null default 1
```

**Y hay un paso que es fácil olvidar y que el ticket no menciona**: `fn_auditar()` copia la
fila entera a `auditoria` salvo lo que diga su mapa `c_recorte`. Sin añadir
`borradores_factura_versiones` a ese mapa, **el NIF cifrado y su nonce acabarían duplicados en
la tabla de auditoría**, que es exactamente lo que el recorte existe para evitar. Entra en la
migración con `create or replace function public.fn_auditar(...)`, y con su prueba.

### 4 · Las seis tablas, y lo que NO se crea

`tarifas_paciente` · `borradores_factura` · `borradores_factura_versiones` ·
`facturas_espejo` · `cobros` · `bonos`, con la forma del ticket. Importes en
`numeric(12,2)`, nunca coma flotante.

**No se crean, y la migración lo dice citando el ADR-053**: `facturas`, `factura_lineas`,
`series_facturacion`, `gastos`, `registro_eventos_sif`. Ni `qr`, ni `pdf`, ni copia del
registro de facturación: conservar es una de las ocho funcionalidades que obligarían a
certificar.

### 5 · Lo derivado no se almacena

Tres cosas que el ticket pide derivadas, y las tres son vistas:

- **`pendiente`** = total del espejo − suma de cobros. Una devolución es **una fila con
  importe negativo**, así que la suma ya la recoge sin restar nada a mano.
- **`sesiones_consumidas`** de un bono = `count(*)` de `citas` con ese `bono_id` y
  `estado = 'realizada'`. Por eso entra **`citas.bono_id`** en esta migración y no en T-010:
  cuando T-010 corrió, `bonos` no existía.
- **Estado del borrador** (`sin_enviar`/`enviado`/`facturado`/`descartado`): `facturado` es
  tener espejo enlazado. Un contador o un estado guardados son un `UPDATE`, y aquí no se
  actualiza nada.

### 6 · Inmutabilidad en tres capas, sobre las tres tablas que la piden

`borradores_factura_versiones`, `facturas_espejo` y `cobros`:

1. `revoke update, delete on table ... from authenticated` — y también del propietario, como
   enseñó T-004.
2. Disparador `before update or delete for each row` → `fn_impedir_modificacion()`.
3. **`before truncate for each statement`** → la misma función. `TRUNCATE` no lo interceptan
   ni las políticas ni los disparadores de fila: sin esta tercera capa, una tabla «inmutable»
   se vacía en una línea.

### 7 · RLS, por rol y por tabla

| Tabla | administrador | profesional_sanitario | tecnico_administrativo |
|---|---|---|---|
| `tarifas_paciente` | todo | los de sus pacientes | **nada** |
| `borradores_factura` (+versiones) | todo | los suyos | **nada** |
| `facturas_espejo` | todo | los suyos | **cabecera**, por centro |
| `cobros` | todo | los suyos | **sí**, por centro |
| `bonos` | todo | los de sus pacientes | **sí**, por centro |

El técnico ve dinero y no ve clínica: esa es la línea. «La cabecera del espejo y no las líneas
del borrador» **no se resuelve con una política**, porque RLS acota filas y no columnas: se
resuelve con **una vista** que no expone `cita_id` ni las líneas, igual que `citas_agenda`
resolvió lo mismo en T-010. Es el único sitio donde este ticket necesita una vista por
seguridad y no por comodidad.

`facturas_espejo` no la escribe nadie por sesión: `revoke insert, update, delete` para
`authenticated`, y entra por la función `security definer` del sincronizador de T-026.

### 8 · Orden de la migración

Comentario del ADR-053 sobre lo que no se crea → `comment on type regimen_iva` →
enums nuevos (`forma_pago`, `proveedor_facturacion`) → `tarifas_paciente` →
`borradores_factura` → `borradores_factura_versiones` → `facturas_espejo` → `cobros` →
`bonos` → `citas.bono_id` → `resolver`/`sellar` del borrador → vistas derivadas →
`create or replace fn_auditar` con el recorte nuevo → disparadores de auditoría e
inmutabilidad → RLS y políticas → `grant`/`revoke` → comentarios.

### 9 · El banco: `scripts/rls/18-economico.sql`

Al final y con el número siguiente. Lo que tiene que discriminar de verdad, más allá de los
criterios del ticket:

- Que el técnico ve `cobros` **y** no ve `tarifas_paciente` — negativa y gemela positiva en la
  misma sesión, que es como se distingue «no ve» de «no hay».
- Que `sesiones_consumidas` **baja** al cancelar una cita: una vista que solo suma podría estar
  contando otra cosa.
- Que el NIF cifrado **no aparece en `auditoria`** tras insertar una versión.
- Que `truncate` falla sobre las tres inmutables, con su código.

### 10 · Riesgos, por probabilidad

1. **Olvidar el recorte de `fn_auditar()`** y duplicar el NIF cifrado en auditoría. Es el
   fallo más probable porque el ticket no lo menciona.
2. **Derivar mal el pendiente** si alguien «arregla» las devoluciones restando en vez de sumar
   un negativo.
3. **La tentación de la numeración**: cualquier `siguiente_numero` aquí es un incumplimiento,
   no una comodidad.
4. Que la cadena hermana se escriba «parecida» y no igual, y que la primera diferencia
   aparezca al verificar una cadena real.

### 11 · Tres cosas que el ticket da por buenas y no lo son

1. **El enum de IVA ya existe** con otros nombres (§1).
2. **No hay función de cifrado que reutilizar**: son cuatro columnas y la aplicación (§3).
3. **La cadena de T-005 no se puede reutilizar tal cual**: se escribe hermana (§2). Y el
   ticket no menciona el recorte de `fn_auditar()`, que es obligatorio.

---

## Adenda: contraste con main (03-10-2026)

> Arquitecto, 03-10-2026, contra `main` en `e3e24f0`. El contrato (`tickets/T-021-economico-esquema.md`)
> no cambia. El diseño de arriba sigue vigente salvo donde esta adenda lo sustituye; **si chocan,
> manda la adenda**. No se implementa hasta que le toque el turno en la cola de `supabase/`
> (T-015 → T-039 → T-038 → T-040 B → T-041 → T-028 B → **T-021**).

### A.0 · Hechos verificados contra main

| Hecho | Dónde | Consecuencia |
|---|---|---|
| `regimen_iva` sigue siendo `('exento_sanitario', 'general')`. El comentario de T-010 dice que el porcentaje «es dato de facturación (T-021)» | `supabase/migrations/20260906120000_agenda_esquema.sql:58-62`, `:101` | §1 se mantiene. El porcentaje entra sellado en la línea (A.1-D4) |
| `lib/dinero` (T-031) depende de esos dos nombres: `RegimenIva = 'exento_sanitario' \| 'general'`, `TIPO_IVA_GENERAL = 21`, «el precio que se teclea es el precio final, CON IVA» | `lib/dinero/iva.ts:1-26` | **Queda cerrado el renombrado que §1 dejaba abierto.** No se renombra |
| `pendiente(total, cobrado)` devuelve `{estado, pendiente ≥ 0, excedente}`; un cobro de más **no** deja el pendiente bajo cero | `lib/dinero/reparto.ts:31-60` | La vista del pendiente sigue esa semántica (A.1-D7) |
| `fn_auditar()` recorta lo que recibe **como argumento del disparador** (`TG_ARGV[1..]`). El mapa `c_recorte` está en un bloque `DO` de T-004 que solo creó los disparadores de entonces; no vive dentro de la función | `20260829150000_auditoria_y_solo_adicion.sql:45-84` y `:295-312` | **§3 y §8 se equivocan**: no hay `create or replace fn_auditar`. Cada disparador lleva su recorte (A.1-D2) |
| Es el patrón de las migraciones posteriores: `fn_auditar('id', 'nota_operativa')` en citas, `fn_auditar('id','alergias','medicacion_actual')` | `20260906120000:643`, `20260916120000:202` | Se sigue ese patrón |
| `lib/cifrado/` existe (T-032): `cifrar(clave, texto) → {cifrado, nonce, etiqueta}`, `claveDeCifrado()` lee del Vault `identificacion_cifrado_v1` y `VERSION_CLAVE = 1`. `clave_de_cifrado(text)` solo la ejecuta `service_role` | `lib/cifrado/aes-gcm.ts:9-46`, `lib/cifrado/claves.ts:12-43`, `20260916120000:241-242` | §0 y §11.2 («no hay función de cifrado») ya no son ciertos: la función existe en la aplicación. La base sigue guardando cuatro columnas (A.1-D3) |
| La forma vigente de `fn_sellar_version_nota()` y `verificar_cadena_huellas()` es la de T-036 (detalle debajo de la tabla) | `20261003120000_firma_cotejada_con_borrador_y_cita.sql`; historia en 20260915130000, 20260924150000 y 20261001120000 | La hermana de §2 copia **esta** forma, no la de `20260829210000` que cita §0 (A.1-D5) |
| `fn_congelar_cabecera_sellada()` es de la nota: busca en `notas_clinicas_versiones` | `20260822094547_…:1282-1300` | No sirve para el borrador. Tampoco hace falta: la cabecera del borrador no tiene columnas modificables (A.1-D5) |
| `cobertura_solo_adicion()` exige que **nadie**, `postgres` incluido, tenga UPDATE o DELETE, y además el disparador de fila y el de sentencia. El catálogo es `tablas_solo_adicion` | `20260829150000:432-507` | Las tres tablas inmutables entran en el catálogo. El sincronizador definer tampoco podrá actualizar el espejo (A.1-D9) |
| `10-solo-adicion.sql` recorre el catálogo y espera que `update` y `delete` lancen **con el privilegio recuperado**. En una tabla **vacía** el disparador de fila no salta y la aserción falla. Las tablas actuales ya tienen filas antes del módulo 10 (`pacientes_salud_basica` se rellena en `02-matriz-roles.sql:69-75`) | `scripts/rls/10-solo-adicion.sql:13-53`, `scripts/rls/00-ayudantes.sql:27-40` | Las tres tablas nuevas necesitan una fila de fijación **antes** del módulo 10 (A.1-D11) |
| Una tabla de solo adición no puede ser destino de una clave ajena | `.claude/rules/supabase.md:16` | `cobros.factura_espejo_id` y `bonos.factura_espejo_id` van sin FK (A.1-D6) |
| `citas` tiene un `grant … update on table` entero. T-039 lo cambia por privilegios por columna, con esta regla: «una columna nueva de `citas` nace cerrada a `authenticated`; si debe escribirse a mano, se añade a estos `grant`» | `20260906120000:856`; `tickets/T-039/diseno.md` §1.4 | T-021 concede `update (bono_id)` de forma explícita (A.1-D8) |
| `fn_proteger_cita_pasada()` no incluye `bono_id` en su lista, y T-039 la redefine (§1.8) | `20260910120000:343-378` | T-021 no la toca (A.1-D8) |
| `citas` no tiene ninguna regla de transición de `estado`: `realizada → cancelada` pasa. Solo la alerta de nota sin firmar mira `new.fin > now()` | `20260906120000:462` | El criterio «cancelar baja a 2» se prueba con citas futuras (A.3) |
| El outbox **existe**: `eventos_salientes`, con RLS y cero políticas, «sin consumidor ni cron: eso es T-015/T-026» | `20260910120000:48-66` | `enviado` tendría de dónde salir, pero el tipo de evento lo define T-026 (P2) |
| T-026 dice que el sincronizador actualiza **solo** `estado_proveedor` y `sincronizado_en` de un documento que ya está en el espejo | `tickets/T-026-proveedor-facturacion-holded.md:66-72` | **Choca** con el espejo de solo adición del contrato de T-021 y con `cobertura_solo_adicion()` (P3) |
| `rol_usuario` sigue con tres valores. `rol_actual()` puede ser nulo, y con nulo `<> 'administrador'` no es seguro | `20260815192424:18-22`; `tickets/T-041/diseno.md:180` | Las políticas comparan en positivo (`= '…'::public.rol_usuario`) |
| Patrón del técnico por centro: `paciente_id in (select p.id from public.pacientes p where p.centro_id in (select public.centros_actuales()))` | `20260916120000:349-357` | Las ramas del técnico lo copian literal |
| `btree_gist` vive en `extensions` y la opclase se cualifica (`extensions.gist_uuid_ops`) | `20260906120000:26`, `:298-305` | Exclusión de solapes en `tarifas_paciente` (A.2) |
| La última migración es `20261005120000_base_del_alta_de_cita.sql`. Sellos reservados: T-015 `20261006120000`, T-039 `20261007120000`, T-038 `20261008…`, T-040 B `20261009120000`, T-041 `20261010120000` | `ls supabase/migrations`; diseños de T-015, T-039, T-040 y T-041 | Sello de T-021: `20261011120000` |
| Existen los bancos `00` a `21`. Reservados: `22-avisos` (T-015), `23-cita-en-episodio` (T-039), `24-exportaciones` (T-040 B), `25-altas-de-centro` (T-041). El `18` es `18-agenda-rango.sql` | `ls scripts/rls`; `scripts/rls/README.md` | El banco de T-021 es `26-economico.sql`, no `18-economico.sql` (§9) |
| `scripts/lint-migraciones.ts` tiene su propia `TABLAS_SOLO_ADICION`, que incluye `facturas` (retirada por el ADR-053); la prueba fija la lista entera | `scripts/lint-migraciones.ts:25-31`; `scripts/lint-migraciones.test.ts:204-209` | Las tres tablas se añaden a ambas (A.1-D10) |
| El seed no toca dinero. `lib/economico/` no existe ni figura en la tabla de dueños | `grep` sobre `supabase/`, `scripts/`, `lib/`; `.claude/rules/pipeline.md` | A.1-D12 |

Detalle de la forma vigente de la cadena de la nota (T-036):

- **Disparador `fn_sellar_version_nota()`**, por pasos:
  - Paso 0: comprobación de permisos para `authenticated`/`anon` (42501).
  - Paso 1: el llamante no puede mandar huella, huella anterior, paciente, posición ni versión.
  - Paso 1.bis: `algoritmo_version = 1`.
  - Cabecera con `for no key update` y cerrojo consultivo.
  - Génesis: 32 bytes cero.
  - Claves exactas, contadas con `json_object_keys`.
  - Cotejo sobre–fila con `is distinct from` (23514).
  - `creada_en`: ±1 minuto para `authenticated`.
  - Huella: digest sha256 de `extensions`.
- **Verificador `verificar_cadena_huellas()`**:
  - Devuelve `table(paciente_id, posicion_cadena, version_id, nota_id, creada_en, motivo)`.
  - Motivos: `era_desconocida`, `huella_no_coincide`, `genesis_incorrecto`, `hueco_de_posicion`, `eslabon_desencadenado` y `sobre_no_coincide_con_fila`.
  - No se concede a `authenticated`.

### A.1 · Qué ya no casa y cómo se ajusta

**D1 · Enum (§1).** Se mantiene. Se reutiliza `regimen_iva` y solo se añade su `comment on type`
con el art. 20.Uno.3.º y el 21 %. El párrafo «Anotado para una persona» **queda cerrado**: el
nombre lo fijaron T-010 y T-031, y `lib/dinero/iva.ts` depende de él. La tarea 1 del contrato
(`exento_20_uno_3`/`general_21`) se cierra así, como ya aprobó §1 el 12-09.

**D2 · Recorte de auditoría (§3, §8, §10.1, §11.3).** **No** hay `create or replace fn_auditar`.
Cada tabla lleva su propio disparador:
`after insert or update or delete for each row execute function public.fn_auditar('id', <columnas recortadas>)`.
- `borradores_factura_versiones`: `fn_auditar('id', 'destinatario_nif_cifrado', 'destinatario_nif_nonce', 'destinatario_nif_etiqueta', 'contenido_canonico')`.
  - `contenido_canonico` se recorta porque lleva dentro el criptograma.
  - `destinatario_nif_clave_version` se queda, igual que en `pacientes_identificacion`.
- Las otras cinco: `fn_auditar('id')`, sin recorte. No guardan nada cifrado ni clínico.

**D3 · NIF del destinatario (§3, §11.2).** Siguen siendo cuatro columnas, ahora **todas nulas o
ninguna**, porque un particular no siempre da NIF:
- `check (num_nonnulls(...) in (0, 4))`.
- Nonce de 12 bytes y etiqueta de 16.
- `destinatario_nif_clave_version smallint check (… = 1)`.

La aplicación que lo escriba usará `cifrar()` de `lib/cifrado/aes-gcm.ts` con la clave que se
decida en P4. En T-021 nadie cifra desde la aplicación: el banco escribe bytes de prueba.

**D4 · Importes y porcentaje.**
- Las columnas van en `numeric(12,2)`, como manda el contrato.
- **En el sobre van céntimos enteros** (`base_centimos`, `cuota_iva_centimos`, `total_centimos`,
  `precio_unitario_centimos`), igual que `Centimos` de `lib/dinero`, porque JCS y los decimales
  no se llevan bien.
- Cada línea sella `tipo_iva_centesimas`, un entero (`2100` = 21 %, `0` si exento). Así se cumple
  el comentario de T-010: el porcentaje es dato de facturación y cambia por ley.
- `precio_unitario` es **con IVA**, como el precio tecleado de `lib/dinero/iva.ts`, y así lo dice
  su `comment on column`.

**D5 · La cadena hermana (§2).** Se mantiene la decisión (hermana, no generalización), pero copia
la forma **actual**, la de `20261003120000`, y no la de `20260829210000`. El contrato está en A.2.
Cambios respecto a §2:
- **El sobre no se construye en TypeScript en este ticket** (ver D12).
- La cabecera `borradores_factura` no tiene columnas modificables: no se da `grant update` a
  ninguna sesión. Por eso no necesita disparador de congelado.
- El verificador incluye `sobre_no_coincide_con_fila`.

**D6 · Sin FK al espejo.** `cobros.factura_espejo_id` y `bonos.factura_espejo_id` son `uuid` sin
`references`. Un disparador `security definer` exige que el espejo exista (23503) y que sea del
mismo paciente (23514). Tiene que ser disparador y no `with check`: el técnico no tiene política
de lectura sobre `facturas_espejo`, así que un `exists` dentro de su política vería cero filas y
rechazaría siempre el enlace.

**D7 · El pendiente (§5).** «Total del espejo menos los cobros **de ese espejo**» no funciona con
cobros inmutables. Lo normal es cobrar antes de facturar, con `factura_espejo_id` nulo, y ese
cobro **no se puede enlazar después**, porque enlazarlo sería un `UPDATE`. Calculado por espejo,
el pendiente sería siempre el total. Se deriva **por paciente**: suma de los totales de sus
espejos menos la suma de sus cobros, con la semántica de `pendiente()` (nunca negativo, más
excedente). **P1.**

**D8 · `citas.bono_id` (§5).**
- `alter table public.citas add column bono_id uuid references public.bonos (id)`: nula y sin default.
- `grant update (bono_id) on public.citas to authenticated`, explícito. Con el grant de tabla de
  hoy es redundante; con los privilegios por columna de T-039 es necesario. Funciona en los dos casos.
- Disparador nuevo `fn_bono_de_la_cita()`, `before insert or update of bono_id, paciente_id on public.citas`:
  si `new.bono_id` no es nulo y el bono es de otro `paciente_id`, 23514.
- `fn_proteger_cita_pasada()` **no se toca**: es de T-039. Se puede seguir cambiando el bono de
  una cita pasada (es corregir un error de cobro), y el cambio queda en `auditoria` por el
  disparador que `citas` ya tiene.

**D9 · El espejo (§7).** Es de solo adición, con las tres capas, y entra en `tablas_solo_adicion`.
Para cerrar el criterio «por la función `security definer` del sincronizador **entra**», T-021
crea esa función (A.2). Solo la ejecuta `service_role`, igual que `clave_de_cifrado`; T-026 la
llamará. El choque con T-026 es **P3**.

**D10 · Linter.** Las tres tablas entran también en `TABLAS_SOLO_ADICION` de
`scripts/lint-migraciones.ts`, y su prueba (`:204-209`) se amplía. `facturas` se queda: el propio
fichero dice que quitarla «es una decisión de arquitectura». Va a hallazgos.

**D11 · Banco (§9).**
- Módulo `scripts/rls/26-economico.sql`, con su fila en `README.md`.
- **Una fila de cada tabla inmutable en `01-fijacion.sql`.** Sin ella, `10-solo-adicion` falla
  con «debía lanzar y no lanzó» al hacer `update` sobre una tabla vacía con el privilegio recuperado.
- Ayudante `pg_temp.sobre_borrador(...)` en `00-ayudantes.sql`, junto a `sobre_prueba`.
- Los nombres de las políticas nuevas, en `11-cobertura.sql`.

**D12 · `lib/economico/` sale del ticket.** Ningún criterio escribe un borrador desde la
aplicación. El sobre lo definen el disparador (claves exactas y cotejo) y el banco, que lo
construye en SQL. El constructor TypeScript, con sus vectores congelados frente a este disparador,
lo escribirá el primer ticket que guarde un borrador desde la aplicación: la pantalla de borrador
o T-026. Además, así desaparece la duda de quién es el dueño de `lib/economico/**`.

**D13 · El criterio del `grep`.** El contrato pide dos cosas a la vez:
- un comentario que **nombre** `series_facturacion` y `registro_eventos_sif` citando el ADR-053;
- que `grep -riE "serie|numeracion|qr|verifactu|registro_facturacion"` no encuentre nada en la migración.

Solo son compatibles si el `grep` recorre las líneas que **no** son comentario. Por eso:
- El comentario va con `--`, nunca con `comment on`.
- Ninguna línea de código contiene esas cadenas. Cuidado con copiar la lista de columnas de
  `citas`, que lleva `serie_id`.

El comando exacto está en A.3.

**D14 · El criterio «verifica con la función de T-005».** Se cierra con `verificar_cadena_borrador()`,
la hermana que §2 aprobó el 12-09: el mismo mecanismo con otro sobre. Queda escrito aquí para que
el revisor no lo tome por un incumplimiento.

### A.2 · Piezas y contratos al día

**Migración `supabase/migrations/20261011120000_economico_esquema.sql`.** El sello es provisional:
antes de escribir, el implementador comprueba con `ls supabase/migrations | tail -1` que es la
última y, si no, toma el siguiente día libre. Este orden sustituye al de §8:

1. Comentario `--` del ADR-053 sobre lo que no se crea.
2. `comment on type public.regimen_iva`.
3. Enums nuevos: `forma_pago ('efectivo','transferencia','tarjeta','bizum','otro')` y
   `proveedor_facturacion ('holded')`.
4. `alter default privileges in schema public revoke all on tables from anon, authenticated, service_role`,
   y lo mismo `on sequences`, como en `20260829150000:408-409`.
5. Tablas.

   **`tarifas_paciente`**
   - `id uuid pk`.
   - `paciente_id → pacientes`, `tipo_terapia_id → tipos_terapia`.
   - `importe numeric(12,2) not null check (> 0)`.
   - `regimen_iva public.regimen_iva not null`, sin default: lo marca el usuario (ADR-053 j).
   - `vigente_desde date not null`, `vigente_hasta date` con `check > vigente_desde`.
   - `creada_por → perfiles not null`, `creada_en timestamptz default now()`.
   - `exclude using gist (paciente_id extensions.gist_uuid_ops with =, tipo_terapia_id extensions.gist_uuid_ops with =, daterange(vigente_desde, vigente_hasta, '[)') with &&)`.

   **`borradores_factura`** (cabecera)
   - `id`, `paciente_id → pacientes`, `profesional_id → perfiles`, `creado_por → perfiles`, `creado_en`.

   **`borradores_factura_versiones`**
   - `id`, `borrador_id → borradores_factura`, `numero_version int`.
   - `huella bytea unique`, `huella_anterior bytea`, `algoritmo_version smallint`, `contenido_canonico text`.
   - `paciente_id` y `profesional_id`, que pone el disparador desde la cabecera.
   - `centro_id → centros`, nulo.
   - `destinatario_nombre text not null` y las cuatro columnas de D3.
   - `lineas jsonb not null check (jsonb_typeof = 'array' and jsonb_array_length >= 1)`.
   - `base`, `cuota_iva`, `total numeric(12,2)`, con `check (base + cuota_iva = total)`.
   - `descartado boolean not null default false` (P2).
   - `creada_por → perfiles`, `creada_en`.
   - `unique (borrador_id, numero_version)`.

   **`facturas_espejo`**
   - `id`, `borrador_id → borradores_factura`.
   - `proveedor public.proveedor_facturacion`, `proveedor_documento_id text`.
   - `numero text`, `fecha_expedicion date`.
   - `base`, `cuota_iva`, `total numeric(12,2)`.
   - `estado_proveedor text`, `url_proveedor text`, `sincronizado_en timestamptz`.
   - `unique (proveedor, proveedor_documento_id)`.
   - **Ninguna** columna de PDF, QR ni huella.

   **`cobros`**
   - `id`, `factura_espejo_id uuid` sin FK (D6), `paciente_id → pacientes`.
   - `importe numeric(12,2) not null check (<> 0)`. Un importe negativo es una devolución.
   - `fecha date not null`, `forma_pago public.forma_pago not null`, `referencia text`.
   - `registrado_por → perfiles not null`, `registrado_en timestamptz default now()`.

   **`bonos`**
   - `id`, `paciente_id → pacientes`.
   - `sesiones_totales int check (> 0)`, `importe numeric(12,2) check (> 0)`, `caducidad date`.
   - `factura_espejo_id uuid` sin FK.
   - `creado_por`, `creado_en`.

6. `citas.bono_id` y `fn_bono_de_la_cita()` (D8).
7. Funciones.

   **`fn_sellar_version_borrador()`**: `before insert` sobre las versiones, `security definer`,
   `search_path = ''`. Sigue el orden de pasos de la nota:
   - **Paso 0.** Si `current_user` es `authenticated` o `anon`, réplica de la política de alta de
     versiones: administrador, o (`profesional_id` de la cabecera = `auth.uid()` y
     `es_profesional_asignado(paciente)`). Si no se cumple, **un único** 42501, sin revelar si la
     cabecera existe.
   - **Paso 1.** Si el llamante manda `huella`, `huella_anterior`, `numero_version`, `paciente_id`
     o `profesional_id`, 42501.
   - **Paso 1.bis.** `algoritmo_version = 1`.
   - **Paso 2.** Cabecera con `for no key update`.
   - **Paso 3.** `pg_advisory_xact_lock(hashtextextended('cadena_borrador:' || borrador_id, 0))`.
   - **Pasos 4-5.** `numero_version` = máximo + 1. `huella_anterior` = la huella previa, o 32 bytes cero.
   - **Paso 6.** El sobre tiene **quince claves exactas**, contadas con `json_object_keys`:
     `esquema_version` (1), `borrador_id`, `numero_version`, `paciente_id`, `profesional_id`,
     `centro_id`, `destinatario_nombre`, `destinatario_nif`, `lineas`, `base_centimos`,
     `cuota_iva_centimos`, `total_centimos`, `descartado`, `creada_por` y `creada_en`.
     - `destinatario_nif` es un objeto `{cifrado, nonce, etiqueta}` en base64 más `clave_version`, o `null`.
     - `creada_en` usa la forma ISO de la nota.
     - Cada clave se coteja con su columna con `is distinct from`. Si no coincide, 23514 con un
       fragmento de mensaje propio.
     - Cada línea tiene **exactamente** `concepto`, `cantidad` (entero ≥ 1),
       `precio_unitario_centimos`, `regimen_iva`, `tipo_iva_centesimas` y `cita_id` (uuid o null).
     - Tres comprobaciones más, cada una 23514:
       - la suma de `cantidad × precio_unitario_centimos` es `total_centimos`;
       - si todas las líneas son `exento_sanitario`, la cuota es 0;
       - cada `cita_id` existe y es del mismo paciente.
   - **Paso 6.x.** Solo para `authenticated`: `creada_por = auth.uid()` y `creada_en` a ±1 minuto de `now()`.
   - **Paso 7.** `huella = extensions.digest(convert_to(contenido_canonico, 'UTF8') || huella_anterior, 'sha256')`.

   **`verificar_cadena_borrador(p_borrador_id uuid default null)`**
   - Devuelve `table(borrador_id uuid, numero_version int, version_id uuid, creada_en timestamptz, motivo text)`.
   - `stable security definer`, con los seis motivos de la nota.
   - Se revoca la ejecución a `public`, `anon` y `authenticated`.

   **`registrar_factura_espejo(...)`**: `security definer`. Firma:
   `registrar_factura_espejo(p_borrador_id uuid, p_proveedor public.proveedor_facturacion, p_proveedor_documento_id text, p_numero text, p_fecha_expedicion date, p_base numeric, p_cuota_iva numeric, p_total numeric, p_estado_proveedor text, p_url_proveedor text) returns uuid`.
   - Exige que el borrador exista (23503).
   - Si ya hay una fila con el mismo `(proveedor, proveedor_documento_id)`: idéntica, devuelve su
     `id`; distinta, 23505. Nunca actualiza.
   - `sincronizado_en = now()`.
   - Ejecución revocada a `public`, `anon` y `authenticated`; concedida a `service_role`.

   **`fn_espejo_del_paciente()`** (D6): `before insert` sobre `cobros` y
   `before insert or update of factura_espejo_id` sobre `bonos`. En `bonos`, cambiar un valor por
   otro o por nulo da 42501.

   **`fn_cerrar_tarifa()`**: `before update` sobre `tarifas_paciente`. Si `old.vigente_hasta` ya
   no es nulo, 42501 («ya cerrada»).

8. Vistas.

   **`borradores_factura_estado`** (`security_invoker = true`): `borrador_id`, `ultima_version`, `estado`.
   - `facturado` si existe un espejo.
   - Si no, `descartado` si la última versión tiene `descartado`.
   - Si no, `sin_enviar`.
   - `enviado`, en P2.

   **`facturas_espejo_cabecera`** (`security_invoker = false, security_barrier = true`)
   - Columnas: `id`, `borrador_id`, `paciente_id`, `proveedor`, `numero`, `fecha_expedicion`,
     `base`, `cuota_iva`, `total`, `estado_proveedor`, `url_proveedor`, `sincronizado_en` y el
     `destinatario_nombre` de la última versión.
   - **Sin** `lineas` ni `cita_id`.
   - El `where` repite las tres ramas de rol.

   **`bonos_consumo`**: definer con barrera, porque el técnico no lee `citas`.
   - Columnas: `bono_id`, `paciente_id`, `sesiones_totales` y
     `sesiones_consumidas = count(citas where bono_id = b.id and estado = 'realizada')`.
   - El `where` repite exactamente la política de lectura de `bonos`.

   **`pendiente_paciente`**: definer con barrera (P1).
   - Columnas: `paciente_id`, `facturado`, `cobrado`, `pendiente = greatest(facturado − cobrado, 0)`,
     `excedente = greatest(cobrado − facturado, 0)` y `estado`, con los tres valores de `EstadoCobro`.
   - El `where` sigue la política de `cobros`.

9. Disparadores:
   - las tres capas sobre las tres tablas inmutables, con `fn_impedir_modificacion()`;
   - el sellado;
   - la auditoría (D2) en las seis tablas.
10. Inserción de las tres tablas en `tablas_solo_adicion`, cada una con su motivo: art. 29.2.j LGT,
    ADR-053 d y ADR-053 g.
11. RLS y políticas. Todas comparan el rol en positivo. «Técnico de su centro» es el patrón de A.0.

    | Política | Para | Condición |
    |---|---|---|
    | `tarifas_paciente_lectura` / `_alta` / `_cierre` | select / insert / update | Administrador, o `es_profesional_asignado(paciente_id)`. El técnico, **nada**. El `with check` del alta exige `creada_por = auth.uid()` |
    | `borradores_factura_lectura` / `_alta` | select / insert | Administrador, o `profesional_id = auth.uid()`. El alta del profesional exige además `es_profesional_asignado` |
    | `borradores_factura_versiones_lectura` / `_alta` | select / insert | Lectura: la cabecera es legible. Alta: el paso 0. El técnico, **nada** |
    | `facturas_espejo_lectura` | select | Administrador, o el profesional del borrador. El técnico, por la vista. **Sin** políticas de insert, update ni delete |
    | `cobros_lectura` / `_alta` | select / insert | Administrador, `es_profesional_asignado(paciente_id)` o técnico de su centro. El `with check` exige `registrado_por = auth.uid()` |
    | `bonos_lectura` / `_alta` / `_modificacion` | select / insert / update | Las tres ramas de `cobros` |

12. Grants, después de `revoke all … from public, anon, authenticated, service_role`:

    | Objeto | Grant a `authenticated` |
    |---|---|
    | `tarifas_paciente` | `select, insert`, y `update (vigente_hasta)` |
    | `borradores_factura`, `borradores_factura_versiones`, `cobros` | `select, insert` |
    | `facturas_espejo` | solo `select`. `insert` no se concede a nadie |
    | `bonos` | `select, insert`, y `update (caducidad, factura_espejo_id)` |
    | Las cuatro vistas | `select` |

    Capa 1 de las tres tablas inmutables: `revoke update, delete, truncate … from public, anon, authenticated, service_role, postgres`.
13. `comment on`:
    - cada tabla;
    - las columnas `concepto` (dentro de `lineas`: «nunca clínico, ADR-053 i»), `precio_unitario`,
      `importe` (con IVA) y `tipo_iva_centesimas`;
    - cada función.

**Después de `db reset`:** `npm run tipos` → `lib/supabase/tipos-bd.ts`.

### A.3 · Cómo se cierra cada criterio

| Criterio | Comprobación |
|---|---|
| `db reset` | `npx supabase db reset` sin error, y `npm run tipos` sin diferencias pendientes |
| `update`, `delete` y `truncate` fallan en las tres | `10-solo-adicion` las recorre por catálogo (necesita las filas de `01-fijacion`), y `cobertura_solo_adicion()` = 0. En `26`, además, como `authenticated`, `assert_lanza_codigo` con 42501 |
| Una cadena de tres versiones verifica, y alterar la segunda la rompe | En `26`: tres versiones como ADM y `verificar_cadena_borrador(B)` = 0 filas. Después, con los cerrojos levantados como en `14-cadena-huellas.sql`, se cambia `total` de la v2: el verificador devuelve `huella_no_coincide` o `sobre_no_coincide_con_fila` en la v2, y `eslabon_desencadenado` si se toca `huella` |
| Insert en el espejo | Como PRO1, ADM y TEC1, `insert into facturas_espejo` → 42501. Como `postgres`/`service_role`, `registrar_factura_espejo(...)` devuelve un uuid y la fila existe. Como `authenticated`, el `execute` de esa función → 42501 |
| Cobro sin espejo | Como TEC1 (en su centro) y como ADM, `insert into cobros` con `factura_espejo_id` nulo entra |
| `sesiones_consumidas`: 3 → 2 | Tres citas **futuras** con el mismo `bono_id`, que no se solapen (por `citas_sin_solape_profesional`). Al pasarlas a `realizada`, `bonos_consumo` = 3. Al pasar una a `cancelada`, 2. Gemela: el `xmin` de `bonos` no cambia (no hubo `UPDATE`) |
| Bonos: el técnico ve los de su centro y el profesional los suyos | TEC1 ve el bono del paciente de su centro y no el de otro centro. PRO1 ve el de su paciente y no el ajeno. Cada negativa con su gemela positiva. Lo mismo sobre `bonos_consumo` |
| Técnico: cobros sí, tarifas no, sin `cita_id` | TEC1: `cobros` > 0; `tarifas_paciente` = 0 (gemela: ADM > 0 sobre la misma fila); `borradores_factura_versiones` = 0 (gemela: ADM 1). Las columnas de `facturas_espejo_cabecera` en `information_schema.columns` no incluyen `cita_id` ni `lineas`, y TEC1 lee de esa vista > 0 filas |
| Profesional: cero borradores ajenos, uno propio | PRO1 cuenta 1 sobre su borrador y 0 sobre el de PRO2. Lo mismo en `borradores_factura_estado` |
| Auditoría al insertar | Por cada una de las seis tablas, `auditoria` tiene un `INSERT` con su `registro_id`. En las versiones, `estado_posterior ? 'destinatario_nif_cifrado'` y `? 'contenido_canonico'` son falsos, y `? 'destinatario_nif_clave_version'` es verdadero |
| `test:rls`, lint y build | `npm run test:rls && npm run lint && npm run build` |
| Linter | `npm run lint:migraciones` en verde, y `npm test -- lint-migraciones` con la lista ampliada |
| Manual: el `grep` | `grep -vE '^\s*--' supabase/migrations/20261011120000_economico_esquema.sql \| grep -ciE "serie\|numeracion\|qr\|verifactu\|registro_facturacion"` → `0` |
| Nota «el seed no lo viola» | `grep -ciE "borradores_factura" supabase/seed.sql supabase/seed-completo.sql` → 0: el seed no tiene borradores. El primer ticket que los siembre lo comprueba |

### A.4 · Riesgos, por probabilidad (sustituye a §10)

1. **Que `10-solo-adicion` falle por tablas vacías.** Ocurre seguro si la fijación no va en `01`.
2. **Que una vista definer deje ver filas de otro centro** (`bonos_consumo`, `pendiente_paciente`,
   `facturas_espejo_cabecera`). Pasa si su `where` no repite la política exacta. Es la puerta
   lateral de este ticket.
3. **Que la cadena hermana se escriba «parecida»**: el paso 0 olvidado antes del cotejo (deja un
   oráculo de existencia), o `jsonb_object_keys`, que deduplica claves.
4. **Que el `grep` del criterio manual dé positivos** por el comentario del ADR-053 o por una lista
   de columnas de `citas`.
5. **Que una migración posterior pierda `bono_id`** al rehacer los `grant` de `citas` por columna.
6. **ADR-065:** cuando llegue el director administrativo como valor nuevo de `rol_usuario`, las
   políticas económicas de `administrador` tendrán que incluirlo («facturación completa»).

### A.5 · Qué revisar

- **Qué columnas elige el llamante.** En las versiones, solo `borrador_id`, `centro_id`,
  `destinatario_*`, `lineas`, importes, `descartado`, `creada_*` y `contenido_canonico`; el resto
  lo fija el disparador. Mandar `huella`, `numero_version`, `paciente_id` o `profesional_id` da
  42501, con una prueba por columna.
- **Paso 0 antes del cotejo.** Una versión sobre la cabecera de otro profesional, con un sobre
  incoherente, tiene que dar **el mismo 42501** que con un sobre correcto. Si da 23514, el orden
  está mal.
- **Mutantes.**
  - Quitar una comprobación de 6.x hace fallar su aserción, y solo la suya (fragmentos de mensaje
    únicos, `.claude/rules/supabase.md:47`).
  - `jsonb_object_keys` en lugar de `json_object_keys` deja pasar una clave duplicada.
- **Nulos.**
  - `destinatario_nif`: todo o nada.
  - `centro_id` nulo va en el sobre como `null`, no ausente.
  - `rol_actual()` nulo no entra en ninguna rama.
- **Duplicados.**
  - Dos espejos del mismo documento del proveedor: 23505 si difieren.
  - Dos tarifas solapadas: las rechaza la exclusión.
  - `registrar_factura_espejo` llamada dos veces con los mismos datos devuelve el mismo `id`.
- **Concurrencia.** Dos versiones simultáneas del mismo borrador se serializan por el cerrojo
  consultivo y no repiten `numero_version`.
- **Permisos de tabla entera.**
  - `\dp` de las seis tablas: ni `TRUNCATE`, ni `TRIGGER`, ni `REFERENCES` para `authenticated`.
  - `has_column_privilege('authenticated','public.citas','bono_id','UPDATE')` es verdadero.
  - Nadie tiene `insert` sobre `facturas_espejo`.
- **TRUNCATE.** Capa 3 en las tres, y `cobertura_solo_adicion()` = 0.
- **Puertas laterales del técnico.**
  - `auditoria` de las versiones: no tiene filas propias, porque no inserta ninguna.
  - Las cuatro vistas.
  - `execute` de `verificar_cadena_borrador` y de `registrar_factura_espejo`: 42501.
- **`cobros.factura_espejo_id` de otro paciente** → 23514, también para el técnico aunque no vea el espejo.
- **Ninguna columna ni comentario de PDF, QR, numeración ni Verifactu** (el `grep` de A.3).

### A.6 · Territorio

El contrato no declara `territorio:`. Hay que añadirlo al contrato antes de implementar; esta
adenda no lo toca. Propuesta:

```
territorio:
  - supabase/migrations/20261011120000_economico_esquema.sql
  - scripts/rls/00-ayudantes.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/11-cobertura.sql
  - scripts/rls/26-economico.sql
  - scripts/rls/README.md
  - scripts/lint-migraciones.ts
  - scripts/lint-migraciones.test.ts
  - lib/supabase/tipos-bd.ts
  - tickets/T-021/**
  - docs/bitacora/T-021*.md
  - docs/state.md
```

Respecto al diseño del 12-09 sale `lib/economico/**` (D12).

### A.7 · Delegable

Nada: todo es RLS, dinero o la cadena. La fila del `README.md` es una línea y no merece un encargo.

### A.8 · Preguntas al propietario

- **P1 · ¿El pendiente se calcula por paciente o por factura?**
  - Por factura no funciona: un cobro hecho antes de facturar no se puede enlazar después sin un
    `UPDATE`.
  - **Recomendación: por paciente** («la familia García debe 60 €»).
  - Lo ven el administrador, el profesional asignado y el técnico de su centro.
  - El profesional ve el total del paciente, no solo lo de sus borradores: los cobros no dicen de
    qué profesional son, así que «lo suyo» no se puede derivar.
- **P2 · ¿Cómo se sabe que un borrador está descartado o enviado?** Hoy no hay de dónde sacarlo.
  - **Recomendación para *descartado*:** guardar una versión nueva, sellada, con la marca
    `descartado`. El borrador no se borra (aclaración 11).
  - **Recomendación para *enviado*:** no se deriva en T-021. La vista dirá `sin_enviar` hasta que
    T-026 defina su evento en el outbox (`eventos_salientes` ya existe) y la redefina. Enviar
    está bloqueado igualmente por el ADR-053 k.
- **P3 · ¿Puede el sincronizador cambiar el estado de una factura ya copiada?** El contrato de
  T-026 dice que sí (`estado_proveedor`, `sincronizado_en`). El de T-021 hace el espejo inmutable,
  y la base lo impediría incluso a la función del sincronizador.
  - **Recomendación:** el espejo se queda inmutable, como pide el ADR-053 d: «un espejo que se
    puede tocar deja de ser un espejo».
  - Sus columnas de estado guardan el estado **del momento de la copia**.
  - T-026 añade una tabla hija de solo adición, `facturas_espejo_estados`, y se corrige su contrato.
  - No bloquea T-021.
- **P4 · ¿Con qué clave se cifra el NIF del destinatario?**
  - **Recomendación:** la misma de identificación (`identificacion_cifrado_v1`, versión 1). Es el
    mismo tipo de dato (ADR-029), no hace falta buscarlo (no lleva índice), y cada clave más es
    una rotación más.
  - Alternativa: una clave propia, `facturacion_cifrado_v1`.
  - El `check (clave_version = 1)` sirve para cualquiera de las dos; el `comment on column` dice cuál se usa.

### A.9 · Hallazgos para `docs/state.md` (los anota el orquestador)

- El contrato de T-026 (`:71-72`) actualiza el espejo, y eso choca con T-021 (P3).
- `scripts/lint-migraciones.ts:30` protege `facturas`, una tabla que según el ADR-053 no llegará
  a existir. Quitarla es una decisión de arquitectura.
- `docs/architecture.md:27` (§Dominios) sigue listando las tablas retiradas. Lo corrige el
  documentalista, como dice el contrato.
- `tipos_terapia.tarifa_base` es `numeric(10,2)` y las tarifas de T-021 son `numeric(12,2)`. No
  hace daño, pero queda anotado.
- La nota del contrato que manda los hallazgos a `kimi/hallazgos/` está obsoleta: Kimi dejó el
  proyecto el 30-09.

### Lo que no entra, y por qué

- **El constructor TypeScript del sobre** (D12): ningún criterio escribe desde la aplicación.
- **Pantallas, Server Actions, envío y sincronizador**: son de T-023 y T-026.
- **Límites del bono** (más sesiones consumidas que totales, caducidad): la base no los impone. La
  vista muestra las dos cifras, y qué hacer con ellas lo decide la pantalla.
- **Comprobar que el desglose de cada línea coincide con `lib/dinero`.** El disparador solo exige
  `base + cuota = total`, que la suma de las líneas dé el total, y cuota 0 si todo es exento.
  Repetir el redondeo en SQL sería tener dos sitios donde redondear.
- **Tocar `fn_proteger_cita_pasada()`, `fn_auditar()` o la cadena clínica.**
- **Sembrar datos económicos**: el seed es de T-008 y ningún criterio lo pide.

## Decisiones del propietario sobre la adenda (03-10-2026)

- **P1 · pendiente:** por paciente, según la recomendación.
- **P2 · borradores:** «descartado» es una versión nueva sellada con la marca `descartado`. «Enviado» no se
  deriva en T-021, según la recomendación.
- **P4 · clave del NIF:** `identificacion_cifrado_v1`, según la recomendación.
- **P3 · espejo y sincronizador: sin decidir.** El propietario dice: «La facturación será del programa de
  facturación, analiza exhaustivamente cómo podemos proceder». Va a un análisis aparte del arquitecto, que se
  añadirá a continuación.

## Análisis P3: la facturación es del programa externo (03-10-2026)

> Arquitecto, 03-10-2026, contra `main` en `b7f044a`. Responde a la frase del propietario: «La
> facturación será del programa de facturación, analiza exhaustivamente cómo podemos proceder».
> Esta sección **solo añade**. No cambia el diseño aprobado ni la adenda hasta que el propietario
> conteste §P3.7. Tampoco toca los contratos de T-021, T-023, T-026 ni T-027: §P3.5 dice qué habría
> que cambiar en cada uno.

### P3.0 · Hechos verificados, y lo que no se pudo verificar

**En el repositorio**

| Hecho | Dónde | Consecuencia |
|---|---|---|
| El ADR-053 c pone un **techo** a lo que se guarda: «identificador, número, importe, estado y un enlace». El 053 d dice qué vuelve del proveedor («número, fecha, total, estado, cobrado») y que la tabla «la aplicación **no puede editar**: entra por el sincronizador y por nadie más» | `docs/decisions/ADR-053.md:51-58` | El ADR no prohíbe que el sincronizador actualice: prohíbe que edite la aplicación. La inmutabilidad la ponen el contrato de T-021 y la regla 6. Guardar **menos** de lo que el ADR enumera no lo contradice |
| El 053 g deja dentro `cobros` y el pendiente. El 053 d trae además «cobrado» del proveedor | `ADR-053.md:68-71` frente a `:55` | El ADR admite **dos fuentes para el mismo hecho**. Hay que quedarse con una (P3.c) |
| El 053 h: los borradores se conservan encadenados y de solo adición | `ADR-053.md:73-79` | Ninguna opción lo cambia |
| T-026 actualiza `estado_proveedor` y `sincronizado_en` de un documento ya copiado. El contrato de T-021 hace el espejo inmutable, y `cobertura_solo_adicion()` exige que **nadie**, ni siquiera `postgres`, tenga UPDATE | `tickets/T-026-…:66-73`; `tickets/T-021-…:74-82` y `:107-111`; `20260829150000:470-478` | Es el choque P3. Una función definer cuyo dueño es `postgres` tampoco podría actualizar el espejo |
| T-026 dice que, sin proveedor configurado, «se registran cobros y pendiente (T-023)». Pero P1, ya decidido, calcula el pendiente como la suma de los totales del espejo menos los cobros | `T-026:57-58`; §Decisiones del propietario | Sin proveedor no hay espejo, así que el pendiente sería siempre 0 y todo cobro saldría como excedente. Los dos textos no casan (P3.4) |
| Según T-027, si un bono se factura, se factura en el proveedor y fuera de la app | `T-027:27-29`, `:92-93` | Esa factura no sale de un borrador. El sincronizador enlaza por el id que devolvió `crearBorrador` y no la ve. Con P1, el cobro del bono queda como excedente para siempre |
| T-023 calcula saldo y estado de cobro **por factura** (`parcial`, `cobrada`, `sobrecobrada`) | `T-023:59-62` | Contradice P1, que va por paciente. Va a hallazgos (§P3.8) |
| El outbox `eventos_salientes` es estado operativo y **mutable** (ADR-024: «no es de solo adición»), con `clave_idempotencia unique` | `20260910120000:48-66`; ADR-024 | El id del documento que devuelve el proveedor no puede guardarse solo ahí. Si no, el vínculo borrador→factura que pide la FAQ de prefacturación (tabla siguiente) viviría en una tabla que se actualiza |
| Una tabla de solo adición no puede ser destino de una clave ajena | `.claude/rules/supabase.md:16` | Toda tabla hija del espejo va **sin FK**, con un disparador que compruebe que el padre existe, como D6 |
| Cuatro textos de `docs/` son anteriores al ADR-053: §Dominios, fila Económico; el invariante 1 (`facturas` en la cadena por Verifactu); el invariante 2 («una factura no se edita: se anula y se reemite»), y la sección Facturación de `interfaz.md` (estado «En cola AEAT», «Nueva factura») | `docs/architecture.md:27`, `:51`, `:127-129`; `docs/interfaz.md:136-146` | Manda el ADR-053, que es posterior y es ley. Este análisis no usa ninguna de esas líneas como argumento. Las corrige el documentalista |

**Normativa**

| Texto | Fuente | Grado de verificación |
|---|---|---|
| **Art. 29.2.j LGT**: «la obligación, por parte de los productores, comercializadores y usuarios, de que los sistemas y programas informáticos o electrónicos que soporten los procesos contables, de facturación **o de gestión** de quienes desarrollen actividades económicas, garanticen la integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad de los registros, **sin interpolaciones, omisiones o alteraciones de las que no quede la debida anotación en los sistemas mismos**.» | Transcrito en fiscal-impuestos.com, en la nota sobre el aviso de la AEAT de entrada en vigor | Literal, pero de fuente secundaria. No pude leer entero el BOE consolidado: la página llega truncada |
| **Art. 201 bis.1 LGT**. Afecta a quien fabrique o comercialice sistemas «que soporten los procesos contables, de facturación o de gestión» que: a) «permitan llevar contabilidades distintas en los términos del artículo 200.1.d)»; b) «permitan no reflejar, total o parcialmente, la anotación de transacciones realizadas»; c) «permitan registrar transacciones distintas a las anotaciones realizadas»; d) «permitan alterar transacciones ya registradas incumpliendo la normativa aplicable»; e) incumplan las especificaciones de integridad e inalterabilidad; f) «no se certifiquen, estando obligado a ello por disposición reglamentaria». Sanción: 150.000 € por ejercicio con ventas y por tipo de sistema | Letras: misma fuente. Encabezado: la búsqueda encontró la frase exacta. Importe: ADR-053 | Literales por fuente secundaria las letras a-d y f; la e está parafraseada. No leí literalmente los apartados 2 y 3 |
| **Definición de SIF**: «un conjunto de hardware y software **utilizado para expedir facturas** mediante la realización de las siguientes acciones: 1. Admitir la entrada de información de facturación por cualquier método. 2. Conservar la información de facturación, dentro o fuera del SIF. 3. Procesar la información de facturación mediante cualquier procedimiento para producir otros resultados derivados» | FAQ de la Sede de la AEAT, «Cuestiones generales, conceptos y definiciones» | Literal y de fuente oficial, leída el 03-10-2026 |
| **FAQ de prefacturación**: «no sería legal y sería susceptible de sanción, el uso de sistemas que generen documentos preparatorios de facturas o de facturas simplificadas, sin que el sistema informático mismo disponga de elementos de control para la conservación de tales documentos preparatorios de forma **debidamente vinculada a las facturas o a los registros de facturación que finalmente se emitan**» | La misma FAQ | Fragmento literal, de fuente oficial |
| RD 1619/2012, art. 3.1.a: las operaciones exentas del art. 20.Uno.3.º LIVA se facturan «en todo caso» | Resumen de un buscador | **No verificado** contra el BOE. Solo afecta a P3.4 |
| **No encontrado**: ningún texto de la AEAT trata el caso de un sistema de gestión que guarda número, fecha e importe de facturas expedidas por **otro** SIF | — | Lo más cercano es la aclaración 10 que cita el ADR-053. Va a nuestro favor, pero es lectura y no texto |
| **No verificado, de Holded**: qué estados expone la API, si deja anular una factura aprobada, cómo enlaza una rectificativa con la original y si un pago registrado allí se ve por API | La referencia pública de la API redirige a una página comercial (03-10-2026) | Son preguntas de T-026 a Holded. Nada de lo que sigue depende de suponerlas |

### P3.1 · Qué significa «la facturación es del programa», pieza por pieza

**La regla que sale de la frase:**
- La app es fuente de verdad de lo que nace en la consulta: la tarifa, el borrador, el envío, el cobro y el bono.
- El programa es fuente de verdad de todo lo que nace al expedir: número, fecha de expedición, importes definitivos, rectificativas y anulaciones, los pagos que se registren allí, el PDF, el QR y el registro de facturación (RF).
- La app copia del programa solo **lo que no puede saber de otra forma**, y solo para lo que ella misma tiene que enseñar o derivar.

| Pieza | Fuente de verdad | Qué guarda la app | Para qué | Cómo cambia |
|---|---|---|---|---|
| Tarifa | App | `tarifas_paciente` | Proponer el precio del borrador | Se historifica: cerrar una tarifa y abrir otra |
| Borrador | La app, hasta que se envía. Desde entonces, el documento que está en el programa es del programa: si alguien lo cambia allí antes de aprobarlo, vale lo aprobado | Versiones encadenadas | Art. 29.2.j, aclaración 11 (ADR-053 h) y FAQ de prefacturación | Solo adición |
| **Envío**: qué versión salió, cuándo, a qué proveedor y con qué id | App | **Hoy nada**: solo el outbox, que es mutable. Es un hueco que no recoge ningún contrato | Atar el borrador a la factura (FAQ de prefacturación), saber que está «enviado» (P2) e idempotencia | Debería ser de solo adición, en T-026 |
| Factura expedida | Programa | Según la opción: nada en (b); número, fecha, importes y enlace en (a), (c) y (d) | Saber que se facturó y dónde está. Con P1, además, sumar lo facturado | Ver P3.2 |
| Estado de la factura en el programa: pagada, enviada al cliente, rectificada o anulada | Programa | Según la opción | Ver P3.2 | — |
| Cobro | App (ADR-053 g) | `cobros` | Lo que el paciente ha pagado, lo sepa o no el programa | Solo adición |
| Pagos registrados en el programa | Programa | **Nada** (recomendado, P3.c) | Copiarlos daría dos cifras de «cobrado» | — |
| Pendiente | Lo deriva la app | Una vista | «La familia García debe 60 €» | Solo depende del programa si cuenta lo facturado (P3.4) |
| Bono | App: es gestión interna (T-027) | `bonos` y `citas.bono_id` | El saldo de sesiones | Consumo derivado |
| Factura del bono, si la hay | Programa | Nada: no sale de un borrador | — | — |
| Sincronizador | — | Escribe solo lo que la opción elegida copia | — | Lee del programa. En el programa solo escribe `crearBorrador`, con `approveDoc: false` |

### P3.2 · Qué puede cambiar en el programa después de la copia, y qué necesita saberlo la app

1. **El borrador sigue sin aprobar, o se borra sin aprobar.** La app tiene que dejar de enseñar «enviado» para siempre. Es un hecho, no un estado que se sobrescribe.
2. **Se aprueba.** Nacen el número, la fecha y los importes, y nacen una sola vez. Es lo único que el espejo necesita copiar.
3. **Cambian el número o los importes de una factura ya aprobada.** No debería pasar: una factura expedida se rectifica, no se edita. No está verificado para Holded. Si pasa, es una alarma: T-026 ya lo llama hallazgo.
4. **Se registra un pago en el programa.** El programa la marca como «pagada» o «parcial». Eso **duplica** `cobros`. La app no lo necesita y le hace daño (P3.c).
5. **Se emite una rectificativa.** Es un documento nuevo en el programa que no sale de un borrador de la app. Solo importa si el pendiente cuenta lo facturado (P3.4).
6. **Se anula.** No sé si Holded lo permite (no verificado). Importa por el mismo motivo que la rectificativa.
7. **Se envía al cliente por correo desde el programa.** No le importa a la app.

**Conclusión**: después de la copia, la app solo necesita enterarse de 1, de 3 (como alarma) y, si el pendiente cuenta lo facturado, de 5 y 6. **Ninguno es un campo que se sobrescribe**: son hechos con fecha, y un hecho con fecha se añade. «Cambiar el estado del espejo» resulta ser una pregunta mal planteada. Lo que hay que decidir es qué hechos posteriores registra la app, si registra alguno.

### P3.3 · Las opciones

**(a) Espejo inmutable más `facturas_espejo_estados` de solo adición** (la recomendación de A.8)

Cómo funciona:
- El espejo es el de A.2, y `estado_proveedor` guarda el estado del momento de la copia.
- Cada cambio de estado que observa el sincronizador es una fila hija: `factura_espejo_id` sin FK, `estado text` y `observado_en`.
- El estado actual es la última fila, que se lee por una vista.

Consecuencias:
- **SIF**: no lo es (ver «¿Alguna convierte la app en SIF?», más abajo). Copia más información de facturación que (d): el estado bruto del programa, incluido su estado de pago.
- **Art. 29.2.j y 201 bis**: nada se altera y cada cambio queda anotado, así que cumple. Pero el estado de pago del programa entra en la app al lado de `cobros`: son **dos cifras de «cobrado»** que pueden no coincidir. Una app de gestión que enseña dos versiones del mismo hecho económico es lo más parecido que hay en este dominio a «contabilidades distintas» (201 bis.1.a). Esto es lectura, no texto. Y es exactamente la «segunda contabilidad» que el 053 d quiere evitar.
- **Regla 6 y ADR**: cumple las dos.
- **RLS**: la tabla hija hereda la del espejo. El técnico necesita otra vista definer, que es una puerta lateral más.
- **Coste**: medio. Una tabla, una función definer de alta que solo inserta si el estado difiere del último, una vista y el banco. Además depende de un vocabulario de estados que no conocemos: sería un `text` libre sobre el que la app no puede razonar.

**(b) Sin espejo: la app guarda la referencia y consulta el programa**

Cómo funciona: la app guarda solo el envío (borrador, versión e id del documento). El número, el total y el estado se piden al programa cada vez que se pinta.

Consecuencias:
- **SIF**: no lo es, y es la opción que menos información de facturación conserva.
- **Art. 29.2.j**: cumple sobre lo poco que guarda. Pero la FAQ de prefacturación pide los borradores «debidamente vinculad[os] a las facturas […] que finalmente se emitan», y con (b) ese vínculo, el número de la factura final, **solo vive en el programa**. Si el cliente cambia de programa o cierra la cuenta, la app se queda con borradores atados a un id que ya no resuelve. Es la opción más débil justo en la norma que sí nos alcanza (ADR-053 h).
- **Regla 6 y ADR**: cumple la regla 6, pero **contradice el ADR-053 d** («se guarda para que la ficha del paciente sepa lo que se debe»). Haría falta un ADR nuevo.
- **RLS**: lo que llega del programa no pasa por RLS. El servidor lo lee con la clave API del cliente, que ve todas las facturas, así que quién ve qué lo decidiría el código de la aplicación, filtrando por los envíos que la RLS deja ver. Funciona, pero sería el primer dato económico del proyecto acotado fuera de la base (invariante 3).
- **Coste**: bajo en base y alto en producto.
  - El ADR-043 prohíbe cachear datos de paciente, así que cada ficha y cada listado llaman al programa. El pendiente de un paciente cuesta N llamadas.
  - Con el programa caído, o sin plan de pago, no hay ni «facturado» ni pendiente.
  - El listado filtrable de T-023 no se puede hacer sin traerlo todo.
  - Los límites de peticiones de Holded están sin verificar.

**(c) Espejo como caché reemplazable, fuera del dominio de solo adición**

Cómo funciona:
- `facturas_espejo` sale del catálogo de solo adición.
- El sincronizador, una función definer que solo ejecuta `service_role`, hace `insert … on conflict do update`.
- `authenticated` solo lee, y cada cambio queda en `auditoria` por `fn_auditar`.

Consecuencias:
- **SIF**: no lo es, igual que (a).
- **Art. 29.2.j**: el texto admite alteraciones de las que quede «la debida anotación en los sistemas mismos», y con el disparador de auditoría esa anotación existe. Es la opción que la ley probablemente tolera, pero es lectura y nadie la ha confirmado.
- **Regla 6 y ADR**: **rompe la letra de la regla 6** («nada […] económico se modifica»). Necesita que el propietario la enmiende con una excepción explícita para la caché de un tercero, más un ADR. Y deja precedente: la próxima tabla que «solo es una caché» lo tendrá más fácil.
- **RLS**: como (a), sin tabla hija.
- **Coste**: el menor en código. Los costes ocultos:
  - Por diseño, ni `cobertura_solo_adicion()` ni el linter la vigilan, y nada impediría que mañana alguien concediera `update` a `authenticated`.
  - Un error del sincronizador sobrescribe lo bueno con lo malo, y solo se ve buscando en `auditoria`.

**(d) Espejo mínimo: solo los hechos de la expedición, inmutable y sin estado del programa**

Cómo funciona. Son tres piezas de solo adición; la forma exacta la fija T-026 cuando conteste Holded:
- **`borradores_factura_envios`**: `borrador_id`, `version_id`, `proveedor`, `proveedor_documento_id` y `enviado_en`. Es el vínculo que pide la FAQ, y de él sale «enviado» (P2).
- **`facturas_espejo`**: `proveedor`, `proveedor_documento_id`, `borrador_id`, `numero`, `fecha_expedicion`, `base`, `cuota_iva`, `total`, `url_proveedor` y `copiado_en`. **Sin `estado_proveedor`.** Entra una sola vez, cuando el sincronizador ve el documento aprobado.
- **`documentos_proveedor_observaciones`**: `proveedor_documento_id`, `tipo` con un enum cerrado (`eliminado_sin_aprobar`, `rectificado`, `anulado`, `datos_distintos`), `detalle` y `observado_en`. Recoge solo los hechos de P3.2 que cambian algo en la app.
- El **estado de pago del programa no se copia nunca**. El cobro es de la app; en el programa, el cliente hace lo que quiera.

Consecuencias:
- **SIF**: no lo es. Conserva lo mínimo que permite el 053 c, y nada que se parezca a un RF.
- **Art. 29.2.j**: cumple. Además cumple la FAQ de prefacturación **sin depender de que el programa responda**: el envío y el espejo atan el borrador a la factura final con su número, y los dos son inalterables.
- **Art. 201 bis**: no hay dos cifras de «cobrado», y la aplicación no puede escribir en el espejo.
- **Regla 6 y ADR**: cumple la regla 6. Es un **subconjunto** de lo que el 053 c y d permiten: deja de copiar «estado» y «cobrado». Para que conste, conviene un ADR nuevo que lo diga, sin editar el 053 (P3.e).
- **RLS**: el espejo, como en A.2. Los envíos y las observaciones, con la RLS del borrador: el profesional ve los suyos y el técnico nada, o solo la cabecera a través de la vista.
- **Coste**: medio, parecido al de (a). Pero el vocabulario es **cerrado**, así que la app puede razonar con él (por ejemplo, «anulado» saca la factura del pendiente) sin conocer los estados de Holded.

**(e) Traer el cobro del programa. Descartada**

- Contradice el 053 g y P1.
- Cobrar antes de facturar es el caso normal según T-021 y T-023, y ese cobro no tiene en el programa ningún documento del que colgar. No he verificado si Holded admite cobros sueltos.
- El técnico, que de Facturación solo ve cobros, pasaría a depender del programa.

**Resumen**

| | (a) | (b) | (c) | **(d)** |
|---|---|---|---|---|
| ¿Convierte la app en SIF? | No | No | No | No |
| Art. 29.2.j y FAQ de prefacturación | Cumple | Vínculo frágil: depende del programa | Cumple, por lectura | Cumple |
| Dos cifras de «cobrado» | **Sí** | No (se lee del programa) | Sí, si copia el estado | No |
| Regla 6 | Cumple | Cumple | **La rompe** | Cumple |
| ADR | Dentro del 053 | **Contradice el 053 d** | Enmienda la regla 6 y pide ADR | Dentro del 053; un ADR que lo estrecha |
| RLS | En la base | **Fuera de la base** | En la base | En la base |
| Sin proveedor o con el programa caído | Muestra lo copiado | No muestra nada | Muestra lo copiado | Muestra lo copiado |
| Coste | Medio | Base baja, producto alto | Bajo, con deuda | Medio |

**¿Alguna convierte la app en SIF?**

No, en lo que se puede verificar:
- La FAQ define el SIF como el sistema «utilizado para expedir facturas».
- Ninguna opción expide, aprueba, numera, genera RF o QR, remite a la AEAT ni conserva la factura (053 a-c).
- La frontera sigue donde la puso el ADR-053: `approveDoc: false` y la duda k.1.

Lo que no está verificado:
- No hay texto de la AEAT sobre un sistema de gestión que guarda el número y el importe de facturas de otro SIF y los procesa (les resta cobros).
- Si alguien lee la definición quitándole el «para expedir», sus tres acciones (admitir, conservar y procesar información de facturación) describen (a), (c) y (d); a (b) bastante menos.
- Por eso, **la consulta al asesor de k.1 debe llevar la lista exacta de columnas que se copian** (P3.f). Nada de esto se implementa antes: T-026 está bloqueado por esa misma respuesta.

### P3.4 · Una consecuencia de la misma frase, aunque no sea P3: qué cuenta el pendiente

Con P1, el pendiente es lo facturado en el espejo menos lo cobrado. Si la facturación es del programa, ese «facturado» solo ve las facturas que salieron de un borrador de la app. No ve:
- la factura de un bono (T-027);
- las rectificativas;
- las facturas hechas directamente en el programa;
- nada en modo degradado (T-026:57-58).

Además, como se cobra antes de facturar, todo cobro sale como excedente hasta que el programa aprueba la factura.

**Alternativa: devengado menos cobrado.** Lo devengado son las citas realizadas sin bono, por la tarifa vigente ese día, más el importe de los bonos dados de alta.
- **A favor**: no depende del programa, funciona sin proveedor y es lo que dice literalmente el ejemplo de P1.
- **En contra**: cada cita tiene que poder resolver su tarifa (`tarifas_paciente` y, si no hay, `tipos_terapia.tarifa_base`), y hay que decidir si una `no_asistida` se cobra.

**No corre prisa.** Es una vista, y una vista se redefine sin migrar datos. Con la recomendación de §P3.6, T-021 no crea `pendiente_paciente`. Se decide al diseñar T-023 (P3.d).

### P3.5 · Qué cambia en T-021 según la opción

Hay dos ejes: **qué opción** se elige y **dónde nace el espejo**.

**M1 · El espejo nace en T-021, como en A.2**
- (a): no cambia nada. El `comment on column` de `estado_proveedor` dice «estado al copiar». La tabla hija la crea T-026.
- (c): el espejo sale de `tablas_solo_adicion`, de `TABLAS_SOLO_ADICION` (D10) y de `01-fijacion` (D11). Además, cambia el criterio «update/delete/truncate fallan» del contrato.
- (d): sale `estado_proveedor` del espejo y de `facturas_espejo_cabecera`, y `sincronizado_en` pasa a ser `copiado_en`. Envíos y observaciones, en T-026.
- (b): no es compatible con M1.

**M2 · El espejo nace en T-026 (recomendado, con (d))**

Pasa de T-021 a T-026:
- el enum `proveedor_facturacion`;
- `facturas_espejo`, con sus tres capas, su fila del catálogo, su entrada en el linter y su fila de fijación;
- `registrar_factura_espejo()`;
- `fn_espejo_del_paciente()` (D6) y las columnas `cobros.factura_espejo_id` y `bonos.factura_espejo_id`. T-026 las añade con `alter table … add column … uuid`, nulas. Añadir una columna nula sin default no es un `UPDATE` y no dispara los disparadores de fila;
- la vista `facturas_espejo_cabecera`, y también `pendiente_paciente` si P3.d se queda en P1; si no, esta la crea T-023;
- `borradores_factura_estado`, que se queda en T-021 con `sin_enviar` y `descartado`, y que T-026 redefine con `enviado` y `facturado`. Es lo mismo que P2 ya decidió para «enviado».

Se queda en T-021:
- tarifas;
- borradores, versiones, cadena y verificador;
- `cobros` y `bonos`, sin `factura_espejo_id`;
- `citas.bono_id` y `bonos_consumo`;
- auditoría y RLS.

Criterios del contrato de T-021 que habría que reescribir:
- «`update`/`delete`/`truncate` fallan […] Lo mismo sobre `facturas_espejo` y `cobros`» pasa a ser solo sobre `cobros`.
- «`insert into facturas_espejo` como `authenticated` falla; por la función […] entra» sale del contrato. T-026 ya lo tiene en `:90-91`.
- «La consulta a las líneas del borrador no devuelve `cita_id`» se cierra con lo que A.3 ya prueba: el técnico ve 0 filas en `borradores_factura_versiones`, y la gemela del administrador ve 1.
- Las tareas «`facturas_espejo`» y «`factura_espejo_id` nulo» de `cobros` y `bonos` pasan a «las crea T-026».

En la adenda:
- Salen D6 y D9.
- A.2: salen los puntos 3 (`proveedor_facturacion`) y 5 (el espejo); el 7 pierde `registrar_factura_espejo` y `fn_espejo_del_paciente`; el 8 pierde dos vistas; el 10 queda en dos tablas, y el 12 pierde dos filas.
- D10 y D11 quedan en dos tablas.
- A.3 pierde la fila del espejo.
- A.4: el riesgo 2 se queda con una sola vista definer de las tres.
- A.5 pierde las líneas del espejo.
- A.6 no cambia.

**Qué gana T-021**: pierde una de las tres tablas inmutables, dos vistas definer (el riesgo 2 de A.4), una función definer y un disparador. Y deja de fijar la forma de una tabla contra una API que nadie ha verificado (constitución, regla 1). **Qué pierde**: nada funcional, porque antes de T-026 nadie escribe en el espejo.

**Otros tickets**:
- La parte de T-023 que lista facturas, y su pendiente si se queda P1, pasa a depender de T-026. La de cobros no.
- T-027 no cambia, porque no usa `factura_espejo_id`.
- T-025 cita las columnas del espejo de T-026, no las de T-021.

**Con (b)** el reparto es como en M2, pero T-026 no crea espejo: crea solo los envíos.

### P3.6 · Recomendación: (d), con el espejo naciendo en T-026 (M2)

Leída al pie de la letra, «la facturación es del programa» significa que la app copia lo mínimo para saber **que** un borrador se convirtió en factura y **en cuál**. Y que nunca guarda una segunda versión de lo que el programa decide después, como el estado o lo cobrado.

(d) es la única opción que cumple a la vez cinco cosas:
- mantiene la regla 6 sin excepciones;
- cumple la FAQ de prefacturación sin depender de que el programa responda;
- no mete una segunda cifra de «cobrado»;
- deja la RLS en la base;
- no necesita un ADR que contradiga el 053, solo uno que lo estreche.

Hacer nacer el espejo en T-026 permite fijar su forma cuando Holded conteste, no antes. Y le quita a T-021, el ticket más caro de equivocar de la fase 2, una parte delicada que ninguno de sus criterios necesita para funcionar.

### P3.7 · Preguntas al propietario (de opción cerrada)

- **P3.a · ¿Qué hace la app con el estado de una factura que ya está en el programa?**
  - (a) La copia, y cada cambio es una fila nueva.
  - (b) No guarda copia y lo consulta siempre al programa.
  - (c) Guarda una copia que el sincronizador sobrescribe, con rastro en auditoría.
  - **(d) Solo copia número, fecha, importes y enlace, una vez. Del estado, solo anota borrado, rectificación o anulación. (Recomendada.)**
- **P3.b · ¿Dónde nace el espejo?**
  - En T-021, como está.
  - **En T-026, con el sincronizador. (Recomendada.)**
  - Si se elige (b) en P3.a, no nace.
- **P3.c · El estado de pago que lleve el programa (pagada o parcial):**
  - **No se copia; el cobro es solo el de la app. (Recomendada.)**
  - Se copia como dato informativo junto al pendiente, sin sumarlo.
- **P3.d · ¿Qué cuenta el pendiente?**
  - (i) Lo facturado menos lo cobrado (P1 tal cual, con los huecos de §P3.4).
  - (ii) Lo devengado menos lo cobrado.
  - **(iii) Se decide al diseñar T-023. (Recomendada: con M2 no bloquea T-021.)**
- **P3.e · ¿Se escribe un ADR nuevo que deje dicho «el espejo guarda solo los hechos de la expedición; el estado y los cobros del programa no se copian»?** Estrecha el 053 c y d, no los edita.
  - **Sí. (Recomendada.)**
  - No, basta con los contratos.
- **P3.f · ¿La consulta al asesor (ADR-053 k.1) incluye la lista exacta de lo que la app copia del programa?**
  - **Sí. (Recomendada.)**
  - No.

Si se aprueba, los cambios de contrato de T-021, T-023 y T-026 los hacen el propietario o el arquitecto, porque en `tickets/**` no escribe nadie automático. La adenda de T-021 se ajusta con una sección nueva, sin editar las anteriores.

### P3.8 · Hallazgos para `docs/state.md` (los anota el orquestador)

- Las pruebas de T-023 calculan saldo y estado de cobro por factura (`:59-62`), y P1 los calcula por paciente.
- T-026 promete pendiente en modo degradado (`:57-58`), y con P1 no lo hay.
- La factura de un bono (T-027) no sale de un borrador y no llega nunca al espejo.
- El ADR-053 trae «cobrado» del proveedor (d) y deja `cobros` dentro (g). Lo resuelve el ADR de P3.e.
- Ningún contrato guarda de forma inalterable el vínculo borrador → documento del proveedor: hoy solo existiría en el outbox, que es mutable.
- `docs/interfaz.md:136-146` (estado «En cola AEAT», «Nueva factura») es anterior al ADR-053.
- `tickets/T-026-…:113` manda los hallazgos a `kimi/hallazgos/`, que está obsoleto.
- RD 1619/2012, art. 3.1.a (facturar siempre la terapia exenta): sin verificar contra el BOE.

### Lo que este análisis no decide, y por qué

- **La forma exacta de los envíos y las observaciones**: es de T-026 y depende de lo que conteste Holded (constitución, regla 1).
- **Si una rectificativa hecha en el programa se puede atribuir a un paciente**: depende de si Holded la enlaza con la original. Sin verificar.
- **P1, P2 y P4**: no se reabren. §P3.4 solo señala que la vista del pendiente se puede redefinir sin migrar datos.

## Decisiones del propietario sobre el análisis P3 (03-10-2026)

- **P3.a:** (d). La app guarda una copia mínima: número, fecha, importes y enlace, una sola vez. De lo que
  pase después en el programa solo anota, como hecho fechado y de solo adición, el borrado, la rectificación
  o la anulación.
- **P3.b:** el espejo nace en **T-026** (M2) y sale de T-021.
- **P3.c:** el estado de pago del programa no se copia. Lo cobrado es solo lo que registra la app.
- **P3.d:** qué cuenta el pendiente se decide al diseñar T-023.
- **P3.e:** sí, con un ADR nuevo que estreche el ADR-053 c y d sin editarlo.
- **P3.f:** sí. La consulta al asesor (ADR-053 k.1) lleva la lista exacta de lo que la app copia del programa.

## Adenda P3 aplicada (03-10-2026)

> Arquitecto, 03-10-2026, contra `main` en `36663f9`. Aplica las decisiones del propietario sobre P3
> (sección anterior) y el **ADR-077**. Solo añade: lo de arriba no se edita. **Si chocan, manda esta
> sección**, después la adenda del 03-10 y después el diseño del 12-09. Con ella, T-021 queda
> implementable sin el espejo. El contrato `tickets/T-021-economico-esquema.md` ya está ajustado a lo
> que dice aquí.

### PA.0 · Hechos verificados contra main

| Hecho | Dónde | Consecuencia |
|---|---|---|
| El último ADR era el 076. El 077 es nuevo y estrecha el 053 c y d: copia mínima, una vez, sin estado ni cobros del programa | `docs/decisions/ADR-077.md` | Es ley para T-021, T-023 y T-026 |
| La última migración es `20261006120000_avisos_y_escalado.sql` (T-015, integrado). Siguen reservados T-039 `20261007120000`, T-038 `20261008…`, T-040 B `20261009120000` y T-041 `20261010120000` | `ls supabase/migrations` | El sello provisional `20261011120000` de A.2 sigue libre. El implementador lo comprueba igual antes de escribir |
| Existe `22-avisos.sql`. Siguen reservados `23` (T-039), `24` (T-040 B) y `25` (T-041) | `ls scripts/rls` | El banco sigue siendo `26-economico.sql` |
| El banco va en una sola conexión y un solo `pg_temp`: `00` se carga antes que `01` | `scripts/rls/README.md` («Cómo funciona») | La fila de fijación de las versiones puede construir su sobre con `pg_temp.sobre_borrador()` de `00`, como `01` ya hace con `sobre_prueba()` (`01-fijacion.sql:111-140`) |
| La regla 1 del linter solo mira `update`, `delete from` y `truncate` sobre las tablas de su lista. `alter table … add column` no la dispara | `scripts/lint-migraciones.ts:190-214` | T-026 podrá añadir `cobros.factura_espejo_id` sin que el linter lo señale |
| `lib/dinero/reparto.ts` tiene `EstadoCobro = 'pendiente' \| 'cobrado' \| 'cobrado_de_mas'` | `lib/dinero/reparto.ts:31` | No afecta a T-021, porque la vista del pendiente sale de aquí (PA.1). Se cita en el contrato de T-023 |

### PA.1 · Qué sale de T-021

Pasan a **T-026** (ADR-077, punto 5):

| Pieza | Dónde estaba | Nota |
|---|---|---|
| Enum `proveedor_facturacion` | A.2 punto 3 | Solo lo usa el espejo |
| Tabla `facturas_espejo` | A.2 punto 5, D9 | Con sus tres capas, su fila de `tablas_solo_adicion`, su entrada en `TABLAS_SOLO_ADICION`, su fila de `01-fijacion`, su auditoría, su política `facturas_espejo_lectura` y su `grant select`. Cambia de forma: sin `estado_proveedor`, y `sincronizado_en` pasa a ser `copiado_en` (ADR-077, punto 1) |
| `registrar_factura_espejo(...)` | A.2 punto 7 | — |
| `fn_espejo_del_paciente()` y sus dos disparadores | A.2 punto 7, D6 | D6 sale entero |
| Columnas `cobros.factura_espejo_id` y `bonos.factura_espejo_id` | A.2 punto 5 | T-026 las añade nulas, sin FK y sin default. Si mantiene la de `bonos` lo decide su diseño: la factura de un bono no sale de un borrador (P3.4) |
| Vista `facturas_espejo_cabecera` | A.2 punto 8 | — |
| Los valores `enviado` y `facturado` de `borradores_factura_estado` | A.2 punto 8 | T-026 redefine la vista con `create or replace view` (P2) |

Pasa a **T-023**:

| Pieza | Dónde estaba | Nota |
|---|---|---|
| Vista `pendiente_paciente` | A.2 punto 8, D7 | Qué cuenta (lo facturado o lo devengado) se decide al diseñar T-023 (P3.d). P1 sigue en pie: por paciente. Si cuenta lo facturado, T-023 depende también de T-026 |

**D6, D7 y D9 dejan de aplicarse en T-021.** D7 se conserva como decisión (P1) para T-023.

Se queda en T-021 todo lo demás:
- cinco tablas: `tarifas_paciente`, `borradores_factura`, `borradores_factura_versiones`, `cobros` y `bonos`;
- dos de ellas de solo adición: `borradores_factura_versiones` y `cobros`;
- la cadena hermana, su verificador y `fn_cerrar_tarifa()`;
- `citas.bono_id` y `fn_bono_de_la_cita()` (D8);
- dos vistas: `borradores_factura_estado`, con dos valores, y `bonos_consumo`;
- la auditoría (D2) y la RLS.

### PA.2 · La migración: qué cambia en A.2

Mismo fichero, mismo orden. Cambia esto:

| Punto de A.2 | Queda así |
|---|---|
| 1 · Comentario `--` | El del ADR-053, y una línea más: «`facturas_espejo`, el registro de envíos y las anotaciones del programa los crea T-026 (ADR-077)». Va con `--`, nunca con `comment on` (D13) |
| 3 · Enums | Solo `forma_pago`. **No** se crea `proveedor_facturacion` |
| 5 · Tablas | `facturas_espejo` no se crea. `cobros` y `bonos`, **sin** `factura_espejo_id`. Las demás columnas de A.2, sin cambios |
| 7 · Funciones | `fn_sellar_version_borrador()`, `verificar_cadena_borrador()` y `fn_cerrar_tarifa()`. **No** se crean `registrar_factura_espejo()` ni `fn_espejo_del_paciente()` |
| 8 · Vistas | Solo dos, detalladas debajo de esta tabla |
| 9 · Disparadores | Tres capas en **dos** tablas: las versiones y `cobros`. El sellado. Auditoría en **cinco** tablas: `fn_auditar('id', …)` con el recorte de D2 en las versiones, y `fn_auditar('id')` en las otras cuatro |
| 10 · Catálogo | **Dos** filas en `tablas_solo_adicion`: `borradores_factura_versiones` (art. 29.2.j LGT, ADR-053 h) y `cobros` (ADR-053 g) |
| 11 · Políticas | Sale `facturas_espejo_lectura`. Las demás, sin cambios. Las de `cobros` y `bonos` no nombran el espejo en ningún sitio |
| 12 · Grants | Sale la fila de `facturas_espejo`. `bonos`: `select, insert` y `update (caducidad)`, sin `factura_espejo_id`. «Las cuatro vistas» pasan a ser **las dos vistas**. Capa 1 sobre **dos** tablas |
| 13 · Comentarios | Sin cambios, salvo el de `cobros`: «el enlace a la factura lo añade T-026 (ADR-077)» |

Las dos vistas del punto 8:

- **`borradores_factura_estado`** (`security_invoker = true`): `borrador_id`, `ultima_version` y `estado`.
  - `estado` es `text`, no un enum, para que T-026 añada valores redefiniendo la vista sin migrar un tipo.
  - `estado = 'descartado'` si la última versión tiene `descartado`; si no, `'sin_enviar'`.
  - El `comment on view` dice: «`enviado` y `facturado` los añade T-026 (ADR-077)».
  - T-026 tendrá que conservar los nombres y el orden de las columnas para poder usar `create or replace view`.
- **`bonos_consumo`**: igual que en A.2. Es la **única** vista definer del ticket.

Después de `db reset`, `npm run tipos`, como en A.2.

### PA.3 · El banco: qué cambia

**`scripts/rls/01-fijacion.sql`** (D11)
- **Dos** filas de fijación, no tres: una versión de borrador, con su cabecera, y un cobro. No hay
  fila del espejo.
- La versión se inserta como `postgres`, con el sobre de `pg_temp.sobre_borrador()`. Así el disparador
  de sellado la acepta y `10-solo-adicion` tiene sobre qué lanzar el `update`.
- Se usan los pacientes, profesionales y centros que `01` ya tiene, para que la versión sea del
  profesional asignado.

**`scripts/rls/00-ayudantes.sql`**: `pg_temp.sobre_borrador(...)`, sin cambios respecto a D11.

**`scripts/rls/11-cobertura.sql`**: los nombres de las políticas nuevas, sin `facturas_espejo_lectura`.

**`scripts/rls/26-economico.sql`**
- Sale todo lo del espejo:
  - el `insert into facturas_espejo` por rol;
  - `registrar_factura_espejo()`: la llamada, su `execute` denegado y su idempotencia;
  - el cobro enlazado a un espejo de otro paciente (23514);
  - las columnas y las filas de `facturas_espejo_cabecera`.
- El criterio del técnico (las líneas del borrador, sin `cita_id`) se cierra así:
  - TEC1 cuenta 0 en `borradores_factura_versiones`, con su gemela: ADM cuenta 1 sobre la misma fila;
  - TEC1 cuenta 0 en `borradores_factura_estado`, con la misma gemela;
  - las columnas de `bonos_consumo` en `information_schema.columns` no incluyen `cita_id` ni `lineas`.
- Ninguna aserción comprueba que el espejo **no** existe. Fallaría al integrarse T-026, porque el banco
  corre entero contra todas las migraciones. Eso lo vigila el `grep` de PA.4.

**`scripts/lint-migraciones.ts`**: `TABLAS_SOLO_ADICION` gana **dos** entradas, `borradores_factura_versiones`
y `cobros`. La prueba de `scripts/lint-migraciones.test.ts:204-209` fija la lista con esas dos.
`facturas_espejo` la añade T-026.

### PA.4 · Criterios del contrato que cambian, y cómo se cierran (sustituye a A.3 donde choca)

| Criterio del contrato (ya ajustado) | Comprobación |
|---|---|
| `update`, `delete` y `truncate` fallan sobre `borradores_factura_versiones` y `cobros` | `10-solo-adicion` las recorre por catálogo, con las dos filas de `01`. `cobertura_solo_adicion()` = 0. En `26`, como `authenticated`, `assert_lanza_codigo` con 42501 |
| **Sale**: «`insert into facturas_espejo` como `authenticated` falla; por la función entra» | Lo tiene T-026 |
| Un cobro sin factura entra | Como TEC1 (en su centro) y como ADM, `insert into cobros` entra. `cobros` no tiene columna de factura en T-021 |
| Técnico: cobros sí, tarifas no, y no ve las líneas del borrador | TEC1: `cobros` > 0; `tarifas_paciente` = 0, con la gemela de ADM; versiones y `borradores_factura_estado` = 0, con la gemela de ADM (PA.3) |
| Cada tabla nueva escribe en `auditoria` al insertar | Las **cinco** tablas, con el recorte de D2 en las versiones |
| Manual: nada del espejo en la migración | `grep -vE '^\s*--' supabase/migrations/20261011120000_economico_esquema.sql \| grep -ciE "espejo\|proveedor"` → `0` |

Los demás criterios se cierran como en A.3, sin cambios: `db reset`, la cadena de tres versiones,
`sesiones_consumidas`, los bonos por rol, los borradores del profesional, `test:rls`, lint, build,
el linter y el `grep` de D13.

### PA.5 · Riesgos y qué revisar (se añaden a A.4 y A.5, o los sustituyen donde choquen)

**Riesgos, por probabilidad**
1. **Que queden restos del espejo en la migración.** Por ejemplo, copiar de A.2 el
   `grant update (caducidad, factura_espejo_id)`, que rompe `db reset`, o una política de `cobros` con
   un `exists` sobre `facturas_espejo`, que tampoco compila. Más sutil: un `comment on` que prometa
   columnas que no existen. Lo cubre el `grep` de PA.4.
2. **Que `10-solo-adicion` falle por tabla vacía**, ahora en dos tablas en lugar de tres (A.4.1). La
   fila difícil es la de la versión, porque necesita un sobre válido.
3. **La vista definer `bonos_consumo`** es la única puerta lateral que queda (A.4.2, ahora con una sola
   vista).
4. **Que `borradores_factura_estado` nazca con una forma que T-026 no pueda ampliar con
   `create or replace view`**: `estado` como enum, o columnas en otro orden.

**Qué revisar.** Lo de A.5, quitando las líneas del espejo, de `registrar_factura_espejo` y de las
vistas `facturas_espejo_cabecera` y `pendiente_paciente`. Y además:
- En la migración no aparece, fuera de comentarios, nada del espejo ni del proveedor (`grep` de PA.4).
- `\dp` sobre las **cinco** tablas: ni `TRUNCATE`, ni `TRIGGER`, ni `REFERENCES` para `authenticated`.
- `has_column_privilege('authenticated','public.bonos','caducidad','UPDATE')` es verdadero, y ninguna
  otra columna de `bonos` tiene `UPDATE`.
- Las puertas laterales del técnico son dos vistas, no cuatro. El único `execute` que se le deniega es
  el de `verificar_cadena_borrador`.
- `tablas_solo_adicion` tiene exactamente dos filas nuevas, y `TABLAS_SOLO_ADICION` dos entradas nuevas.
- `26-economico.sql` no tiene ninguna aserción que dependa de que el espejo **no** exista (PA.3).

### PA.6 · Territorio

No cambia. Es el de A.6, que ya está en el frontmatter del contrato. Ningún fichero entra ni sale: quitar
el espejo solo quita contenido de los mismos ficheros.

### PA.7 · Delegable

Nada, como en A.7.

### PA.8 · Hallazgos para `docs/state.md` (los anota el orquestador)

- `tickets/T-025-expediente-no-sif.md:58` («`facturas_espejo` no tiene columna de PDF, de QR…») sigue
  valiendo, pero el espejo ahora nace en T-026. Además, la consulta al asesor, que es la pieza central
  de T-025, tiene que llevar la lista del ADR-077, punto 7. El contrato de T-025 no se ha tocado.
- `docs/architecture.md` §Dominios, fila Económico: además de las tablas retiradas por el ADR-053,
  `facturas_espejo` es ahora de T-026 y no guarda estado. Lo corrige el documentalista.
- T-027 no usa `factura_espejo_id`. Su nota dice que la vista de saldo es «la que T-021 deje escrita»:
  es `bonos_consumo`, y no cambia.
- Quedan resueltos por los contratos de esta fecha:
  - el choque de T-026 con el espejo inmutable;
  - las dos fuentes de «cobrado» del ADR-053;
  - el vínculo borrador → documento, que solo vivía en el outbox;
  - el saldo por factura de T-023;
  - la nota `kimi/hallazgos/` de T-021 y T-026.

### Lo que no entra, y por qué

- **El espejo, los envíos y las anotaciones**: nacen en T-026 (ADR-077, punto 5).
- **`pendiente_paciente`**: qué cuenta se decide en T-023 (P3.d).
- **Comprobar dentro del banco que el espejo no existe**: rompería al integrarse T-026.

---

## Ronda 2 (05-10-2026)

La ronda 1 dio ALTA en los dos revisores (A-H1 y B-H1: la caducidad y la vigencia se
reescribían con UPDATE). El propietario cerró la cuestión el 05-10-2026: **solo añadir**.

Esta sección **manda sobre todo lo anterior** donde choque. La migración
`20261011120000_economico_esquema.sql` no está fusionada (rama
`worktree-agent-a19ecdb63f2c1e386`), así que se edita **en sitio**: ni migraciones nuevas ni
`drop column`. Se reescribe la definición, porque ninguna base la ha aplicado fuera de la rama.

Las referencias `mig:N` y `26:N` son números de línea en la rama a HEAD `d20e33d`.

### R2.0 · Hechos verificados contra el código

**`bonos` y la clave ajena**
- `citas.bono_id` es una clave ajena por contrato. Lo dice el contrato T-021 en Tareas, apartado
  `bonos`: «`citas.bono_id` … nula, `references bonos(id)`».
- Por eso **`bonos` no puede llevar capa 1**, y `postgres` conserva su privilegio de dueño. La
  regla de `.claude/rules/supabase.md` lo explica: «una tabla de solo adición no puede ser destino
  de una clave ajena: FOR KEY SHARE exige UPDATE/DELETE sobre el padre».
- Las capas 2 (disparador de fila) y 3 (TRUNCATE) sí son compatibles con la clave ajena.
- Sin `CASCADE`, `TRUNCATE` sobre una tabla referenciada comprueba las claves ajenas
  (`heap_truncate_check_FKs`) antes de disparar `BEFORE TRUNCATE`. Por eso
  `truncate public.bonos` da `0A000` («cannot truncate a table referenced in a foreign key
  constraint») y no llega a la capa 3. La capa 3 de `bonos` se prueba por catálogo (R2.1.5, L8b).

**El catálogo `tablas_solo_adicion`**
- `cobertura_solo_adicion()` y `10-solo-adicion.sql` recorren el catálogo.
- La capa 1 se comprueba en `information_schema.table_privileges`: nadie, ni siquiera
  `postgres`, puede tener UPDATE ni DELETE sobre la tabla entera.
- `10-solo-adicion.sql:13-55` concede update y delete a `postgres`, exige que el disparador
  bloquee y vuelve a retirarlos. Necesita **una fila** por tabla del catálogo, que pone
  `01-fijacion.sql`.
- Consecuencia:
  - `bonos` **no entra** en el catálogo: su capa 1 aparecería rota.
  - `tarifas_paciente` y `bonos_caducidades` **sí entran**: nadie las referencia.
- `fn_impedir_modificacion()` lanza `42501` con el texto `La tabla % es de solo adición`
  (`20260815192424:141`).

**Orden de comprobaciones en un INSERT**
- Primero los disparadores `BEFORE`, por orden alfabético; luego `WITH CHECK` de la RLS; luego
  `CHECK` y `NOT NULL`; por último los índices únicos.
- Ejemplo: un llamante que no puede leer, cuyo disparador *invoker* calcula «primera fila», muere
  en la RLS (`42501`) antes de llegar al único (`23505`).

**Disparadores `BEFORE UPDATE` sobre `citas`**
- Su orden alfabético es: `bono_de_la_cita` (mig:250), `calcular_rango_bloqueante`,
  `marcar_cita_desviada` y `proteger_cita_pasada` (`20260910120000:387`).
- La congelación va dentro de `fn_bono_de_la_cita()`, así que salta antes que cualquier otra
  guarda de la cita.
- `fn_proteger_cita_pasada()` (`20261007120000:540-592`) **no** incluye `bono_id` en su lista.
  Hoy el `bono_id` de una cita pasada se cambia sin límite: es A-H6.

**Asignación, centros y zona horaria**
- `es_profesional_asignado()` (`20260822160000:85-115`) no mira el rol, a propósito: resuelve
  la fusión en un salto y exige que el lector esté activo.
- `pacientes.profesional_id` admite un técnico (A-H4, medido por el revisor A).
- `fn_rellenar_centro_paciente()` (`20260822160000:595-623`) solo rellena `centro_id` si llega
  nulo.
- `centros_actuales()` (`20260829120000:208-221`) filtra `hasta is null`.
- Pertenencias que dejan otros módulos del banco:
  - `06-centro.sql:15,23` da a TEC1 una pertenencia en CB y la cierra con
    `hasta = current_date`. A partir de 06, TEC1 **no** tiene CB vigente.
  - `06-centro.sql:37` da a PRO1 una pertenencia en CB **sin cerrar**.
  - `19-nota-en-episodio.sql:57,570` añade a PRO1 más centros.
  - Por eso la prueba del `centro_id` de la versión **no** puede usar CB: usa un centro propio
    de 26, CE26.
- `zona_horaria_centro(uuid)` (`20260822094547:1009-1025`):
  - es `security definer`;
  - nunca devuelve nulo (busca centro, luego organización, luego `Europe/Madrid`);
  - tiene `grant execute` a `authenticated` (`:1344`).

**Banco**
- Corre en **una** transacción (`scripts/rls/README.md:83`), así que `now()` es fijo durante
  todo el banco y «hoy en el centro» no cambia entre pruebas.
- `pg_temp.sobre_borrador()` (`00-ayudantes.sql:274-317`) escribe el sobre sin espacios
  (`"total_centimos":7000`). Calcula `numero_version` como máximo + 1 en el momento de la
  llamada, y lee la cabecera: se llama como `postgres` y con `\gset` justo antes del insert.
- `assert_lanza_codigo_msg` (`00-ayudantes.sql:137-160`) busca el fragmento con
  `position(fragmento in sqlerrm)`. El banco ya usa estos mensajes del motor:
  - `permission denied for table X` (`16-series.sql:1693`);
  - `row-level security` (`19-nota-en-episodio.sql:610`).
- Columnas que usan las fijaciones, verificadas:
  - `pacientes (id, nombre, apellidos, profesional_id, centro_id)` (`01-fijacion.sql:102`);
  - `centros (id, nombre)` (`01-fijacion.sql:46`);
  - `tipos_terapia (id, nombre)` (26:107);
  - `cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por)` (`01-fijacion.sql:235`);
  - `bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por)` (26:127).

**Criterio 12**
- Sobre la migración de la rama, `grep -niE "serie|numeracion|qr|verifactu|registro_facturacion"`
  devuelve **solo la línea 5**. Es el comentario obligatorio «no se crean…
  `series_facturacion`…».
- Quitando los comentarios `--` (`sed -E 's/--.*$//'`) da `0`, y `grep -c '/\*'` da `0`.

**Linter y otros módulos**
- La lista del linter está en `scripts/lint-migraciones.ts:26-36` (`TABLAS_SOLO_ADICION`), con
  su prueba exacta en `scripts/lint-migraciones.test.ts:202-215`. Los dos ficheros están en el
  `territorio:`.
- Ningún otro fichero compara la lista del linter con el catálogo (grep de
  `TABLAS_SOLO_ADICION|tablas_solo_adicion` fuera de las migraciones).
- `11-cobertura.sql:22-27` declara las políticas de T-021, entre ellas `bonos_modificacion` y
  `tarifas_paciente_cierre`. Las dos desaparecen.
- `28-altas-de-centro.sql` cuenta `perfiles_centros` en relativo (antes y después) o por ids
  propios (`:179-201`). Una pertenencia de PRO1 en CE26, cerrada al final de 26, no le rompe
  ningún recuento.
- `27-exportaciones.sql` no lee `citas`, `bonos` ni `tarifas`.

### R2.1 · Las tres piezas rediseñadas

#### R2.1.1 · `tarifas_paciente`: la vigencia se cierra al abrir la siguiente

**Tabla** (mig §4.1, en sitio)
- Se **quitan** tres cosas:
  - la columna `vigente_hasta`;
  - `tarifas_paciente_vigencia_ck`;
  - la exclusión `tarifas_paciente_sin_solape`. El intervalo pasa a derivarse, no a guardarse,
    así que la exclusión ya no tiene sentido. Era el único uso de `extensions.gist_uuid_ops` en
    esta migración; la extensión es anterior y no se toca.
- Se **añade** `orden integer not null`, con
  `constraint tarifas_paciente_orden_uq unique (paciente_id, tipo_terapia_id, orden)`.
- El resto queda igual: `id`, `paciente_id`, `tipo_terapia_id`, `importe` con
  `tarifas_paciente_importe_ck`, `regimen_iva` sin valor por defecto, `vigente_desde`,
  `creada_por` y `creada_en default now()`.
- `comment on table`: «Precio pactado con un paciente para un tipo de terapia, desde
  vigente_desde. Solo adición: cambiar el precio es dar de alta otra tarifa, que cierra la
  anterior en su vigente_desde. La vigencia completa (vigente_hasta) la deriva la vista
  tarifas_paciente_vigencias. orden lo pone la base y desempata dos altas del mismo día; sin FK
  entrante, por la capa 1 (T-021, ronda 2).»
- `comment on column orden`: «Posición de alta dentro de (paciente, tipo): 1, 2, 3… La calcula
  fn_alta_tarifa(); no se manda.»

**Función `fn_alta_tarifa()` y disparador `alta_tarifa`**
- Características de la función:
  - `returns trigger`, `language plpgsql`;
  - **security invoker** (sin `security definer`);
  - `set search_path = ''`;
  - `revoke execute … from public`.
- Disparador: `alta_tarifa before insert on public.tarifas_paciente for each row`.
- Cuerpo, en este orden:
  1. `perform pg_advisory_xact_lock(hashtextextended('tarifa:' || new.paciente_id::text || ':' || new.tipo_terapia_id::text, 0));`
  2. `select max(t.orden) into v_max from public.tarifas_paciente t where t.paciente_id = new.paciente_id and t.tipo_terapia_id = new.tipo_terapia_id;`
  3. `new.orden := coalesce(v_max, 0) + 1;`. Se hace siempre y para todo rol: lo que mande el
     llamante se pisa.
  4. Si `v_max is not null and current_setting('role', true) in ('authenticated', 'anon')`:
     - `select p.centro_id into v_centro from public.pacientes p where p.id = new.paciente_id;`
     - `v_hoy := (now() at time zone public.zona_horaria_centro(v_centro))::date;`
     - si `new.vigente_desde < v_hoy`, lanza
       `raise exception 'Una tarifa que sustituye a otra no puede empezar antes de hoy (fecha del centro): la anterior ya se aplicó (T-021)' using errcode = '23514';`
       Fragmento único: **`no puede empezar antes de hoy`**.
  5. `return new;`
- **Por qué invoker.** Bajo la RLS del llamante, quien no puede leer las tarifas del paciente ve
  `v_max` nulo. No hay guarda de fecha y la RLS lo rechaza con `42501`. Así no hay oráculo de
  existencia (ADR-071.5) ni hace falta replicar permisos.
  - Esto solo vale mientras `tarifas_paciente_lectura` tenga la misma condición que
    `tarifas_paciente_alta`, sin contar `creada_por`. Es el invariante **I-T1** (R2.4).
- **Por qué la primera fila de cada par queda exenta.** No cierra nada: fijar desde enero el
  precio pactado no reescribe ningún hecho. La segunda y siguientes cierran la anterior; con una
  fecha pasada reescribirían lo ya cobrado, que es A-H3 y B-H2.
- **Por qué `postgres` y `service_role` quedan exentos.** Son la fijación y el futuro
  importador, igual que en el paso 6.5 del sellado.

**Vista `tarifas_paciente_vigencias`** (nueva, mig §7.3)
- `with (security_invoker = true)`.
- Columnas, en este orden:
  - `t.id as tarifa_id`, `t.paciente_id`, `t.tipo_terapia_id`, `t.importe`, `t.regimen_iva`,
    `t.vigente_desde`;
  - `lead(t.vigente_desde) over (partition by t.paciente_id, t.tipo_terapia_id order by t.vigente_desde, t.orden) as vigente_hasta`;
  - `t.orden`.
- Semántica: el intervalo es `[vigente_desde, vigente_hasta)`, y `null` significa abierto.
  - Una tarifa sustituida el mismo día queda con `vigente_hasta = vigente_desde`: es un
    intervalo vacío, nunca estuvo vigente.
  - En una fecha X, la tarifa vigente es la única con
    `vigente_desde <= X < coalesce(vigente_hasta, 'infinity')`.
- Esta es la `vigente_hasta` que nombra el contrato: existe, derivada y no editable, como pide
  la decisión del propietario.
- `comment on view`: «Vigencia de cada tarifa: vigente_hasta es el vigente_desde de la siguiente
  del mismo paciente y tipo (null si es la última). security_invoker: ve lo que deja la RLS de
  tarifas_paciente, que es por paciente entero, así que lead() nunca salta una fila oculta.»
- `revoke all … from public, anon, authenticated, service_role;` y
  `grant select … to authenticated;`.

**Se elimina**
- `fn_cerrar_tarifa()` (mig §6.3) y su disparador `cerrar_tarifa` (mig §8.3).
- La política `tarifas_paciente_cierre`.
- `grant update (vigente_hasta)`.
- En la cabecera de la migración, «fn_cerrar_tarifa()» pasa a ser «fn_alta_tarifa()».

**Solo adición, tres capas**
- `revoke update, delete, truncate on table public.tarifas_paciente from postgres;`
- `impedir_modificacion_tarifas_paciente` (`before update or delete … for each row`) e
  `impedir_truncado_tarifas_paciente` (`before truncate … for each statement`), los dos con
  `fn_impedir_modificacion()`.
- Una fila en `tablas_solo_adicion` con el motivo: «Lo que se pactó cobrar no se reescribe:
  cambiar el precio es una tarifa nueva que cierra la anterior al empezar (T-021, ronda 2).»

**Políticas, con el rol en positivo (A-H4)**
```
tarifas_paciente_lectura  for select using:
  (select public.rol_actual()) = 'administrador'
  or ((select public.rol_actual()) = 'profesional_sanitario' and public.es_profesional_asignado(paciente_id))
tarifas_paciente_alta     for insert with check:
  creada_por = (select auth.uid()) and ( <la misma condición> )
```

**Grants**
- `grant select on table public.tarifas_paciente to authenticated;`
- `grant insert (id, paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por) on public.tarifas_paciente to authenticated;`

**Auditoría**: `auditar_tarifas_paciente` se queda, con `fn_auditar('id')`.

#### R2.1.2 · `bonos` y `bonos_caducidades`: la caducidad vigente es la última fila

**`bonos`** (mig §4.5)
- La columna `caducidad` **se queda**: es la caducidad **inicial**, la del alta.
- `comment on table`: «Bono de N sesiones de un paciente. Solo adición: ninguna columna se
  modifica. Las sesiones consumidas se derivan de las citas realizadas con este bono, y la
  caducidad vigente es la última fila de bonos_caducidades (o esta columna si no hay ninguna).
  Las dos las da bonos_consumo (T-021, ronda 2).»
- `comment on column caducidad`: «Caducidad inicial, la del alta. Un cambio posterior es una
  fila en bonos_caducidades; esta columna no se toca.»
- Se **eliminan** `grant update (caducidad)` y la política `bonos_modificacion`.
- **Capas 2 y 3, sin capa 1 y fuera del catálogo** (R2.0):
  - `impedir_modificacion_bonos` (`before update or delete … for each row`);
  - `impedir_truncado_bonos` (`before truncate … for each statement`);
  - las dos con `fn_impedir_modificacion()`.
  - **No** hay `revoke … from postgres`: lo necesitan las claves ajenas de `citas.bono_id` y de
    `bonos_caducidades.bono_id`.
- Políticas `bonos_lectura` y `bonos_alta`:
  - la rama del profesional pasa a
    `((select public.rol_actual()) = 'profesional_sanitario' and public.es_profesional_asignado(paciente_id))`;
  - las ramas de administrador y de técnico quedan como están.
- Grants:
  - `grant select on table public.bonos to authenticated;`
  - `grant insert (id, paciente_id, sesiones_totales, importe, caducidad, creado_por) on public.bonos to authenticated;`
    (sin `creado_en`).

**`bonos_caducidades`** (tabla nueva, mig §4.6, justo después de `bonos`)
```
id              uuid primary key default gen_random_uuid()
bono_id         uuid not null references public.bonos (id)
numero          integer not null
caducidad       date                       -- null = sin caducidad desde este cambio
registrada_por  uuid not null references public.perfiles (id)
registrada_en   timestamptz not null default now()
constraint bonos_caducidades_numero_uq unique (bono_id, numero)
```
- `enable row level security`.
- `comment on table`: «Cada cambio de caducidad de un bono, de solo adición. Vale la de mayor
  numero, y null significa sin caducidad. Prorrogar o acortar un bono es una fila nueva, nunca
  un UPDATE. Sin FK entrante, por la capa 1 (T-021, ronda 2).»
- La fecha **no** se valida contra hoy ni contra el alta (ver «Lo que no entra»).

**Función `fn_numerar_caducidad_bono()` y disparador `numerar_caducidad_bono`**
- La función es `language plpgsql`, **security invoker**, con `set search_path = ''` y
  `revoke execute … from public`.
- Disparador: `numerar_caducidad_bono before insert on public.bonos_caducidades for each row`.
- Cuerpo:
  1. `perform pg_advisory_xact_lock(hashtextextended('caducidad_bono:' || new.bono_id::text, 0));`
  2. `select max(c.numero) into v_max from public.bonos_caducidades c where c.bono_id = new.bono_id;`
  3. `new.numero := coalesce(v_max, 0) + 1;`
  4. `return new;`
- Es invoker por la misma razón que `fn_alta_tarifa()`. Su invariante es **I-B1** (R2.4).

**Solo adición, tres capas**
- `revoke update, delete, truncate on table public.bonos_caducidades from postgres;`
- `impedir_modificacion_bonos_caducidades` e `impedir_truncado_bonos_caducidades`.
- Una fila en `tablas_solo_adicion` con el motivo: «La caducidad de un bono pagado no se
  reescribe: cada cambio es una fila y la vigente es la última (T-021, ronda 2).»

**Políticas**
```
bonos_caducidades_lectura  for select using:
  exists (select 1 from public.bonos b where b.id = bono_id)
bonos_caducidades_alta     for insert with check:
  registrada_por = (select auth.uid())
  and exists (select 1 from public.bonos b where b.id = bono_id)
```
- El `exists` corre bajo la RLS de `bonos`, la del contrato: administrador, profesional (con el
  rol en positivo) o técnico del centro.

**Grants**
- `revoke all on table public.bonos_caducidades from public, anon, authenticated, service_role;`
- `grant select on table public.bonos_caducidades to authenticated;`
- `grant insert (id, bono_id, caducidad, registrada_por) on public.bonos_caducidades to authenticated;`

**Auditoría**
- `auditar_bonos_caducidades after insert or update or delete … for each row execute function public.fn_auditar('id');`

**Vista `bonos_consumo`** (mig §7.2)
- Gana una **quinta columna al final**, `caducidad`.
- Sigue siendo definer con `security_barrier`. Las cuatro columnas actuales y su orden no
  cambian.
```
select b.id as bono_id, b.paciente_id, b.sesiones_totales,
       (… sesiones_consumidas, igual que hoy …) as sesiones_consumidas,
       (case when u.numero is not null then u.caducidad else b.caducidad end) as caducidad
  from public.bonos b
  left join lateral (
    select c.numero, c.caducidad from public.bonos_caducidades c
     where c.bono_id = b.id order by c.numero desc limit 1
  ) u on true
 where <el where de hoy, con la rama del profesional en positivo>
```
- **No** sirve `coalesce(u.caducidad, b.caducidad)`: si el último cambio es `null` («sin
  caducidad»), debe ganar sobre la caducidad inicial. Lo prueba E16c.
- En `comment on view`, añadir «y la caducidad vigente (la última fila de bonos_caducidades, o
  la inicial)».

#### R2.1.3 · `citas.bono_id`: congelado si la cita está realizada o es pasada

- En **`fn_bono_de_la_cita()`** (mig:222-247) se añade como **primera** comprobación, antes de la
  del paciente:
  ```
  if tg_op = 'UPDATE'
     and old.bono_id is distinct from new.bono_id
     and (old.estado = 'realizada'::public.estado_cita or old.fin <= now()) then
    raise exception 'La cita realizada o pasada ya no se cambia de bono: el consumo de un bono pagado no se reescribe (T-021)'
      using errcode = '42501';
  end if;
  ```
  - Fragmento único: **`realizada o pasada ya no se cambia de bono`**.
  - Vale para **todo rol**, `postgres` incluido: la regla 6 la impone la base, no la aplicación.
  - Se miran `old.estado` y `old.fin`, nunca `new.*`. Así el llamante no puede abrirse paso
    cambiando el estado o la hora en la misma sentencia.
- Después sigue la comprobación de paciente que ya existe (`23514`). Que el bono exista lo sigue
  garantizando la clave ajena (`23503`).
- La definición del disparador no cambia (`before insert or update of bono_id, paciente_id`).
- Un `INSERT` de una cita pasada con bono (el importador) sigue permitido, porque
  `tg_op = 'INSERT'`.
- Comentarios:
  - `citas.bono_id`: «Bono del que descuenta esta cita cuando se realiza (T-021, D8). Debe ser
    del mismo paciente, y queda congelado en cuanto la cita está realizada o ha terminado:
    cambiarlo reescribiría el consumo de un bono pagado (ronda 2).»
  - En la función se añade: «y 42501 si la cita (old) está realizada o ya terminó y el bono
    cambia».
- `grant update (bono_id) on public.citas to authenticated` **se queda**: en una cita futura no
  realizada, el bono se asigna, se cambia y se quita.

#### R2.1.4 · Fijación

**`01-fijacion.sql`**

Ids nuevos, junto a `BORR1` y `COB1`:
```
\set TIPO21 '\'a0210003-0000-4000-8000-000000000001\''
\set TAR21  '\'a0210004-0000-4000-8000-000000000001\''
\set BONO21 '\'a0210005-0000-4000-8000-000000000001\''
\set CAD21  '\'a0210006-0000-4000-8000-000000000001\''
```
Después del insert del cobro COB1, como `postgres`:
```
-- T-021 ronda 2 · una fila en tarifas_paciente y otra en bonos_caducidades, que entran en
-- tablas_solo_adicion: sin ellas 10-solo-adicion falla con "debía lanzar y no lanzó".
insert into public.tipos_terapia (id, nombre) values (:TIPO21, 'Terapia de la fijación T-021');
insert into public.tarifas_paciente (id, paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
  values (:TAR21, :P1, :TIPO21, 60.00, 'exento_sanitario', date '2026-01-01', :ADM);
insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por)
  values (:BONO21, :P1, 5, 275.00, null, :ADM);
insert into public.bonos_caducidades (id, bono_id, caducidad, registrada_por)
  values (:CAD21, :BONO21, date '2031-12-31', :ADM);
```

**`26-economico.sql`, ids nuevos** (prefijo `a0260001-`)
```
\set TAR3    '\'a0260001-0000-4000-8000-0000000000c3\''
\set TAR4    '\'a0260001-0000-4000-8000-0000000000c4\''
\set TAR5    '\'a0260001-0000-4000-8000-0000000000c5\''
\set TARTEC  '\'a0260001-0000-4000-8000-0000000000c9\''
\set BONO3   '\'a0260001-0000-4000-8000-0000000000d3\''
\set BONOTEC '\'a0260001-0000-4000-8000-0000000000d9\''
\set COBTEC  '\'a0260001-0000-4000-8000-0000000000e9\''
\set CITAPAS '\'a0260001-0000-4000-8000-0000000000f5\''
\set BORR3   '\'a0260001-0000-4000-8000-0000000000b3\''
\set BORR4   '\'a0260001-0000-4000-8000-0000000000b4\''
\set BORRTEC '\'a0260001-0000-4000-8000-0000000000b9\''
\set PTEC    '\'a0260001-0000-4000-8000-000000000201\''
\set PCE26   '\'a0260001-0000-4000-8000-000000000202\''
\set CE26    '\'a0260001-0000-4000-8000-000000000301\''
```
Se repiten también `\set TIPO21`, `\set TAR21`, `\set BONO21` y `\set CAD21`, como ya se hace con
`BORR1` y `COB1`.

**Fijación propia de 26**, como `postgres`, después de la actual (26:105-145)
1. `insert into public.centros (id, nombre) values (:CE26, 'Centro económico 26');`
2. Dos pacientes:
   `insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values (:PTEC, 'Teo', 'T021 Titular técnico', :TEC1, :CB), (:PCE26, 'Ceci', 'T021 Centro E', :PRO1, :CE26);`
   - PTEC es el escenario de A-H4: el técnico TEC1 figura como `profesional_id`, en un centro
     donde no tiene pertenencia vigente.
3. Tarifa, bonos y cobro:
   - tarifa `:TARTEC`: PTEC, TIPO26, 50.00, `'exento_sanitario'`, `date '2026-01-01'`, ADM;
   - bono `:BONO3`: P1, 2 sesiones, 110.00, caducidad `date '2030-01-31'`, ADM;
   - bono `:BONOTEC`: PTEC, 4 sesiones, 200.00, sin caducidad, ADM;
   - cobro `:COBTEC`: PTEC, 50.00, `date '2026-10-02'`, `'efectivo'`, ADM.
4. Cabeceras:
   - `:BORR3` (P1, PRO1, `creado_por` PRO1) y `:BORR4` (PCE26, PRO1, PRO1) pasan el disparador
     nuevo.
   - `:BORRTEC` (PTEC, TEC1, TEC1) entra **con el disparador desactivado**:
     ```
     alter table public.borradores_factura disable trigger validar_cabecera_borrador;
     insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values (:BORRTEC, :PTEC, :TEC1, :TEC1);
     alter table public.borradores_factura enable trigger validar_cabecera_borrador;
     ```
     Representa una cabecera anterior a la guarda. Sirve para probar que el paso 0 del sellado
     no se apoya en la cabecera.
5. Cita pasada `:CITAPAS`, programada y con `bono_id = :BONO3`:
   - paciente P1, profesional PRO1, centro CA, zona `'Europe/Madrid'`;
   - inicio `((current_date - 37) + time '07:05') at time zone 'Europe/Madrid'`;
   - fin `((current_date - 37) + time '07:55') at time zone 'Europe/Madrid'`.
   - Las 07:05 evitan las citas de PRO1 de otros módulos. Si aun así choca con el sin-solape del
     profesional (`23P01`), se baja a `current_date - 38`. Es la única libertad de esta fijación.
6. Captura de «hoy»:
   `select (now() at time zone public.zona_horaria_centro(:CA))::date as hoy_ca, (now() at time zone public.zona_horaria_centro(:CB))::date as hoy_cb \gset`
7. Precondiciones, con `pg_temp.assert`:
   - «26.fij · TEC1 no tiene CB vigente»:
     `not exists (select 1 from public.perfiles_centros where perfil_id = :TEC1 and centro_id = :CB and hasta is null)`;
   - «26.fij · PRO1 no pertenece a CE26»:
     `not exists (select 1 from public.perfiles_centros where perfil_id = :PRO1 and centro_id = :CE26)`;
   - «26.fij · el disparador de la cabecera está activo»:
     `(select tgenabled from pg_trigger where tgrelid = 'public.borradores_factura'::regclass and tgname = 'validar_cabecera_borrador') = 'O'`.

**Limpieza final de 26**
- Se añade:
  `update public.perfiles_centros set hasta = current_date where perfil_id = :PRO1 and centro_id = :CE26 and hasta is null;`
- La lista de citas que se cancelan no cambia: CITAPAS es pasada y no molesta en la agenda de
  los módulos siguientes.

#### R2.1.5 · Banco 26: qué cambia, prueba por prueba

Toda negativa usa `assert_lanza_codigo_msg` con código y fragmento, salvo que se diga otra cosa,
y nombra su gemela positiva. Cada sobre se construye justo antes de usarlo, como `postgres`, con
`pg_temp.sobre_borrador()` y `\gset`.

**A · Solo adición** (tras A9; como ADM salvo donde se indica)
- A10, A11 y A12: `update … set importe = 1 where id = :TAR21`, `delete` y `truncate` sobre
  `tarifas_paciente` dan `42501`.
- A13, A14 y A15: lo mismo sobre `bonos_caducidades`, con `where id = :CAD21`, dan `42501`.
- A16: `update public.bonos set importe = 1 where id = :BONO1` da `42501`,
  `permission denied for table bonos`.
- A17, como **postgres**: `update public.bonos set importe = importe where id = :BONO1` da
  `42501`, `es de solo adición`. Es la capa 2, porque `postgres` conserva el UPDATE.
- A18, como **postgres**: `delete from public.bonos where id = :BONOTEC` da `42501`,
  `es de solo adición`. El disparador `BEFORE` salta antes que la clave ajena.
- A19, como **postgres**: `truncate public.bonos` da `0A000` (con `assert_lanza_codigo`). Deja
  escrito que, sin `CASCADE`, la clave ajena ya lo impide. La capa 3 se prueba en L8b.

**B · Cadena**: nueva **B9b**, que cierra B-H4 y mata M6a
- Va dentro del bloque con los cerrojos levantados: después de B13 y antes del
  `enable trigger`.
```
select contenido_canonico as sobre_b2v1, encode(huella, 'hex') as huella_b2v1
  from public.borradores_factura_versiones where borrador_id = :BORR2 and numero_version = 1 \gset
update public.borradores_factura_versiones
   set contenido_canonico = replace(contenido_canonico, '"total_centimos":7000', '"total_centimos":7100')
 where borrador_id = :BORR2 and numero_version = 1;
select pg_temp.assert(
  (select position('"total_centimos":7100' in v.contenido_canonico) > 0
     from public.borradores_factura_versiones v where v.borrador_id = :BORR2 and v.numero_version = 1),
  '26.B9b.0 · control: el replace alteró el sobre');
update public.borradores_factura_versiones v
   set huella = extensions.digest(convert_to(v.contenido_canonico, 'UTF8') || v.huella_anterior, 'sha256')
 where v.borrador_id = :BORR2 and v.numero_version = 1;
select pg_temp.assert(
  (select array_agg(r.motivo order by r.motivo) from public.verificar_cadena_borrador(:BORR2) r) = array['sobre_no_coincide_con_fila'],
  '26.B9b · total del sobre alterado y huella recalculada: solo sobre_no_coincide_con_fila (mata M6a)');
update public.borradores_factura_versiones
   set contenido_canonico = :'sobre_b2v1', huella = decode(:'huella_b2v1', 'hex')
 where borrador_id = :BORR2 and numero_version = 1;
select pg_temp.assert((select count(*) from public.verificar_cadena_borrador(:BORR2)) = 0, '26.B9c · restaurado: 0 discrepancias');
```
- BORR2 tiene una sola versión, así que ningún eslabón posterior delata la huella recalculada.
  La única discrepancia posible es `total_centimos` frente a `total`.
- La columna `motivo` de `verificar_cadena_borrador()` está verificada (mig:577).

**C · Cobros**: nueva **C8**
- TEC1 ejecuta
  `insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, registrado_en) values (:P1, 5.00, current_date, 'efectivo', :TEC1, timestamptz '2025-01-01 00:00:00+00')`.
- Da `42501`, `permission denied for table cobros`.
- Gemela: el alta de cobro de TEC1 que ya hay en C.

**D · Consumo**: sin cambios. D1 asigna bonos con las citas todavía programadas y futuras, antes
de la congelación.

**E · Bonos** (sustituye E16, E18 y E18b; E13, E14, E15 y E17 se quedan)
- **E16**: TEC1 inserta en `bonos_caducidades (bono_id, caducidad, registrada_por)` los valores
  `(:BONO1, date '2032-06-30', :TEC1)`. Debe pasar (`assert_no_lanza`).
- **E16b**: TEC1 lee `(select caducidad from public.bonos_consumo where bono_id = :BONO1)` y
  obtiene `date '2032-06-30'`.
- **E16c**: TEC1 inserta otra fila `(:BONO1, null, :TEC1)`, que pasa. Después:
  - `bonos_consumo.caducidad` de BONO1 es **null**: gana la última fila aunque sea nula;
  - el `array_agg(numero order by numero)` de BONO1 en `bonos_caducidades`, leído por TEC1, es
    `'{1,2}'::int[]`.
- **E16d**: TEC1 `update public.bonos set caducidad = date '2033-01-01' where id = :BONO1` da
  `42501`, `permission denied for table bonos`. TEC1 **sí** ve ese bono: el fallo es de
  privilegio, no de RLS.
- **E18**: TEC1, caducidad para `:BONO2` (de otro centro): `42501`, `row-level security`.
- **E18b**, como ADM: `bonos_consumo.caducidad` de BONO2 es null, y BONO2 no tiene filas en
  `bonos_caducidades`.
- **E18c**: TEC1, caducidad para BONO1 con `registrada_por = :ADM`: `42501`,
  `row-level security`.
- **E18d**: TEC1, caducidad para BONO1 mandando `numero` (5): `42501`,
  `permission denied for table bonos_caducidades`.
- **E18e**: lo mismo mandando `registrada_en`: el mismo `42501` con el mismo fragmento.
- Gemela de E18c, E18d y E18e: E16.
- **E18f**: PRO1, caducidad para BONO1: pasa. PRO1, caducidad para BONO2: `42501`,
  `row-level security`.
- **E18g**: TEC1 inserta un bono de P1 mandando
  `creado_en = timestamptz '2025-01-01 00:00:00+00'`: `42501`,
  `permission denied for table bonos`. Gemela: E13.
- **E19**, como ADM: `bonos_consumo.caducidad` de BONO3, sin filas en `bonos_caducidades`, es
  `date '2030-01-31'`, la inicial.

**F · Técnico**
- F8 pasa a
  `array['bono_id', 'paciente_id', 'sesiones_totales', 'sesiones_consumidas', 'caducidad']`.
- Nueva **F3v**: TEC1 cuenta `tarifas_paciente_vigencias where tarifa_id = :TAR1` y obtiene 0.
  Su gemela **F3vg**, como ADM, obtiene 1.
- F10 añade `tarifas_paciente_vigencias` con `security_invoker=true`.

**G · Cabecera**: G8 a G11 se quedan. Las pruebas nuevas van en N.

**H · Auditoría**: H1 pasa a decir «las seis tablas» y añade dos `exists (…)` sobre
`auditoria`:
- `tabla = 'bonos_caducidades'`, `operacion = 'INSERT'`, `registro_id = :CAD21`;
- `tabla = 'tarifas_paciente'`, `operacion = 'INSERT'`, `registro_id = :TAR21`.

**J · Sellado** (como `postgres`, salvo J.auth, como hoy). Las pruebas nuevas van tras J40.
- **J27b**: BORR1, una línea
  `linea_borrador('Sesión de psicoterapia', 1, 6000, 'exento_sanitario', 2100)`, con base 60,
  cuota 0 y total 60. Da `23514`, `una línea exento_sanitario lleva tipo_iva_centesimas 0`.
  Gemela: B1.
- **J27c**: BORR1, una línea `linea_borrador('Informe pericial', 1, 12100, 'general', 0)`, con
  base 121, cuota 0 y total 121. Da `23514`,
  `una línea general lleva tipo_iva_centesimas mayor que 0`. Gemela: B2.
- **J31b**: BORR1, una línea `linea_borrador('Informe pericial', 1, 10000, 'general', 2100)`,
  con base 100, cuota 0 y total 100. Da `23514`,
  `con líneas en régimen general la cuota de IVA no puede ser 0`. Gemela: B2.
- **J28b**: BORR1, una línea `linea_borrador(E'\t\n', 1, 6000)`. Da `23514`,
  `El concepto de una línea`. Gemela: B1.
  - Antes se comprueba con una aserción que el `concepto` del sobre es exactamente `E'\t\n'`.
    Debe escribirse con el escape E de SQL, nunca con un carácter crudo
    (`.claude/rules/supabase.md`, sobre el NUL).
- **J41**: BORR3 v1 con `centro_id = :CE26`, coherente entre sobre y fila. Da `23514`,
  `no es del paciente ni del profesional`: P1 está en CA y PRO1 no tiene CE26.
- **J41p**: BORR4 v1 (PCE26) con `centro_id = :CE26`: pasa. Prueba la rama «centro del
  paciente», porque PRO1 sigue sin CE26.
- Después, como `postgres`:
  `insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:PRO1, :CE26, false);`
- **J41q**: BORR3 v1 con `centro_id = :CE26`: pasa. Prueba la rama «centro del profesional»,
  porque P1 sigue en CA.
- **J42**: BORR1, una línea `linea_borrador('Informe pericial', 1, 10000, 'general', 2100)`,
  con base −50.00, cuota 150.00 y total 100.00. Da `23514`,
  `borradores_factura_versiones_signo_ck` (B-H6).
- **J42g**: BORR3 v2 sin `centro_id`, una línea
  `linea_borrador('Devolución de una sesión', 1, -6000)`, con base −60, cuota 0 y total −60.
  Pasa: el total negativo sigue disponible para rectificar.

**K · Bono y tarifas** (como ADM salvo donde se indica)
- Sustituye K1, K3, K4, K5, K6 y K12. K2, K7, K9, K10, K11 y K13 se quedan, con los ajustes de
  fecha que se indican.
- **K1**: `update public.citas set bono_id = :BONO2 where id = :CITA3` da `23514`,
  `el bono es de otro paciente`. CITA3 está cancelada y es futura, así que la congelación no
  interviene. Antes la prueba usaba CITA1, que ahora está realizada y daría `42501`.
- **K3**: tarifa de P1/TIPO26 desde `(:'hoy_ca'::date - 120)`. Da `23514`,
  `no puede empezar antes de hoy`.
- **K4** (sustituye a la K4 que cerraba en el pasado): tarifa `:TAR3` de P1/TIPO26, 65.00, desde
  `(:'hoy_ca'::date + 30)`. Pasa. Después, en `tarifas_paciente_vigencias`, como ADM:
  - TAR1 tiene `vigente_hasta = :'hoy_ca'::date + 30`;
  - TAR3 tiene `vigente_hasta is null`.
- **K5**: tarifa `:TAR4` de P1/TIPO26, 66.00, desde el **mismo** día (`:'hoy_ca'::date + 30`).
  Pasa. Después:
  - TAR3 tiene `vigente_hasta = vigente_desde`;
  - TAR4 tiene `vigente_hasta is null`;
  - el `orden` de TAR1, TAR3 y TAR4 es 1, 2 y 3.
- **K5b**: tarifa `:TAR5` de P2/TIPO26 desde `(:'hoy_cb'::date - 1)`. Da `23514`,
  `no puede empezar antes de hoy`.
- **K5c**: la misma tarifa desde `:'hoy_cb'::date`. Pasa, y mata el cambio de `<` por `<=`.
- **K6**: `update public.tarifas_paciente set vigente_desde = vigente_desde + 1 where id = :TAR1`
  da `42501`, `permission denied for table tarifas_paciente`.
- **K7** se queda: `update importe` da `42501`.
- **K8**: la fecha pasa a `(:'hoy_cb'::date + 400)` y la aserción a
  `assert_lanza_codigo_msg … '23514', 'tarifas_paciente_importe_ck'`. Así no puede quedar verde
  por la guarda de fecha.
- **K9**: la fecha pasa a `(:'hoy_cb'::date + 400)`; sigue esperando `23502`.
- **K10** se queda: PRO1, PMENOR, `date '2026-01-01'`. Pasa, porque es la primera fila del par
  (exención).
- **K10b**: PRO1, PMENOR, el mismo tipo, `date '2026-02-01'`. Da `23514`,
  `no puede empezar antes de hoy`: ya es la segunda fila.
- **K11** y **K13** se quedan con `42501`. Ninguno de los dos ve las tarifas del paciente, así
  que `v_max` es nulo, no hay guarda de fecha y los rechaza la RLS.
- **K12** (sustituida): tarifa mandando `creada_en` da `42501`,
  `permission denied for table tarifas_paciente`. Mandando `orden`, lo mismo. Gemela: K4.
- **K14**: `update public.citas set bono_id = null where id = :CITAPAS` da `42501`,
  `realizada o pasada ya no se cambia de bono`. Es la rama «pasada»: CITAPAS está programada.
- **K15**: `update public.citas set bono_id = null where id = :CITA1` da el mismo `42501`. Es la
  rama «realizada»: CITA1 es futura.
- **K16**: `update public.citas set bono_id = :BONO2 where id = :CITAP2` pasa, y luego
  `set bono_id = null` también pasa. CITAP2 es futura y está programada. Es la gemela de K14 y
  K15.
- **K17**, como **postgres**: `update public.citas set bono_id = :BONO1 where id = :CITAPAS` da
  el mismo `42501`.
- **K18**: tras K15, `bonos_consumo.sesiones_consumidas` de BONO1 sigue con el mismo valor que
  tenía antes de K15. Se captura con `\gset` justo antes.

**L · Catálogo**
- **L4**, sobre `bonos`:
  - ninguna columna tiene UPDATE para `authenticated`;
  - `not has_column_privilege('authenticated', 'public.bonos', 'creado_en', 'INSERT')`;
  - `has_column_privilege('authenticated', 'public.bonos', 'caducidad', 'INSERT')`.
- **L5**, sobre `tarifas_paciente`:
  - no hay columna `vigente_hasta` (en `information_schema.columns`);
  - ninguna columna tiene UPDATE;
  - `creada_en` y `orden` no tienen INSERT, y `vigente_desde` sí.
- **L5b**:
  - en `bonos_caducidades`, `numero` y `registrada_en` no tienen INSERT, y `caducidad` y
    `bono_id` sí;
  - `cobros.registrado_en` y `borradores_factura.creado_en` no tienen INSERT;
  - `cobros.importe` y `borradores_factura.paciente_id` sí.
- **L6 y L7**: las listas pasan a seis tablas y tres vistas, con `bonos_caducidades` y
  `tarifas_paciente_vigencias` añadidas.
- **L8**: el catálogo queda así, y deja fuera `bonos` y la cabecera:
  ```
  (select array_agg(t.tabla order by t.tabla) from public.tablas_solo_adicion t
    where t.tabla in ('tarifas_paciente', 'borradores_factura', 'borradores_factura_versiones', 'cobros', 'bonos', 'bonos_caducidades'))
  = array['bonos_caducidades', 'borradores_factura_versiones', 'cobros', 'tarifas_paciente']
  ```
- **L8b**: capas 2 y 3 de `bonos`, comprobadas en `pg_trigger` sobre `public.bonos`:
  - existe `impedir_truncado_bonos`, con `tgenabled = 'O'` y
    `tgfoid = 'public.fn_impedir_modificacion()'::regprocedure`;
  - sus bits de `tgtype` son: TRUNCATE (32) activo, BEFORE (2) activo y ROW (1) inactivo;
  - existe `impedir_modificacion_bonos`, con la misma función, ROW, BEFORE, UPDATE (16) y
    DELETE (8).
- **L9**: la RLS está activa en las **seis** tablas.
- **L10**:
  - `fn_validar_cabecera_borrador()` es definer con `search_path=""`;
  - `fn_alta_tarifa()` y `fn_numerar_caducidad_bono()` son **invoker** (`not prosecdef`), con
    `search_path=""`.

**M · Rol en positivo (A-H4)**: bloque nuevo, después de L
- **M1**: TEC1 cuenta 0 en `tarifas_paciente where id = :TARTEC` y 0 en
  `tarifas_paciente_vigencias where tarifa_id = :TARTEC`. Gemela **M1g**: ADM cuenta 1 y 1.
- **M2**: TEC1 cuenta 0 en `cobros` (COBTEC), en `bonos` (BONOTEC) y en `bonos_consumo`
  (BONOTEC). Gemela **M2g**: TEC2, con CB vigente, ve los tres y cuenta **0** en TARTEC.
- **M3**: TEC1 da de alta una tarifa de PTEC (TIPO26, desde `:'hoy_cb'::date + 10`): `42501`,
  `row-level security`.
- **M4**: TEC1 da de alta un cobro de PTEC con `registrado_por = :TEC1`: `42501`,
  `row-level security`.
- **M5**: TEC1 da de alta un bono de PTEC: `42501`, `row-level security`.
- **M6**: TEC1 da de alta una caducidad de BONOTEC: `42501`, `row-level security`.
- **M7**: TEC1 añade a BORRTEC una versión con sobre **coherente**. Da `42501`,
  `No puedes añadir una versión a este borrador`.
  - Sobre:
    `sobre_borrador(:BORRTEC, :TEC1, now(), jsonb_build_array(linea_borrador('Sesión de psicoterapia', 1, 5000)), 50.00, 0.00, 50.00, 'Teo T021', null)`.
  - Gemela: I7 (PRO1 sella en BORR1).

**N · Cabecera (A-H2, A-H5, B-H3)**: bloque nuevo, después de M
- **N1**: PRO1, cabecera (PMENOR, PRO1, `creado_por` **ADM**): `42501`,
  `No puedes abrir este borrador`. Gemela: G8.
- **N2**: PRO1, cabecera (PMENOR, PRO1, PRO1) mandando
  `creado_en = timestamptz '2025-01-01 00:00:00+00'`: `42501`,
  `permission denied for table borradores_factura`. Gemela: G8.
- **N3**: ADM, cabecera (P1, **PRO2**, ADM): `23514`, `no atiende a ese paciente`.
- **N4**: ADM, cabecera (PTEC, **TEC1**, ADM): `23514`,
  `debe tener rol profesional_sanitario o administrador`.
- **N5**: ADM, cabecera (P1, PRO1, ADM): pasa. Es la gemela de N3 y N4.
- **N6**: ADM, cabecera (PFUS, PRO2, ADM): pasa. PFUS está fusionado en P2, que es de PRO2: un
  salto de fusión.
- **N7**: ADM, cabecera (P1, PRO1, `creado_por` **PRO1**): `42501`,
  `No puedes abrir este borrador`.

**Otros ficheros**
- **`11-cobertura.sql`**: se quitan `'bonos_modificacion'` y `'tarifas_paciente_cierre'`, y se
  añaden `'bonos_caducidades_lectura'` y `'bonos_caducidades_alta'`.
- **`scripts/rls/README.md`**, fila 26: se añade «bonos_caducidades y tarifas_paciente_vigencias
  (solo añadir, ronda 2), congelación de citas.bono_id, rol en positivo, validación de la
  cabecera y del centro de la versión».
- **Linter**:
  - `TABLAS_SOLO_ADICION` gana, al final y en este orden, `'tarifas_paciente'`, `'bonos'` y
    `'bonos_caducidades'`; su prueba exacta se actualiza;
  - `bonos` sí entra en el linter: ninguna migración debe escribir `update`, `delete` ni
    `truncate` sobre ella. Del catálogo queda fuera solo por la capa 1, que el linter no mira.
- **Tipos**: `npx supabase db reset` y después `npm run tipos`. `lib/supabase/tipos-bd.ts` se
  regenera, nunca se edita.

### R2.2 · Una decisión por hallazgo

| Hallazgo | Decisión | Cómo / por qué |
|---|---|---|
| A-H1, B-H1 (ALTA) | Arreglar | R2.1.1, R2.1.2 y R2.1.3. Las dos tablas nuevas llevan tres capas y entran en el catálogo; `bonos` lleva capas 2 y 3 |
| A-H2, B-H3 | Arreglar | `borradores_factura_alta` gana `creado_por = (select auth.uid())` en las dos ramas, y `creado_en` sale del grant de insert. Pruebas N1, N2 y N7 |
| A-H3, B-H2 | Arreglar | Guarda de fecha de `fn_alta_tarifa()` y grant por columnas (`creada_en`). Pruebas K3, K5b, K5c, K10b y K12 |
| A-H4 | Arreglar | Rol en positivo en toda rama con `es_profesional_asignado`: `tarifas_paciente_lectura` y `_alta`, `cobros_lectura` y `_alta`, `bonos_lectura` y `_alta`, el `where` de `bonos_consumo`, `borradores_factura_versiones_alta` y el paso 0 del sellado (`or ((select public.rol_actual()) = 'profesional_sanitario' and exists (…))`). Pruebas M1 a M7 |
| A-H5 | Arreglar | Disparador nuevo `validar_cabecera_borrador` (R2.2.1). Pruebas N3 a N6 |
| A-H6 | Arreglar | Congelación en `fn_bono_de_la_cita()` (R2.1.3). Pruebas K14 a K18 |
| A-H7.1, B-H5 | Arreglar | Por línea: exento ⇒ `tipo_iva_centesimas = 0`, general ⇒ `> 0`. En 6.4: si la suma de líneas generales ≠ 0, la cuota ≠ 0. Pruebas J27b, J27c y J31b. El redondeo **no** se repite (ver «Lo que no entra») |
| A-H7.2, B-H6 | Arreglar | `constraint borradores_factura_versiones_signo_ck check (sign(base) in (0, sign(total)) and sign(cuota_iva) in (0, sign(total)))`, junto a la de `base + cuota_iva = total`. Pruebas J42 y J42g |
| B-H4 (M6a) | Arreglar | Prueba B9b; en `mutantes.json`, M6a pasa a «muerto por 26.B9b». No era equivalente: el verificador no comprueba la coherencia interna del sobre |
| B-H7 | Arreglar | Grants de insert por columnas, sin `cobros.registrado_en`, `borradores_factura.creado_en`, `bonos.creado_en`, `tarifas_paciente.creada_en` y `.orden`, ni `bonos_caducidades.numero` y `.registrada_en`. Las versiones siguen con su margen de ±1 minuto (6.5). Pruebas C8, E18d, E18e, E18g, K12, N2, L4, L5 y L5b |
| B-H8 | Arreglar | Paso 6.2.bis del sellado (R2.2.2). Pruebas J41, J41p y J41q |
| B-H9 | Aceptar y anotar | La prueba de dos conexiones necesita un guion y un script de `package.json` fuera del `territorio:`. La serialización copia la de la nota, que sí cubre `test:huellas`. Los índices únicos (`numero_version`, `orden`, `numero`) convierten una carrera en `23505`, nunca en un dato corrupto. Se anota en `docs/state.md` §Hallazgos |
| B-H10 | Arreglar | Paso 6.3: `json_typeof(v_linea -> 'concepto') is distinct from 'string' or (v_linea ->> 'concepto') !~ '[^[:space:]]'`, con el mismo mensaje. Prueba J28b |
| Descartes de B (números no canónicos, P0002, F7) | Nada | Los descartó el propio revisor después de medir |

#### R2.2.1 · `fn_validar_cabecera_borrador()`

- La función es `language plpgsql`, **security definer**, con `set search_path = ''` y
  `revoke execute … from public`.
- Disparador: `validar_cabecera_borrador before insert on public.borradores_factura for each row`.
- **Paso 0**, solo si `current_setting('role', true) in ('authenticated', 'anon')`. Replica
  exactamente la política `borradores_factura_alta` nueva:
  ```
  if not coalesce(
       new.creado_por = (select auth.uid())
       and ((select public.rol_actual()) = 'administrador'
            or ((select public.rol_actual()) = 'profesional_sanitario'
                and new.profesional_id = (select auth.uid())
                and public.es_profesional_asignado(new.paciente_id))), false) then
    raise exception 'No puedes abrir este borrador: lo abre el administrador o el profesional asignado al paciente, y a su propio nombre (T-021)'
      using errcode = '42501';
  end if;
  ```
- **Paso 1**, para todo rol:
  ```
  select p.profesional_id, s.profesional_id into v_prof, v_prof_fusion
    from public.pacientes p left join public.pacientes s on s.id = p.fusionado_en
   where p.id = new.paciente_id;
  if not found
     or (new.profesional_id is distinct from v_prof and new.profesional_id is distinct from v_prof_fusion) then
    raise exception 'El profesional del borrador no atiende a ese paciente (T-021)' using errcode = '23514';
  end if;
  ```
- **Paso 2**, para todo rol:
  ```
  select f.rol into v_rol from public.perfiles f where f.id = new.profesional_id;
  if v_rol is null or v_rol not in ('profesional_sanitario'::public.rol_usuario, 'administrador'::public.rol_usuario) then
    raise exception 'El profesional del borrador debe tener rol profesional_sanitario o administrador (T-021)' using errcode = '23514';
  end if;
  ```
  - `perfiles.rol` es de tipo `public.rol_usuario` (`20260815192424:31`), verificado.
- `return new;`
- **Por qué un disparador definer y no la política.** La comprobación lee `pacientes` y
  `perfiles` de otros profesionales, que la RLS del profesional no le deja ver. Además tiene que
  valer también para `postgres` (la fijación y el importador).
- El paso 0 va primero por ADR-071.5: así nadie sin permiso distingue «paciente inexistente» de
  «profesional que no lo atiende».
- La política se queda como segunda red. Como es idéntica al paso 0, el mutante que le quita una
  rama es equivalente, y así se declara.

#### R2.2.2 · Paso 6.2.bis del sellado: el `centro_id` de la versión

Va justo después de la comprobación del `centro_id` del sobre (mig:397-400):
```
if new.centro_id is not null
   and new.centro_id is distinct from (select p.centro_id from public.pacientes p where p.id = v_paciente_id)
   and not exists (select 1 from public.perfiles_centros pc
                    where pc.perfil_id = v_profesional_id and pc.centro_id = new.centro_id) then
  raise exception 'El centro_id de la versión no es del paciente ni del profesional del borrador (T-021)'
    using errcode = '23514';
end if;
```
- `v_paciente_id` y `v_profesional_id` son las variables que ya rellena la lectura de la
  cabecera (mig:267-268, 334), verificadas.
- Las pertenencias cuentan **sin filtrar por `hasta`**: un borrador puede cubrir sesiones de una
  pertenencia ya cerrada. Lo que se impide es un centro que no tenga que ver con ninguno de los
  dos.
- El fragmento `no es del paciente ni del profesional` no choca con `El centro_id del sobre no
  coincide`.

### R2.3 · Criterio 12: cómo se ejecuta sin tocar el contrato

El contrato exige dos cosas a la vez:
- un comentario que nombre las tablas que **no** se crean, `series_facturacion` incluida;
- un grep literal que no devuelva nada.

No pueden cumplirse las dos. El criterio 13 ya resolvió el mismo choque limitándose a «las
líneas que no son comentario», y el criterio 12 se cierra igual. La evidencia recoge **las tres
salidas**:

```
# 1 · El criterio, sobre el código (sin comentarios de línea):
sed -E 's/--.*$//' supabase/migrations/20261011120000_economico_esquema.sql | grep -ciE "serie|numeracion|qr|verifactu|registro_facturacion"
# → 0

# 2 · No hay comentarios de bloque que el sed no quite:
grep -c '/\*' supabase/migrations/20261011120000_economico_esquema.sql
# → 0

# 3 · El grep literal del contrato, para que conste qué devuelve y por qué:
grep -niE "serie|numeracion|qr|verifactu|registro_facturacion" supabase/migrations/20261011120000_economico_esquema.sql
# → exactamente una línea: el comentario de cabecera «no se crean … series_facturacion …» que exige el contrato (ADR-053)
```

- En `evidencia.json` el criterio 12 queda **PASA**, con la nota: «literal: 1 coincidencia, la
  del comentario obligatorio; fuera de comentarios: 0».
- Si (3) devuelve más de una línea, el criterio **falla**.
- Por eso, ningún comentario, mensaje ni nombre nuevo de la ronda 2 puede contener `serie`,
  `numeracion`, `qr`, `verifactu` ni `registro_facturacion`, ni `espejo` ni `proveedor` fuera de
  comentarios (criterio 13).
  - Ojo con «en serie» y con cualquier `…qr…` dentro de una palabra.
  - El implementador repite (1), (3) y el grep del criterio 13 **después** de escribir los
    comentarios nuevos.

### R2.4 · Lista de comprobación de la ronda 2

Para el revisor y para la autoevaluación del implementador.

**Qué elige quien llama, y qué efecto tiene**
- [ ] En `tarifas_paciente`, `authenticated` elige solo `paciente_id`, `tipo_terapia_id`,
  `importe`, `regimen_iva`, `vigente_desde` y `creada_por`.
  - `orden` lo pisa el disparador, y además no tiene grant.
  - `creada_en` no tiene grant.
  - `creada_por` lo ata la política.
  - Un `vigente_desde` pasado solo entra si es la primera fila del par.
- [ ] En `bonos_caducidades` elige `bono_id`, `caducidad` y `registrada_por`, este último atado
  a `auth.uid()`. `numero` y `registrada_en` no los elige.
- [ ] En `bonos` ya no hay UPDATE de ninguna columna (L4). En `cobros` y en la cabecera,
  `registrado_en` y `creado_en` no se pueden insertar (L5b).
- [ ] En la cabecera:
  - el profesional solo puede poner `profesional_id` = él mismo;
  - el administrador solo puede poner un profesional o administrador que atienda al paciente
    (pasos 1 y 2);
  - `creado_por` es siempre quien inserta.
- [ ] En la versión, `centro_id` es null, el centro del paciente o una pertenencia del
  profesional (6.2.bis).

**Qué prueba debe fallar, y por qué motivo exacto**
- [ ] K3, K5b y K10b fallan por `no puede empezar antes de hoy` y no por la RLS: las hace ADM o
  el profesional asignado, y ya existe una fila anterior.
- [ ] K8 falla por `tarifas_paciente_importe_ck` y no por la fecha, porque su fecha es futura.
- [ ] K14 discrimina la rama «pasada» (CITAPAS, programada) y K15 la rama «realizada» (CITA1,
  futura). Quitar una de las dos ramas tumba exactamente una de las dos pruebas.
- [ ] K1 falla por `el bono es de otro paciente` sobre CITA3, que está cancelada y es futura: la
  congelación no interviene.
- [ ] E16c mata `coalesce(u.caducidad, b.caducidad)`, y E19 mata un `case` sin `else`.
- [ ] M7 exige el fragmento del paso 0 (`No puedes añadir una versión`), no solo `42501`.
  - Si se quita el rol del paso 0, la versión coherente se sella o muere en la política con
    `row-level security`, y en los dos casos M7 se pone roja.
  - Comprobar que el sobre de M7 es coherente: con uno incoherente moriría en 6.x con `23514`
    por otra razón.
- [ ] B9b lleva su aserción de control (el `replace` cambió el texto). Sin ella, un `replace`
  que no casa deja la prueba verde sin probar nada.
- [ ] J41 y J41q usan CE26, nunca CB, porque PRO1 tiene CB (`06-centro.sql:37`).
- [ ] C8, E18d, E18e, E18g, K12 y N2 piden `permission denied for table …`, no
  `row-level security`. Quien llama tiene permiso sobre la fila; lo que le falta es el de la
  columna.
- [ ] Cada mutante de R2.6 se ejecuta por separado, y el banco se pone rojo en la prueba
  nombrada, no en otra.

**Invariantes que se podrían saltar por otra puerta**
- [ ] **I-T1**: `tarifas_paciente_lectura` tiene la misma condición que
  `tarifas_paciente_alta`, sin contar `creada_por`. Si alguien amplía el alta sin ampliar la
  lectura, `fn_alta_tarifa()` (invoker) calcula `max(orden)` sobre filas parciales: dará
  `23505` o saltará la guarda de fecha.
- [ ] **I-B1**: las caducidades se leen y se dan de alta a través del bono, con un `exists` bajo
  la RLS de `bonos`.
- [ ] **I-B2**: `bonos_lectura` y `bonos_alta` tienen las mismas ramas, sin contar
  `creado_por`.
- [ ] El `lead()` de la vista solo es correcto si la RLS de tarifas oculta pacientes enteros,
  nunca filas sueltas de un paciente.
- [ ] **Null**:
  - se usa `old.bono_id is distinct from new.bono_id`, no `<>`: quitar el bono (`→ null`)
    también está congelado;
  - en el paso 1 de la cabecera, `is distinct from` contra las dos columnas: con `fusionado_en`
    nulo, `v_prof_fusion` es null y no deja pasar a nadie;
  - en el paso 2, un perfil inexistente da `v_rol` null y se rechaza;
  - el paso 0 va envuelto en `coalesce(…, false)`.
- [ ] **Duplicados**: `unique (paciente_id, tipo_terapia_id, orden)` y
  `unique (bono_id, numero)`. Dos altas del mismo par el mismo día se ordenan por `orden`,
  nunca por `creada_en`.
- [ ] **Concurrencia**: el candado consultivo va antes de leer `max`, en las dos funciones. No
  hay prueba de dos conexiones (B-H9, aceptado); la red son los índices únicos.
- [ ] **`postgres` y TRUNCATE**:
  - `tarifas_paciente` y `bonos_caducidades` tienen la capa 1 revocada también a `postgres`, y
    las recorre `10-solo-adicion`;
  - `bonos` tiene capas 2 y 3 (A17, A18 y L8b);
  - `cobertura_solo_adicion()` sigue en 0 (B15) porque `bonos` no está en el catálogo. Comprobar
    que nadie lo ha añadido «por coherencia»: rompería B15 y `10-solo-adicion`.
- [ ] **Orden de disparadores en `citas`**: la congelación vive dentro de `bono_de_la_cita`, el
  primero alfabéticamente. Que nadie la haya sacado a un disparador aparte que pueda quedar
  detrás de `proteger_cita_pasada`.
- [ ] **La congelación lee `old`**: `update citas set estado = 'programada', bono_id = …` sobre
  una cita realizada sigue congelado.
  - El camino en **dos** sentencias sobre una cita **futura** realizada no se cierra aquí (ver
    «Lo que no entra»).
  - En una cita pasada no hay puerta, porque decide `old.fin`.
- [ ] **Permisos antes que cotejo en las definer**:
  - `fn_validar_cabecera_borrador()` hace el paso 0 antes de leer `pacientes` y `perfiles`;
  - el sellado mantiene su paso 0, ahora con el rol en positivo.
- [ ] `bonos_consumo` sigue siendo definer con barrera, y su `where` coincide rama por rama con
  `bonos_lectura`, incluido el rol del profesional.
- [ ] Los greps de los criterios 12 y 13 se repiten sobre la migración final (R2.3).
- [ ] `10-solo-adicion` y `cobertura_solo_adicion()` están en verde con las cuatro tablas de
  T-021 en el catálogo. El banco entero (`npm run test:rls`) está en verde, no solo el
  módulo 26.

### R2.5 · Riesgos, por probabilidad

1. **Alta**: que la fijación de 01 falle por el orden de los `\set` o por falta de
   `tipos_terapia`, y entonces `10-solo-adicion` falle en las tablas nuevas.
   - Mitigación: R2.1.4 da los ids y las filas exactas, y se corre el banco entero.
2. **Media**: que CITAPAS choque con una cita de PRO1 de otro módulo (`23P01`).
   - Mitigación: la franja de las 07:05 y una única alternativa permitida,
     `current_date - 38`.
3. **Media**: que la cobertura de otro módulo (`02-matriz-roles`, `11-cobertura` o
   `12-resto-de-tablas`) enumere tablas o políticas y no conozca `bonos_caducidades`.
   - Si el fichero está en el `territorio:` (`11-cobertura.sql`), se añade.
   - Si está fuera, es un **bloqueo**: se anota en `state.md` y se para, sin tocar el fichero
     ajeno.
4. **Media**: que un ticket posterior (T-023, T-026) quiera una clave ajena hacia
   `tarifas_paciente` o `bonos_caducidades`. La capa 1 lo impide: tendrá que usar una
   referencia sin FK y un `exists` en la política. Queda escrito en el comentario de cada tabla.
5. **Baja**: que cambie el idioma de los mensajes del motor (`lc_messages`) y los fragmentos
   `permission denied` y `row-level security` dejen de casar. El banco ya depende de ellos en
   16, 17, 19 y 21.
6. **Baja**: que un fragmento nuevo sea prefijo de uno viejo. Están elegidos para que no:
   - `mayor que 0` frente a `mayor o igual que 0`;
   - `no es del paciente ni del profesional` frente a `del sobre no coincide`.

### R2.6 · `mutantes.json` de la ronda 2

- **M6a**: el resultado pasa a «muerto por 26.B9b», con la nota de B-H4.
- Los mutantes nuevos, cada uno con la prueba que debe ponerse roja:

| Id | Mutación | Muere en |
|---|---|---|
| M7 | quitar `or old.fin <= now()` de la congelación | K14, K17 |
| M8 | quitar `old.estado = 'realizada' or` | K15 |
| M9 | quitar la guarda de fecha de `fn_alta_tarifa()` | K3, K5b, K10b |
| M10 | `<` → `<=` en la guarda | K5c |
| M11 | aplicar la guarda también a la primera fila (sin `v_max is not null`) | K10 |
| M12 | quitar el paso 1 de la cabecera | N3 |
| M13 | quitar el paso 2 de la cabecera | N4 |
| M14 | quitar el paso 0 de la cabecera | N1 (cambia el fragmento) |
| M15 | quitar 6.2.bis | J41 |
| M16 | 6.2.bis sin la rama del paciente | J41p |
| M17 | 6.2.bis sin la rama del profesional | J41q |
| M18 | quitar el rol en `tarifas_paciente_lectura` | M1 |
| M19 | quitar el rol en la rama del profesional de `cobros_lectura` y `bonos_lectura` | M2 |
| M20 | quitar el rol en el paso 0 del sellado | M7 |
| M21 | quitar `borradores_factura_versiones_signo_ck` | J42 |
| M22 | volver a `length(trim(…)) = 0` | J28b |
| M23 | quitar «exento ⇒ tipo 0» | J27b |
| M24 | quitar «general ⇒ tipo > 0» | J27c |
| M25 | quitar «general ⇒ cuota ≠ 0» | J31b |
| M26 | `coalesce(u.caducidad, b.caducidad)` en `bonos_consumo` | E16c |
| M27 | quitar `impedir_modificacion_bonos` | A17, A18 |
| M28 | quitar `impedir_truncado_bonos` | L8b |
| M29 | quitar el candado de `fn_alta_tarifa()` o de `fn_numerar_caducidad_bono()` | **sobrevive**: no hay prueba de dos conexiones (B-H9, aceptado). Se declara superviviente, **no** equivalente |
| M30 | quitar el rol en `borradores_factura_versiones_alta` | **equivalente**: el paso 0 del sellado tiene la misma condición y corre antes que la política para todo `authenticated`; `anon` no tiene grant |

### R2.7 · Territorio y delegable

- **Territorio**: sin cambios. Todos los ficheros de la ronda 2 ya están en el `territorio:` del
  contrato:
  - la migración;
  - `01`, `11`, `26` y `README.md` de `scripts/rls/`;
  - el linter y su prueba;
  - `tipos-bd.ts`;
  - `tickets/T-021/**`, la bitácora y `state.md`.
- **No** se tocan `scripts/rls/10-solo-adicion.sql` ni `00-ayudantes.sql`: el bucle genérico ya
  recorre las tablas nuevas.
- **Delegable**: nada. Todo es RLS, privilegios, disparadores y dinero.

### R2.8 · Memoria al cerrar

- En la bitácora `docs/bitacora/T-021*.md`: la ronda 2, citando la decisión del propietario del
  05-10-2026.
- En `docs/state.md` §Hallazgos, dos entradas:
  1. B-H9: falta una prueba de concurrencia de dos conexiones para el sellado del borrador, la
     numeración de tarifas y la de caducidades. Patrón: `test:huellas`.
  2. Las transiciones de estado de una cita realizada (pasarla a cancelada baja el consumo del
     bono) no tienen guarda. Es de la misma familia que A-H6; se decide con la agenda.

## Lo que no entra en la ronda 2, y por qué

- **Capas de solo adición en la cabecera `borradores_factura`.** Ya no tiene ningún grant de
  UPDATE ni DELETE (A7), y la capa 1 rompería la FK de las versiones (`borrador_id`). Se decide
  con T-026.
- **Una guarda para el estado de una cita realizada** (pasarla de realizada a cancelada baja el
  consumo). La decisión del propietario habla de `bono_id`, no del estado, y
  `fn_proteger_cita_pasada()` pertenece a la agenda. Va a `state.md`.
- **El camino en dos sentencias sobre una cita futura realizada** (desmarcarla y después cambiar
  el bono). Una sesión no se realiza antes de que ocurra, así que solo pasa en una cita en curso.
  Lo cerrará la guarda de estado del punto anterior.
- **Validar la fecha de una caducidad** (que no sea pasada ni anterior al alta) **y los límites
  del bono** (consumir más sesiones de las compradas). Son reglas de negocio sin criterio en el
  contrato.
- **Corregir una tarifa con fecha pasada.** Con «solo añadir» la corrección empieza hoy. Es la
  consecuencia buscada, no un hueco.
- **La prueba de concurrencia de dos conexiones** (B-H9): está fuera del territorio y queda
  aceptada arriba.
- **Repetir el redondeo del IVA de `lib/dinero`** dentro del sellado. Las comprobaciones de la
  ronda 2 son de categoría (tipo según régimen, cuota según régimen, signo), no aritméticas.
- **Validar que el profesional de la cabecera esté activo.** Un profesional de baja ya no lee
  nada (ADR-032), así que su cabecera no expone datos.
