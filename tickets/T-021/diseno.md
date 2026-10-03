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
