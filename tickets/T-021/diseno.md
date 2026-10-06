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


## Ronda 3 — decisiones del propietario (05-10-2026), diseño pendiente

- **B-H1 (MEDIA)**: el bono de una cita realizada o pasada con `bono_id` nulo se puede poner **una sola vez**; después queda fijo (también para `postgres`). Quitarlo o cambiarlo sigue prohibido.
- **A-H2 (BAJA)**: el profesional lee borradores y versiones **solo mientras tiene asignado al paciente**; tras reasignar, los ven el nuevo y el administrador.
- **Ronda 3 corta antes del merge**: entran también la cota de la cuota de IVA respecto a las líneas generales (A-H1/B-H2: cuota mayor que la suma, base 0 con cuota llena, tipo 9999 %) y los blancos de anchura cero en el concepto (B-H3).


## Ronda 3 (05-10-2026)

Alcance: los cinco hallazgos que meten en la ronda las decisiones del propietario de arriba
(B-H1, A-H2, A-H1 = B-H2, B-H3). Base: rama `worktree-agent-a19ecdb63f2c1e386`, HEAD a982e0a.

**Solo añadir.** La migración de las rondas 1 y 2
(`supabase/migrations/20261011120000_economico_esquema.sql`) **no se toca**: ya está aplicada en la
base local. Todo lo de la ronda 3 va en una migración nueva hacia delante:

**`supabase/migrations/20261011130000_economico_ronda_3.sql`**

Queda entre la 20261011120000 (T-021) y la 20261012120000 (reservada a T-043).

### R3.0 · Hechos verificados contra el código

Rutas de la rama, salvo que se diga otra cosa. `mig` es `supabase/migrations/20261011120000_economico_esquema.sql`.

**La congelación del bono**
- La congelación vive en `fn_bono_de_la_cita()` (`mig:249-283`). Es definer, con `search_path = ''`.
- Su disparador es `bono_de_la_cita`: `before insert or update of bono_id, paciente_id`, en `mig:285-287`.
- La condición actual no mira si `old.bono_id` es nulo (`mig:260-262`). Por eso bloquea también el primer `null → bono` de una cita pasada (B-H1).
- `comment on column public.citas.bono_id` (`mig:241-244`) y `comment on function` (`mig:277-281`) describen la congelación de la ronda 2. Hay que reescribirlos.
- Precedente exacto de «de nulo a un valor sí; cambiarlo o quitarlo, no»: la regla de `episodio_id` en `fn_proteger_cita_pasada()` (T-039, `supabase/migrations/20261007120000_*.sql`, en main).
- `fn_proteger_cita_pasada()` no bloquea ni `bono_id` ni `estado` en una cita pasada. Marcar realizada una cita pasada está permitido.
- Al pasar a realizada una cita que ya terminó, `fn_alertar_nota_sin_firmar()` (`20260906120000_agenda_esquema.sql:453-499`) abre una alerta. Los módulos 27 y 28 del banco no leen `alertas_documentacion` ni citas (comprobado con grep).

**La lectura de los borradores**
- La política de lectura de la cabecera está en `mig:1119-1125`: administrador, o profesional con `profesional_id = auth.uid()`. **No exige asignación** (A-H2).
- Quién sigue a esa política sin tocarse:
  - `borradores_factura_versiones_lectura` es un `exists` sobre la cabecera, que corre bajo la RLS de quien consulta;
  - `borradores_factura_estado` es `security_invoker`.
- Las políticas de alta (`borradores_factura_alta`, `borradores_factura_versiones_alta`) y el paso 0 del sellado ya exigen `es_profesional_asignado`.
- `es_profesional_asignado(p_paciente_id)` (`20260822160000_rls_funciones_y_politicas.sql:93-115`):
  - es definer y no mira el rol;
  - da verdadero si `auth.uid()` es el `profesional_id` del paciente o el del superviviente de una fusión, y el perfil está activo.
- Reasignar un paciente lo permite `fn_proteger_columnas_reservadas_paciente()` solo al administrador. Tampoco exime a `postgres`.
- Precedente de reasignar y revertir dentro del banco: `scripts/rls/12-resto-de-tablas.sql:79-98`.

**El sellado**
- El sellado vive en `fn_sellar_version_borrador()` (`mig:294-635`), con el disparador `sellar_version_borrador` (`mig:992-994`). No hay otro disparador `before insert` sobre las versiones.
  - Recorre `v_sobre -> 'lineas'` como `json` (`mig:501`).
  - Antes ha cotejado que esas líneas son jsonb-equivalentes a `new.lineas` (`mig:466`).
  - Ha validado cada línea: seis claves sin repetir, cantidad entera ≥ 1, precio entero, régimen del enum, tipo entero ≥ 0 y tipo según régimen (`mig:505-561`).
- El concepto se valida con `!~ '[^[:space:]]'` (`mig:513`). No ve U+200B ni U+FEFF (B-H3, medido por B).
- 6.4 (`mig:589-602`) tiene tres comprobaciones:
  - suma de líneas = total;
  - todo exento ⇒ cuota 0;
  - `v_suma_general <> 0` ⇒ cuota ≠ 0.

  No hay cota de la cuota ni techo del tipo (A-H1, B-H2).
- La tabla (`mig:120-141`) tiene `lineas jsonb`, `base`, `cuota_iva` y `total numeric(12,2)`, y dos restricciones:
  - `importes_ck`: `base + cuota_iva = total`;
  - `signo_ck`: `sign(base)` y `sign(cuota_iva)` ∈ (0, `sign(total)`).

  Las restricciones `check` se comprueban **después** de los disparadores `before`.

**El banco y los tipos**
- `scripts/rls/26-economico.sql`:
  - J42 (líneas 1028-1033) espera el fragmento `borradores_factura_versiones_signo_ck` con base −50, cuota 150 y total 100. La cota nueva la parará antes: **hay que reescribirla**.
  - B2 (líneas 298-308) es la gemela positiva de la cota: cuota 21,00 sobre una general de 121 € al 21 %.
  - Las positivas de J41p, J41q y J42g sellan sobre BORR3 y BORR4. Ninguna prueba posterior cuenta versiones de BORR3.
- `scripts/rls/11-cobertura.sql` declara políticas por nombre. Los nombres no cambian.
- `lib/supabase/tipos-bd.ts` no lista las funciones de disparador (`fn_sellar_version_borrador` no aparece). La función nueva tampoco aparecerá.
- `.github/workflows/*.yml` corre:
  - `supabase db reset` y `supabase migration up`;
  - `lint:migraciones`;
  - la comprobación de que los tipos están generados.

### R3.1 · La migración nueva: piezas y contratos

Cabecera de la migración. Comentario de lista, igual que el de la 20261011120000:
- B-H1;
- A-H2;
- cotas del sellado.

Ninguna palabra de las prohibidas por los criterios 12 y 13 (R2.3), ni en comentarios ni en las cadenas de `comment on`.

#### R3.1.a · B-H1 · el bono de la cita terminada se pone una vez

`create or replace function public.fn_bono_de_la_cita()` con el mismo cuerpo que `mig:249-275`. Cambian **solo** la condición de la congelación y el comentario de dentro:

```sql
  -- Ronda 3 (B-H1): de nulo a un bono se admite una vez; cambiarlo o quitarlo, no
  -- (mismo patrón que episodio_id en fn_proteger_cita_pasada, T-039). Se mira old.
  if tg_op = 'UPDATE'
     and old.bono_id is not null
     and old.bono_id is distinct from new.bono_id
     and (old.estado = 'realizada'::public.estado_cita or old.fin <= now()) then
    raise exception 'La cita realizada o pasada ya no se cambia de bono: el consumo de un bono pagado no se reescribe (T-021)'
      using errcode = '42501';
  end if;
```

- Lo demás no cambia:
  - el mensaje y el código: los fragmentos de K14, K15 y K17 siguen valiendo;
  - la comprobación del paciente, que se aplica también a la primera asignación;
  - `security definer` y `set search_path = ''`.
- Se repite `revoke execute on function public.fn_bono_de_la_cita() from public;`. `create or replace` conserva los privilegios; repetirlo cuesta una línea.
- El disparador **no** se recrea.
- `comment on column public.citas.bono_id is '...'`, reescrito: «Bono del que descuenta esta cita cuando se realiza (T-021, D8). Debe ser del mismo paciente. En la cita realizada o terminada, un bono nulo se puede poner una vez; el que ya tiene no se cambia ni se quita, porque reescribiría el consumo de un bono pagado (rondas 2 y 3).»
- `comment on function public.fn_bono_de_la_cita() is '...'`, reescrito con la misma regla: 42501 si `old` está realizada o terminada, ya tenía bono y el bono cambia.

#### R3.1.b · A-H2 · el profesional lee mientras tiene asignado al paciente

```sql
alter policy borradores_factura_lectura on public.borradores_factura
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and public.es_profesional_asignado(paciente_id))
  );
```

- `alter policy`, no `drop`/`create`: el nombre que declara `11-cobertura` no cambia, y no hay un instante sin política.
- Desaparece `profesional_id = auth.uid()`. Tras reasignar, la regla es:
  - lee el profesional asignado ahora;
  - el anterior deja de leer;
  - el administrador lee siempre.
- Las versiones y la vista de estado lo heredan sin tocarse (R3.0).
- **Escribir no cambia.** El alta de versión (política y paso 0) sigue exigiendo `b.profesional_id = auth.uid()` **y** la asignación. Tras reasignar, nadie salvo el administrador añade versiones al borrador viejo: el nuevo profesional lo lee, no lo continúa. Es la pregunta P-R3.1 al propietario. Este diseño no la decide: deja lo que había.

#### R3.1.c · A-H1, B-H2 y B-H3 · las cotas del sellado, en un disparador hermano

**Pieza**: una función y un disparador nuevos. **No** se redefine `fn_sellar_version_borrador()` (decisión R3.3-D1).

```sql
create function public.fn_cotas_version_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Un carácter que se ve: ni blanco Unicode, ni de control, ni de anchura cero, ni selector.
  -- Escapes \u del motor de expresiones regulares en una cadena normal: ningún carácter crudo.
  v_visible constant text := '[^[:space:]\u0001-\u0020\u007F-\u00A0\u00AD\u034F\u061C\u115F\u1160\u1680\u17B4\u17B5\u180B-\u180F\u2000-\u200F\u2028-\u202F\u205F-\u206F\u2800\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0\U000E0000-\U000E007F\U000E0100-\U000E01EF]';
  v_linea         jsonb;
  v_tipo          numeric;
  v_cantidad      numeric;
  v_cuota_exacta  numeric := 0;  -- céntimos, sin redondear
  v_unidades      numeric := 0;  -- unidades en régimen general
begin
  for v_linea in select e from jsonb_array_elements(new.lineas) as e loop
    if (v_linea ->> 'concepto') !~ v_visible then
      raise exception 'Un concepto invisible no vale: la línea solo lleva blancos o caracteres de anchura cero (T-021)'
        using errcode = '23514';
    end if;
    v_tipo := (v_linea ->> 'tipo_iva_centesimas')::numeric;
    if v_tipo > 10000 then
      raise exception 'El tipo de IVA de una línea es como mucho 10000 centésimas, el cien por cien (T-021, D4)'
        using errcode = '23514';
    end if;
    if (v_linea ->> 'regimen_iva') = 'general' then
      v_cantidad := (v_linea ->> 'cantidad')::numeric;
      v_cuota_exacta := v_cuota_exacta
        + v_cantidad * (v_linea ->> 'precio_unitario_centimos')::numeric * v_tipo / (10000 + v_tipo);
      v_unidades := v_unidades + v_cantidad;
    end if;
  end loop;

  if v_unidades > 0 and abs(new.cuota_iva * 100 - v_cuota_exacta) > v_unidades then
    raise exception 'La cuota de IVA está fuera de la banda que admiten las líneas en régimen general con su tipo (T-021, D4)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.fn_cotas_version_borrador() is '...';
revoke execute on function public.fn_cotas_version_borrador() from public;

create trigger sellar_version_borrador_cotas
  before insert on public.borradores_factura_versiones
  for each row execute function public.fn_cotas_version_borrador();

comment on trigger sellar_version_borrador_cotas on public.borradores_factura_versiones is '...';
comment on function public.fn_sellar_version_borrador() is '...';
```

**El orden de los disparadores es parte del contrato.**
- Postgres dispara los `before` de la misma tabla por orden alfabético del nombre.
- `sellar_version_borrador_cotas` va después de `sellar_version_borrador`, porque el segundo es prefijo del primero.
- Así se garantizan tres cosas:
  1. el paso 0 (permisos) corre antes que cualquier cotejo, como pide `.claude/rules/supabase.md`;
  2. cada línea llega validada: seis claves sin repetir, números enteros y régimen del enum. Los `::numeric` no pueden fallar;
  3. `new.lineas` ya es jsonb-equivalente a las líneas del sobre (`mig:466`). Recorrer `new.lineas` es recorrer lo que se sella.
- J28g lo prueba y M39 lo mata (R3.7).

**La función**
- Es `security invoker`: no lee ninguna tabla.
- Lleva `set search_path = ''` aunque el linter solo lo exija a las definer: así ninguna resolución de nombres depende del llamante.

**Las tres cotas**
1. **Concepto visible (B-H3).**
   - El concepto tiene que contener al menos un carácter fuera de la clase `v_visible`.
   - La clase es explícita y no depende del locale de la base: blancos ASCII y de control, C1, NBSP, guion blando, los espacios y marcas de anchura cero U+2000-200F, U+2028-202F, U+205F-206F, U+3000, los rellenos hangul, el braille en blanco, los selectores de variante, U+FEFF y las etiquetas.
   - El mensaje **no** empieza como el de 6.3 («El concepto de una línea…»). Así el fragmento de J28 y J28b sigue señalando a la comprobación vieja, y el nuevo, «Un concepto invisible», a esta.
   - Con mensajes iguales, M22 sobreviviría (R3.7).
2. **Techo del tipo (B-H2 v7).**
   - `tipo_iva_centesimas <= 10000`. El suelo y el «tipo según régimen» siguen en 6.3.
   - El mensaje no lleva `%`: en un `raise` sería un marcador.
3. **Banda de la cuota (A-H1, B-H2 v4, v5 y v6).**
   - `Q` es la cuota exacta que contienen las líneas generales, porque sus precios llevan el IVA incluido: `Σ cantidad · precio · tipo / (10000 + tipo)`, en céntimos y sin redondear.
   - La cuota sellada tiene que quedar a como mucho `U` céntimos de `Q`, donde `U` es el número de unidades en régimen general.
   - **Esto no repite el redondeo de `lib/dinero`** (la exclusión de la ronda 2 sigue en pie):
     - cualquier convención redondea cada unidad, cada línea o el total a medio céntimo como mucho, y `U ≥ 1` las cubre todas;
     - `desglosarDesdeTotal` (`lib/dinero/iva.ts`) se equivoca en ≤ 0,5 céntimos por llamada.
   - Es una banda de categoría, no un cálculo que compita con el de la aplicación.
   - Sin líneas generales no se comprueba nada aquí: el «todo exento ⇒ cuota 0» de 6.4 ya ha corrido.

**Comentarios que se reescriben**
- El de `fn_sellar_version_borrador()` se reemite **sin redefinir la función**: el texto de `mig:627-631` más una frase: «Las cotas de la ronda 3 (concepto visible, tipo ≤ 10000, banda de la cuota) las pone fn_cotas_version_borrador(), en el disparador sellar_version_borrador_cotas, que corre después de este por orden de nombre.»
- Es el aviso que leerá T-026 si redefine el sellado.

### R3.2 · Banco: fijación y pruebas nuevas (`scripts/rls/26-economico.sql`)

Ids nuevos, con el prefijo del módulo y libres (comprobado):

```
\set CITAPAS2 '\'a0260001-0000-4000-8000-0000000000f6\''
\set BORRREA  '\'a0260001-0000-4000-8000-0000000000b5\''
\set PREA     '\'a0260001-0000-4000-8000-000000000203\''
```

**Fijación**: como `postgres`, tras el `insert` de CITAPAS (línea ~197).
- **CITAPAS2**: P1, PRO1, CA, de `(current_date - 39) + 07:05` a `07:55`, Europe/Madrid, programada y **sin bono**.
  - Si choca con `citas_sin_solape_profesional` (23P01), se usa −40 o −41, y la elección queda escrita en el comentario.
- **PREA**: paciente `('Rea', 'T021 Reasignación', :PRO1, :CA)`, con la forma de las líneas 175-177.
- **BORRREA**: cabecera `(:BORRREA, :PREA, :PRO1, :PRO1)`.
- **La v1 de BORRREA**: sellada con `assert_no_lanza(pg_temp.sql_version(...))`.
  - Sobre `pg_temp.sobre_borrador(:BORRREA, :PRO1, timestamptz '2026-10-01 10:00:00+00', <una línea exenta de 60 €>, 60.00, 0.00, 60.00, 'Rea', :CA)`.
  - Etiqueta `26.fij · la v1 de BORRREA se sella`.

Todas las negativas usan `assert_lanza_codigo_msg` con código y fragmento exactos. Cada una tiene su gemela positiva sobre la misma fila o el mismo sobre.

#### Bloque K, tras K17 (B-H1)

| Id | Quién | Qué | Espera | Hoy (ronda 2) |
|---|---|---|---|---|
| K19a | ADM | `update citas set bono_id = BONO2 where id = CITAPAS2` (bono de P2) | 23514 `el bono es de otro paciente` | **falla primero**: da 42501 |
| K19.0 | ADM | `contar_dml(update citas set estado = 'realizada' where id = CITAPAS2) = 1`, y después `\gset` del consumo de BONO3 (`consumidas_bono3`) | pasa | pasa |
| K19 | ADM | `contar_dml(update citas set bono_id = BONO3 where id = CITAPAS2) = 1` | 1 | **falla primero**: 42501 |
| K19b | — | el consumo de BONO3 es `consumidas_bono3 + 1`, y `citas.bono_id` de CITAPAS2 es BONO3 | pasa | falla |
| K20 | ADM | CITAPAS2: BONO3 → BONO1 | 42501 `realizada o pasada ya no se cambia de bono` | pasa |
| K21 | ADM | CITAPAS2: BONO3 → null | 42501, mismo fragmento | pasa |
| K22 | postgres | CITAPAS2: BONO3 → BONO1 | 42501, mismo fragmento | pasa |
| K23 | — | el consumo de BONO3 sigue en `consumidas_bono3 + 1` | pasa | — |

- K19.0 marca la cita realizada para que el consumo se vea en `bonos_consumo`. No es objeto de prueba.
  - Si una guarda de otro ticket impide al administrador marcarla, se marca como `postgres`, y se escribe en el comentario.
- Gemelas:
  - K19 es la gemela positiva de K20, K21 y K22 sobre la misma fila;
  - K16 y K16b ya cubren la cita futura.
- **K14, K15 y K17 no cambian.** Sus citas ya tenían bono, así que la condición nueva no las afecta.

#### Bloque J, junto a J28b (B-H3)

- Negativas como `postgres` sobre BORR1 con `:T0`, en la forma de J28b.
- Positivas sobre BORR3 con centro `null`, como J42g. Ninguna prueba posterior cuenta las versiones de BORR3.
- Todo carácter invisible va como `E'\uXXXX'` en el banco. **Nunca crudo.**

| Id | Concepto | Espera |
|---|---|---|
| J28c.0 | `E'\u200B'` | control: el `concepto` del sobre es `E'\u200B'` y `octet_length` = 3 |
| J28c | `E'\u200B'` | 23514 `Un concepto invisible`. **Falla primero**: hoy sella |
| J28d.0 / J28d | `E'\uFEFF\u2060'` | control (`octet_length` = 6) / 23514 `Un concepto invisible` |
| J28e.0 / J28e | `E'\u3000\u00A0'` | control (`octet_length` = 5) / 23514 `Un concepto invisible` |
| J28f | `E'Sesi\u00F3n\u200B de psicoterapia'` sobre BORR3 | se sella: lo visible manda, el invisible entre medias no estorba |
| J28g | `E'\u200B'`, como **TEC1** sobre BORRTEC con sobre coherente (forma de M7, `now()` y `creada_por` = TEC1) | 42501 `No puedes añadir una versión a este borrador`: los permisos van antes que la cota |

#### Bloque J, tras J42g (A-H1, B-H2)

Líneas con la forma `linea_borrador(concepto, cantidad, precio, regimen, tipo)`. Importes en euros (base / cuota / total).

| Id | Líneas | Base / cuota / total | Q (cént.) | U | Espera |
|---|---|---|---|---|---|
| **J42 (reescrita)** | exenta 1 × −10000; general 1 × 10000 al 2100 | −17,36 / 17,36 / 0,00 | 1735,54 | 1 | 23514 `borradores_factura_versiones_signo_ck`. La banda pasa (0,46 ≤ 1) y para el signo |
| J43 (B v4) | exenta 1 × 10000; general 1 × 100 al 2100 | 51,00 / 50,00 / 101,00 | 17,36 | 1 | 23514 `fuera de la banda`. **Falla primero** |
| J43g | ídem | 100,83 / 0,17 / 101,00 | 17,36 | 1 | se sella (BORR3) |
| J44 (A esc. 1, B v5) | general 1 × 10000 al 2100 | 0,00 / 100,00 / 100,00 | 1735,54 | 1 | `fuera de la banda`. **Falla primero**. Gemela: B2 y J47g |
| J45 (B v6) | exenta 1 × 6000; general 1 × 10000 al 2100; general 1 × −10000 al 2100 | 50,00 / 10,00 / 60,00 | 0 | 2 | `fuera de la banda`. **Falla primero** |
| J45g | ídem | 60,00 / 0,00 / 60,00 | 0 | 2 | se sella (BORR3) |
| J46 (B v7) | general 1 × 10000 al **999900** | 82,64 / 17,36 / 100,00 | — | — | 23514 `como mucho 10000 centésimas`. **Falla primero** |
| J46g | general 1 × 10000 al **10000** | 50,00 / 50,00 / 100,00 | 5000 | 1 | se sella: el límite exacto entra |
| J47 | general 1 × 10000 al 2100 | 82,63 / 17,37 / 100,00 | 1735,54 | 1 | `fuera de la banda` (1,46 > 1) |
| J47g | ídem | 82,64 / 17,36 / 100,00 | 1735,54 | 1 | se sella (0,46) |
| J47b | ídem | 82,66 / 17,34 / 100,00 | 1735,54 | 1 | `fuera de la banda` (1,54 > 1): mitad inferior |
| J47c | ídem | 82,65 / 17,35 / 100,00 | 1735,54 | 1 | se sella (0,54) |
| J47d | general **2** × 6050 al 2100 | 100,00 / 21,00 / 121,00 | 2100 | 2 | se sella: la cantidad cuenta en `Q` |
| J48 | exenta 1 × 20000; general 1 × −10000 al 2100 | 82,64 / 17,36 / 100,00 | −1735,54 | 1 | `fuera de la banda`: cuota de signo contrario a la parte general. `signo_ck` no lo para |

- **J42 cambia de sobre, no de intención.** Sigue siendo la única prueba que muere si se quita `signo_ck` (M21).
  - Con la banda, todo sobre que la pase lleva la cuota correcta. Por eso la única forma de llegar a `signo_ck` es un documento mixto: exento negativo y general positivo con total 0.
  - Ver R3.6-3.
- **Las demás siguen como están**:
  - J27b y J27c (tipo según régimen, 6.3);
  - J31b (general con cuota 0): 6.4 corre antes que la banda y conserva su fragmento.

#### Bloque O nuevo, al final del módulo (A-H2)

| Id | Quién | Qué | Espera |
|---|---|---|---|
| O0 | postgres | PREA tiene `profesional_id = PRO1`, y BORRREA tiene 1 versión | control |
| O1 | PRO1 | cuenta la cabecera, las versiones y el estado de BORRREA | 1 / 1 / 1 (gemela de O3) |
| O1b | PRO2 | lo mismo | 0 / 0 / 0 (gemela de O4) |
| O2 | ADM | `contar_dml(update public.pacientes set profesional_id = PRO2 where id = PREA) = 1` | 1 |
| O3 | PRO1 | lo mismo que O1 | 0 / 0 / 0. **Falla primero**: hoy 1 / 1 / 1 |
| O4 | PRO2 | lo mismo que O1 | 1 / 1 / 1. **Falla primero**: hoy 0 / 0 / 0 |
| O5 | ADM | lo mismo que O1 | 1 / 1 / 1 |
| O6 | PRO2 | añade una versión a BORRREA con sobre coherente (`now()`, `creada_por` = PRO2) | 42501 `No puedes añadir una versión a este borrador`. Documenta R3.1.b; depende de P-R3.1 |
| O6g | ADM | la misma versión, con `creada_por` = ADM | se sella |
| O7 | TEC1 | cuenta la cabecera BORRTEC (PTEC, cuyo titular es TEC1) | 0. Gemela: ADM cuenta 1 |
| O8 | ADM | revierte: `contar_dml(update … set profesional_id = PRO1 where id = PREA) = 1` | 1 |
| O8b | PRO1 | cuenta la cabecera de BORRREA | 1: la política sigue a la asignación en los dos sentidos |

- La reasignación se hace como ADM, porque `fn_proteger_columnas_reservadas_paciente()` no exime a `postgres`. Precedente en `12-resto-de-tablas.sql:79-98`.
- **G1-G7 siguen valiendo sin tocarse.** P2 es de PRO2, y PROBAJA está inactivo, así que `es_profesional_asignado` da falso.

**Catálogo** (bloque L, una aserción nueva, L10r3):
- existe `sellar_version_borrador_cotas`: `before insert`, `for each row`, habilitado (`tgenabled = 'O'`), sobre `borradores_factura_versiones`;
- su nombre ordena después de `sellar_version_borrador` (`collate "C"`);
- `fn_cotas_version_borrador` no es `prosecdef` y tiene `search_path` en `proconfig`;
- `pg_get_expr(polqual, polrelid)` de `borradores_factura_lectura` contiene `es_profesional_asignado` y no contiene `auth.uid`.

**README** (`scripts/rls/README.md`, fila 26): añadir «Ronda 3:
- bono de la cita terminada, una vez (K19-K23);
- banda de la cuota, techo del tipo y concepto invisible (J28c-g, J42-J48);
- lectura por asignación (O).»

### R3.3 · Decisiones y alternativas descartadas

- **D1 · Las cotas van en un disparador hermano, no en una copia de `fn_sellar_version_borrador()`.**
  - Una copia de 340 líneas con tres cambios es el sitio exacto donde se cuela una deriva.
  - Además, T-026 tendría que encontrar la redefinición buena entre dos migraciones (`.claude/rules/supabase.md`: se buscan todas las redefiniciones).
  - El disparador hermano añade y no reescribe.
  - Descartado: `create or replace` con copia íntegra y prueba de `diff`.
- **D2 · Banda de dos lados (`|cuota·100 − Q| ≤ U`), no solo techo.**
  - Cuesta lo mismo: una condición.
  - Cierra además dos casos que el techo deja pasar:
    - la cuota de signo contrario a la parte general (J48);
    - la cuota de 1 céntimo sobre 100 € al 21 %.
  - Descartados:
    - el techo `cuota·100 ≤ suma_general` que proponen A y B: no para la cuota llena con base 0 (A esc. 1 y B v5, que la decisión del propietario nombra) porque la iguala en vez de superarla;
    - `abs(cuota) ≤ abs(Q) + U`: deja pasar J48.
- **D3 · La tolerancia es U (unidades generales), no un céntimo fijo.** Cubre el redondeo por unidad de cualquier convención sin repetir la de `lib/dinero`. Un céntimo fijo rechazaría documentos legítimos con cantidad > 2 redondeados por unidad.
- **D4 · Techo del tipo en 10000 (100 %).** Es la cota de categoría más simple que hace finita la banda.
  - Ningún tipo español pasa del 21 %, pero fijar 2100 sería decidir tipos, y eso es de T-026 y del programa.
  - El propietario puede bajarlo (P-R3.2).
- **D5 · Concepto: clase explícita de invisibles, no `[[:space:]]` ni un recorte previo.**
  - `[[:space:]]` depende del locale para lo que no es ASCII.
  - El `regexp_replace` que propone B y luego comprobar el vacío es equivalente, pero más largo.
  - Mensaje distinto del de 6.3 para que los fragmentos no se pisen.
- **D6 · B-H1 con `old.bono_id is not null`**, el patrón de `episodio_id` (T-039). Descartado mirar `new`: dejaría quitar el bono.
- **D7 · A-H2 con `alter policy`** y `es_profesional_asignado(paciente_id)` en lugar de `profesional_id = auth.uid()`.
  - Descartado el AND de las dos condiciones: el nuevo profesional no leería, en contra de la decisión.
  - Descartado `drop` + `create`: deja un hueco y obliga a tocar `11`.
- **D8 · Migración nueva, no editar la 20261011120000.**
  - Aunque el linter lo permitiría (no está en main), la orden de la ronda es solo añadir.
  - La base local ya la tiene aplicada.
  - Coste: una línea más en el `territorio:` del contrato (R3.8).

### R3.4 · Cómo se cierra cada criterio

Los criterios del contrato no cambian. Lo que la ronda 3 toca de cada uno:

| Criterio | Cierre en la ronda 3 |
|---|---|
| 1 · `db reset` aplica | `npx supabase db reset` aplica las dos migraciones sin error. En CI, `migration up` también, porque la nueva es posterior a la de main |
| 2 · `update`/`delete`/`truncate` fallan | Sin cambios: el módulo 10 y el bloque A siguen verdes. La migración nueva no añade tablas |
| 3 · cadena de tres versiones | Sin cambios, B1-B9b verdes. El disparador nuevo no toca `huella` ni el sobre |
| 4 · cobro sin factura | Sin cambios |
| 5 · consumo 3 / 2 | D3-D4 verdes. K19 y K19b prueban que la primera asignación en cita realizada suma uno, y K23 que no se reescribe |
| 6 · bonos por rol | Sin cambios |
| 7 · técnico: cobros sí; tarifas, versiones y estado no | F verde. O7 añade que el técnico titular de un paciente no lee su cabecera |
| 8 · profesional: cero borradores de otro, uno propio | G1-G7 verdes. Con la decisión A-H2, «de otro profesional» se lee como del paciente que no tiene asignado: O1-O8b |
| 9 · auditoría al insertar | Sin cambios, H verde: el disparador nuevo no inserta |
| 10 · `test:rls`, `lint`, `build` | `npm run test:rls` con todas las aserciones de 26 en verde (menos las fallas conocidas de 16 y 23, idénticas en main; state.md), más `npm run lint` y `npm run build` |
| 11 · linter de migraciones | `npm run lint:migraciones` sin avisos sobre la 20261011130000: nombre creciente, sin `update`/`delete`/`truncate` sobre tablas de solo adición, ninguna función definer nueva |
| 12 · greps de facturación | Las tres órdenes de R2.3, **sobre las dos migraciones**. Sobre la nueva: (1) da 0; (2) da 0; (3) no devuelve ninguna línea |
| 13 · `espejo`/`proveedor` fuera de comentarios | 0 en la nueva |
| Tipos | `npx supabase db reset && npm run tipos`, y después `git diff --exit-code lib/supabase/tipos-bd.ts`: vacío |

Evidencias de la ronda 3, para `evidencia.json`:
- la lista de pruebas que fallaban antes de la migración nueva, con su salida: K19a, K19, J28c, J43, J44, J45, J46, O3, O4;
- y la misma lista en verde después.

Procedimiento:
1. Escribir primero las pruebas y correr el banco **sin** la migración nueva.
2. Correrlo de nuevo con ella.

### R3.5 · Qué revisar (revisores A y B, y autoevaluación)

**B-H1**
1. La condición nueva mira `old.bono_id`, no `new.bono_id`.
   - ¿Hay alguna forma de pasar de X a nulo y de nulo a Y en dos sentencias? No, si la primera falla: K21.
   - ¿Y con `postgres`? K22.
2. **Concurrencia.** Dos `update` simultáneos de nulo a X y de nulo a Y sobre la misma cita:
   - el segundo espera el cerrojo de fila;
   - en READ COMMITTED vuelve a evaluar con la fila nueva, y el `before` ve `old.bono_id = X`, así que lanza 42501.
   - Sin prueba de dos conexiones (B-H9, aceptado); se revisa leyendo.
3. **La comprobación del paciente sigue aplicándose a la primera asignación**: K19a, con 23514 y no 42501.
4. **Otras puertas al `bono_id` de una cita pasada**:
   - un `insert` con bono de una cita ya pasada: era así en la ronda 2 y no cambia;
   - cambiar `paciente_id`: lo bloquean `fn_proteger_cita_pasada` y K2;
   - cancelar una realizada: hallazgo de la ronda 2 en `state.md`.

**A-H2**

5. La política nueva no menciona `profesional_id`. Los revisores comprueban que ninguna otra política de lectura de las tablas de T-021 siga el patrón viejo:
   ```
   grep -n "profesional_id = (select auth.uid())" supabase/migrations/20261011*.sql
   ```
   Fuera de la `borradores_factura_lectura` original, que el `alter policy` sustituye, solo deben salir las altas (`borradores_factura_alta`, `borradores_factura_versiones_alta`) y el paso 0.
6. **Fusiones**: `es_profesional_asignado` incluye al profesional del superviviente. Es coherente con citas y cobros, no es un hueco.
7. **TEC1 titular de PTEC**: `es_profesional_asignado(PTEC)` da verdadero para TEC1, así que el rol en positivo es lo único que lo para (O7, M36).
8. **Escribir no se ha abierto**: O6 sigue en 42501 para el nuevo profesional.

**Cotas**

9. **El orden de disparadores**:
   - J28g da 42501 y no 23514;
   - la aserción de catálogo comprueba el nombre;
   - renombrar el disparador a algo que ordene antes mata J28g.
10. **La banda es de dos lados y con signo**:
    - J47b (mitad inferior) y J48 (signo contrario) tienen que estar;
    - con `abs(cuota)` frente a `abs(Q)`, J48 pasaría.
11. **Los límites exactos**:
    - J46g (tipo 10000) entra y J46 (999900) no;
    - J47g y J47c (0,46 y 0,54) entran, y J47 y J47b (1,46 y 1,54) no;
    - con tolerancia 0 o 2U, alguna se pone roja (M43, M44).
12. **Nulos**: `new.lineas` no puede ser nula (`not null` y `lineas_ck`), y el sellado ya ha exigido que cada clave sea del tipo correcto. ¿Algún `::numeric` puede recibir texto? Solo si el disparador corriera antes del sellado (punto 9).
13. **Sin caracteres crudos**: `grep -nP '[\x{00A0}\x{200B}-\x{200F}\x{2060}\x{3000}\x{FEFF}]'` sobre la migración nueva y sobre `26-economico.sql` no devuelve nada.
14. **Fragmentos únicos**:
    - `Un concepto invisible`, `como mucho 10000 centésimas` y `fuera de la banda` no son prefijo de otro mensaje ni lo contienen;
    - J28 y J28b siguen con `El concepto de una línea`.
15. **`signo_ck` sigue viva**: M21 muere en la J42 reescrita.

**Comunes**

16. Ningún `comment on` ni comentario de la migración nueva contiene `serie`, `numeracion`, `qr`, `verifactu`, `registro_facturacion`, `espejo` ni `proveedor` (R2.3).
17. **Solo añadir**: `git diff main -- supabase/migrations/20261011120000_economico_esquema.sql` es idéntico al de la ronda 2 (HEAD a982e0a). La ronda 3 no lo toca.

### R3.6 · Riesgos, por probabilidad

1. **Media · CITAPAS2 choca con una cita de PRO1 de otro módulo** (23P01).
   - Mitigación: cambiar el día (−40, −41) y escribirlo en el comentario.
   - Las fallas conocidas de 16 y 23 (`state.md`) no son esta.
2. **Media · el implementador redefine `fn_sellar_version_borrador()` «para tenerlo todo junto»**, contra D1.
   - El revisor lo ve en `grep -c "fn_sellar_version_borrador" supabase/migrations/20261011130000_*.sql`: solo puede aparecer en el `comment on function` y en el comentario de la cabecera.
3. **Baja · documentos de signo mixto.**
   - Con la banda, `signo_ck` solo rechaza documentos cuya cuota es la correcta: un exento negativo junto a un general positivo. J42 lo fija como comportamiento.
   - Si un día hiciera falta sellar un abono parcial mixto, lo decide T-026. Se anota en `state.md`.
4. **Baja · la banda deja hasta U céntimos de holgura.** Sobre una parte general neta 0 (J45) admite una cuota de ±U céntimos. Es residual y se acepta: es el precio de no repetir el redondeo.
5. **Baja · `[[:space:]]` y el locale**: la clase es explícita, así que el resultado no depende del locale. J28e usa U+3000 para comprobarlo.
6. **Baja · O6 cambia si el propietario responde distinto a P-R3.1.** Entonces O6 pasa a ser positiva en otro ticket; este no abre la escritura.

### R3.7 · `mutantes.json` de la ronda 3

| Id | Mutación | Muere en |
|---|---|---|
| M31 | quitar `old.bono_id is not null` | K19a (cambia el código), K19 |
| M32 | `old.bono_id is not null` → `new.bono_id is not null` | K21 |
| M33 | congelar solo para `authenticated` (envolver en `current_setting('role', true) = 'authenticated'`) | K22 |
| M34 | volver a la política de la ronda 2 | O3, O4 |
| M35 | AND de `profesional_id = auth.uid()` y `es_profesional_asignado` | O4 |
| M36 | quitar el rol de la rama del profesional | O7 |
| M37 | quitar la comprobación del concepto invisible | J28c, J28d, J28e |
| M38 | quitar `\uFEFF` de la clase | J28d |
| M39 | renombrar el disparador a `aa_cotas_version_borrador` (corre antes del sellado) | J28g (23514 en vez de 42501) y la aserción de catálogo |
| M40 | quitar el techo del tipo | J46 |
| M41 | `> 10000` → `>= 10000` | J46g |
| M42 | quitar la banda | J43, J44, J45, J47, J47b, J48 |
| M43 | banda sin tolerancia (`> 0`) | J47g, J47c, J43g |
| M44 | tolerancia `2 * v_unidades` | J47, J47b |
| M45 | solo techo con signo (`new.cuota_iva * 100 - v_cuota_exacta > v_unidades`) | J47b |
| M46 | `abs(new.cuota_iva * 100) > abs(v_cuota_exacta) + v_unidades` (techo en valor absoluto) | J48 |
| M47 | `Q` sin la cantidad (`precio · tipo / (10000 + tipo)`) | J47d |

Los de la ronda 2 que la ronda 3 podría tapar se vuelven a correr y deben seguir muertos:
- **M21** (quitar `signo_ck`) muere en la J42 reescrita.
- **M22** (6.3 con `length(trim(…)) = 0`) muere en J28b: el tabulador y el salto de línea los caza la cota nueva, pero con el fragmento `Un concepto invisible`, que no es el que espera J28b.
- **M25** (quitar «general ⇒ cuota ≠ 0») muere en J31b por el mismo motivo: la banda la caza con otro fragmento.
- **M7 y M8** (congelación) siguen muriendo en K14, K15 y K17.

La ronda 3 no deja supervivientes nuevos.

### R3.8 · Territorio y delegable

- **El territorio necesita una línea más en el contrato**: `supabase/migrations/20261011130000_economico_ronda_3.sql`. Sin ella, `territorio.mjs T-021` marca la migración. Este diseño no edita el contrato: lo añade el usuario o el arquitecto antes de implementar (P-R3.3).
- El resto ya está en el `territorio:`:
  - `scripts/rls/26-economico.sql` y `README.md`;
  - `tickets/T-021/**`;
  - la bitácora y `state.md`.
- **No se tocan**:
  - `11-cobertura` (mismos nombres de política);
  - `01-fijacion` y `00-ayudantes` (la fijación nueva es local a 26);
  - el linter;
  - `tipos-bd.ts` (se regenera y sale idéntico).
- **Delegable**: nada. Todo es RLS, disparadores, dinero y el banco que los prueba.

### R3.9 · Memoria al cerrar

- **Bitácora** (`docs/bitacora/T-021*.md`): la ronda 3, citando las decisiones del 05-10. Tres reglas que deja:
  1. «Las cotas del sellado viven en dos disparadores; el orden es por nombre.»
  2. «Una banda con tolerancia U no es repetir el redondeo.»
  3. «Mensajes de error que no comparten prefijo.»
- **`state.md`**, reescrito:
  - T-021 pasa a verificación de la ronda 3;
  - §Hallazgos, una entrada: «documentos mixtos (exento negativo y general positivo) no se sellan por `signo_ck`; lo decide T-026» (R3.6-3).
- **Para `.claude/rules/supabase.md`**, propuesta al usuario o al arquitecto, no a este ticket: «Un disparador hermano que añade cotas se nombra con el del sellado como prefijo, para correr después del paso 0.»

### Lo que no entra en la ronda 3, y por qué

- **Que el nuevo profesional continúe el borrador del anterior** (alta de versión tras reasignar). La decisión del propietario habla de leer. Abrir la escritura cambia el paso 0 y la política de alta, y depende de P-R3.1.
- **Revisar `signo_ck` para documentos mixtos.** Es una decisión de la ronda 2 que la ronda 3 no reabre (R3.6-3).
- **Prueba de dos conexiones** para la primera asignación del bono. Es la misma familia que B-H9, aceptado en la ronda 2.
- **Bajar el techo del tipo a los tipos españoles vigentes.** Es una decisión de tipos que corresponde a T-026 (D4).
- **Normalizar o limpiar el concepto** (quitar los invisibles en vez de rechazar). La base no reescribe lo que se sella. La limpieza, si se quiere, es de la validación Zod de T-023 y T-026.

### Resumen de la ronda 3

1. Se construye una migración nueva, `20261011130000_economico_ronda_3.sql`. No se edita la 20261011120000.
2. B-H1: la congelación de `citas.bono_id` exige `old.bono_id is not null`. El primer bono de una cita terminada entra una vez; cambiarlo o quitarlo sigue en 42501, también para `postgres`.
3. A-H2: `alter policy borradores_factura_lectura` cambia `profesional_id = auth.uid()` por `es_profesional_asignado(paciente_id)`. Versiones y estado lo heredan.
4. Cotas: un disparador hermano, `sellar_version_borrador_cotas`, que corre después del sellado por orden de nombre, con tres cotas:
   - concepto con al menos un carácter visible (clase explícita de invisibles);
   - tipo ≤ 10000;
   - banda `|cuota·100 − Q| ≤ U`.
5. Decisión clave 1: hermano en vez de copiar 340 líneas del sellado (D1).
6. Decisión clave 2: banda de dos lados con tolerancia de una unidad por unidad general, que no repite el redondeo y cierra la base 0 con cuota llena (D2, D3).
7. Decisión clave 3: la escritura tras reasignar no se abre; solo el administrador continúa el borrador (P-R3.1).
8. Pruebas que fallan primero: K19a, K19, J28c, J43, J44, J45, J46, O3 y O4. J42 se reescribe para seguir matando M21. Mutantes M31-M47, sin supervivientes.
9. Revisar con más cuidado:
   - el orden de los disparadores (J28g, M39);
   - los límites exactos de la banda (J47 a J47c);
   - que O3 y O4 cuenten cabecera, versiones y estado.
10. Antes de implementar, el contrato tiene que añadir la migración nueva a `territorio:` (P-R3.3).

**Preguntas al propietario**
- **P-R3.1** · Tras reasignar al paciente, el nuevo profesional **lee** el borrador del anterior pero no le añade versiones: el borrador sigue a nombre del anterior y solo el administrador lo continúa. ¿Lo confirmas?
- **P-R3.2** · Techo de `tipo_iva_centesimas` en 10000 (100 %). ¿Vale, o prefieres fijarlo ya en 2100 (21 %)?
- **P-R3.3** · Añadir `supabase/migrations/20261011130000_economico_ronda_3.sql` al `territorio:` de `tickets/T-021-economico-esquema.md`.

### Respuestas del propietario (06-10-2026)

- **P-R3.1: sí.** Tras reasignar al paciente, el nuevo profesional lee el borrador del anterior y no le añade versiones. Solo el administrador lo continúa. Por eso O6 y O6g quedan como están en R3.2, y R3.1.b no cambia.
- **P-R3.2: techo en 10000 (100 %).** `tipo_iva_centesimas <= 10000`, como en R3.1.c (D4). J46 y J46g y los mutantes M40 y M41 quedan como están.
- **P-R3.3: hecho.** `supabase/migrations/20261011130000_economico_ronda_3.sql` ya está en el `territorio:` del contrato. Los demás ficheros que escribe la ronda 3 ya estaban listados (R3.8).

## Ronda 4 (06-10-2026)

Entrada:
- revisor A de la ronda 3, `tickets/T-021/revision.md` (repo principal);
- revisor B de la ronda 3, `tickets/T-021/revision-b.ronda3.md` (worktree `agent-a2cc04ba9ba7302c8`, HEAD 58cd9a1).

No hay ningún hallazgo ALTA. Los cuatro se arreglan antes de integrar:

| Hallazgo | Severidad | Qué |
|---|---|---|
| A-H1 = B-H1 | MEDIA | la tolerancia U de la banda la infla quien sella |
| B-H2 | BAJA | D3 sin positiva: los mutantes «> 1» y «U = número de líneas» sobreviven |
| A-H2 / B-H3 | BAJA | faltan invisibles en la clase, seis tramos sin negativa y J28e mal rotulada |
| A-H3 = B-H4 | BAJA | la memoria: `signo_ck` y las tres reglas de R3.9 |

Una sola pieza de producción cambia: `fn_cotas_version_borrador()`.

### R4.0 · Hechos verificados contra el código

**Migración y función**
- **La base local tiene aplicada la ronda 3.**
  - `select max(version) from supabase_migrations.schema_migrations` da `20261011130000` en `supabase_db_Psicogestion`.
  - La migración no está en `main`: `ls supabase/migrations` en el repo principal acaba en `20261010120000_altas_de_centro.sql`.
- **El linter no protege la 20261011130000.** `analizarEdiciones` (`scripts/lint-migraciones.ts:376-400`) solo compara con `main`; con una migración que no está allí, `continue`. Reescribirla no daría error: la decisión de R4.3-D1 no se apoya en el linter.
- **La función de las cotas** está en `20261011130000_economico_ronda_3.sql:78-117`:
  - clase `v_visible` con `[:space:]` y escapes de barra invertida;
  - tolerancia `v_unidades = Σ cantidad` de las líneas generales;
  - la condición `v_unidades > 0 and abs(new.cuota_iva * 100 - v_cuota_exacta) > v_unidades` (`:111`).
- **Los mensajes que el banco busca por fragmento**: `Un concepto invisible`, `como mucho 10000 centésimas` y `fuera de la banda`. No cambian.
- **Lo que el paso 6.3 del sellado (`20261011120000_economico_esquema.sql:512-548`) ya ha validado cuando corren las cotas**:
  - `json_typeof` de `concepto` (string), `cantidad` y `tipo_iva_centesimas` (number);
  - la cantidad, entera y ≥ 1;
  - el precio, entero de cualquier signo, 0 incluido;
  - el tipo: 0 si es exento y > 0 si es general.

  En las cotas no llega ningún nulo.

**Locale y clase de invisibles**
- **La base usa el proveedor ICU**: `datlocprovider = 'i'`, `en_US.UTF-8`, versión 17 (`supabase/config.toml:42`).
- **Bajo ICU, `[[:space:]]` casa 29 puntos de código**: `9-d 1c-20 85 a0 1680 2000-200a 2028 2029 202f 205f 3000`. Los 29 están en los tramos de R4.1, así que quitar `[:space:]` de la clase no cambia nada en esta base.
- **La clase construida con `chr()`** a partir de los 34 pares de R4.1 se comprobó contra la base local, con una consulta de solo lectura en el scratchpad:
  - el complemento casa exactamente **4609** puntos de código (de 1 a 0x10FFFF, sin sustitutos), que es la suma de los tramos;
  - los tramos no se solapan ni se tocan;
  - los rangos entre corchetes del motor de expresiones de Postgres van por punto de código, no por colación.
- **Los 67 vecinos de R4.2** (el punto anterior y el posterior de cada tramo):
  - casan la clase de lo visible: 67 de 67;
  - ninguno es blanco para el 6.3: `!~ '[^[:space:]]'` da 0 de 67.

**El generador**
- **Node 24.14.1 trae Unicode 17.0** (`process.versions.unicode`) y soporta `\p{Default_Ignorable_Code_Point}`, `\p{Cf}`, `\p{White_Space}` y `\p{Cc}`.
- **Postgres 17 no tiene `\p{}`** en sus expresiones, ni acceso SQL a la categoría general; solo `unicode_assigned()`. La lista se genera fuera y se fija como datos.
- **El generador de R4.2 da 29 tramos de referencia.** Con las marcas combinantes genéricas y U+2800, 34. Ejecutado.

**Banco**
- `pg_temp.sv` (`26-economico.sql:134-150`) devuelve el texto SQL del alta de versión con `now()`.
- BORR1 es de PRO1 sobre P1 (`01-fijacion.sql:229`). PRO1 autenticado llega al paso 6 sobre BORR1 (J39 y J40, `26:1018-1024`).
- BORR3 es de PRO1 sobre P1 (`26:212`) y es donde se sellan las positivas de la ronda 3.
- J28e (`26:1074-1076`) lleva U+3164 y U+3000, pero su rótulo dice «espacio ideográfico y espacio duro»: U+3164 es el relleno hangul, no un espacio duro.
- **Las positivas de la banda con líneas generales** son J43g, J45g, J46g, J47g, J47c y J47d (`26:1126-1174`): todas de una sola línea general, salvo J45g.
- **La cabecera del banco 26** (`26:5-30`) llega hasta la sección N; le falta la O, que añadió la ronda 3.

**Aritmética** (`lib/dinero/iva.ts`)
- `desglosarDesdeTotal` redondea la base una vez por llamada, con el redondeo comercial, y deja la cuota por diferencia.
- Error por llamada: `|cuota·100 − Q_llamada| ≤ 0,5`, y además `≤ |Q_llamada|`, porque la cuota redondeada nunca cruza el 0 hacia el otro lado.

**Memoria**
- `docs/state.md` del worktree tiene 77 líneas, con 80 de límite.
- Su línea 13 reserva `20261012120000` para T-043. `20261011140000` está libre.

### R4.1 · La migración nueva: `supabase/migrations/20261011140000_economico_ronda_4.sql`

Tres sentencias, y nada más:

1. **`create or replace function public.fn_cotas_version_borrador()`** con el cuerpo completo de abajo:
   - `returns trigger`, `language plpgsql`, `set search_path = ''`;
   - sin `security definer`.
2. **`revoke execute on function public.fn_cotas_version_borrador() from public;`**
   - `create or replace` conserva los privilegios, pero se repite para que el fichero se lea solo.
3. **`comment on function public.fn_cotas_version_borrador() is …`**: el texto nuevo, más abajo.

**No se tocan:**
- el disparador `sellar_version_borrador_cotas` (el mismo nombre, el mismo orden);
- `fn_sellar_version_borrador()`: su comentario dice «banda de la cuota» sin fórmula y sigue siendo cierto;
- las políticas;
- el esquema;
- `fn_bono_de_la_cita()`.

**El cuerpo**, que el implementador copia. No tiene ninguna barra invertida:

```sql
create or replace function public.fn_cotas_version_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Puntos de código que no se ven (T-021, ronda 4). Tramos generados con Node 24.14.1
  -- (Unicode 17.0): Default_Ignorable_Code_Point, Cf, White_Space y Cc, más las marcas
  -- combinantes genéricas (0300-036F, 1AB0-1AFF, 1DC0-1DFF, 20D0-20FF, FE20-FE2F) y U+2800.
  -- Enteros hexadecimales y chr(): el fichero no lleva ninguna barra invertida.
  -- tramos:inicio
  v_tramos constant integer[] := array[
    [0x0001, 0x0020],
    [0x007F, 0x00A0],
    [0x00AD, 0x00AD],
    [0x0300, 0x036F],
    [0x0600, 0x0605],
    [0x061C, 0x061C],
    [0x06DD, 0x06DD],
    [0x070F, 0x070F],
    [0x0890, 0x0891],
    [0x08E2, 0x08E2],
    [0x115F, 0x1160],
    [0x1680, 0x1680],
    [0x17B4, 0x17B5],
    [0x180B, 0x180F],
    [0x1AB0, 0x1AFF],
    [0x1DC0, 0x1DFF],
    [0x2000, 0x200F],
    [0x2028, 0x202F],
    [0x205F, 0x206F],
    [0x20D0, 0x20FF],
    [0x2800, 0x2800],
    [0x3000, 0x3000],
    [0x3164, 0x3164],
    [0xFE00, 0xFE0F],
    [0xFE20, 0xFE2F],
    [0xFEFF, 0xFEFF],
    [0xFFA0, 0xFFA0],
    [0xFFF0, 0xFFFB],
    [0x110BD, 0x110BD],
    [0x110CD, 0x110CD],
    [0x13430, 0x1343F],
    [0x1BCA0, 0x1BCA3],
    [0x1D173, 0x1D17A],
    [0xE0000, 0xE0FFF]
  ];
  -- tramos:fin
  v_visible      text := '[^';
  v_linea        jsonb;
  v_tipo         numeric;
  v_q            numeric;            -- cuota exacta de una línea general, en céntimos
  v_cuota_exacta numeric := 0;       -- Q: suma de v_q
  v_holgura      numeric := 0;       -- T: suma de least(1, |v_q|)
  v_hay_general  boolean := false;
begin
  for i in 1 .. array_length(v_tramos, 1) loop
    if v_tramos[i][1] = v_tramos[i][2] then
      v_visible := v_visible || chr(v_tramos[i][1]);
    else
      v_visible := v_visible || chr(v_tramos[i][1]) || '-' || chr(v_tramos[i][2]);
    end if;
  end loop;
  v_visible := v_visible || ']';

  for v_linea in select e from jsonb_array_elements(new.lineas) as e loop
    if (v_linea ->> 'concepto') !~ v_visible then
      raise exception 'Un concepto invisible no vale: la línea solo lleva blancos o caracteres de anchura cero (T-021)'
        using errcode = '23514';
    end if;
    v_tipo := (v_linea ->> 'tipo_iva_centesimas')::numeric;
    if v_tipo > 10000 then
      raise exception 'El tipo de IVA de una línea es como mucho 10000 centésimas, el cien por cien (T-021, D4)'
        using errcode = '23514';
    end if;
    if (v_linea ->> 'regimen_iva') = 'general' then
      v_q := (v_linea ->> 'cantidad')::numeric
           * (v_linea ->> 'precio_unitario_centimos')::numeric * v_tipo / (10000 + v_tipo);
      v_cuota_exacta := v_cuota_exacta + v_q;
      v_holgura      := v_holgura + least(1, abs(v_q));
      v_hay_general  := true;
    end if;
  end loop;

  if v_hay_general and abs(new.cuota_iva * 100 - v_cuota_exacta) > v_holgura then
    raise exception 'La cuota de IVA está fuera de la banda que admiten las líneas en régimen general con su tipo (T-021, D4)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
```

**Por qué la clase se construye así:**
- **Sin `[:space:]`.** Su contenido depende del proveedor de locale; la lista explícita lo cubre entero (R4.0).
- **Sin ningún extremo de tramo** que sea `]`, `^`, `-` o la barra invertida: todos son controles o símbolos que no se ven, así que nada se escapa.
- **Los dos mensajes de error y su código son idénticos a los de la ronda 3.** El de la banda no cambia de texto: la banda es la misma, cambia la tolerancia.

**El comentario nuevo**, en una sola cadena partida en líneas como en la ronda 3:

> Disparador before insert sobre borradores_factura_versiones, hermano de fn_sellar_version_borrador (T-021, rondas 3 y 4). Corre después de él por orden de nombre, así que cada línea ya llega validada. Tres cotas, todas 23514:
> - concepto con al menos un punto de código fuera de la lista fija de invisibles (generada de Unicode 17.0: Default_Ignorable_Code_Point, Cf, White_Space, Cc, marcas combinantes genéricas y U+2800);
> - tipo de IVA como mucho 10000 centésimas;
> - si hay alguna línea en régimen general, la cuota sellada a como mucho T céntimos de la cuota exacta Q de esas líneas, con T igual a la suma por línea general de least(1, |cuota exacta de la línea|).
>
> security invoker: no lee ninguna tabla. Redefine la de 20261011130000.

### R4.2 · Banco: pruebas nuevas y cambiadas (`scripts/rls/26-economico.sql`)

**Reglas comunes**
- **Ningún carácter invisible se escribe como escape de barra invertida en el código nuevo.**
  - Se escribe `chr(0x2060)`, o `string_agg(chr(c), '')` sobre un `generate_series` con enteros hexadecimales.
  - Así la trampa de R3 (las herramientas de edición decodifican la secuencia de escape y dejan el carácter crudo) no tiene dónde caer.
  - Las líneas de J28c-J28f que ya llevan escapes no se reescriben. El único cambio en ellas es el rótulo de J28e (abajo), y se edita apuntando solo al texto del rótulo.
- **Dónde y cómo corre cada tipo de prueba:**
  - Negativas: como `postgres` sobre BORR1, en el mismo contexto que J28c-J28e, con `pg_temp.sv(:BORR1, …, :PRO1, 'Ana Uno', :CA)`.
  - Positivas: sobre BORR3, como J28f y J47g.
  - La banda: J49-J53 van justo después de J48, con el mismo patrón que J43-J48 (sin centro).
  - Fragmentos: `Un concepto invisible` para la clase y `fuera de la banda` para la banda.

#### Bloque de la clase (después de J28g)

**Comentario de cabecera del bloque**:
- de dónde sale la lista: «el generador de R4.2 de `tickets/T-021/diseno.md`», con su versión de Node y de Unicode;
- la nota de que los 34 pares del array son su salida.

El comentario no copia el comando: lleva barras invertidas, y una herramienta de edición podría estropearlas. El comando entra literal en la evidencia, ejecutado por Bash.

El generador (`tramos` imprime los pares; cualquier otro argumento, los vecinos):

```
node -e 'const re=/^[\p{Default_Ignorable_Code_Point}\p{Cf}\p{White_Space}\p{Cc}]$/u; const ex=[[0x300,0x36F],[0x1AB0,0x1AFF],[0x1DC0,0x1DFF],[0x20D0,0x20FF],[0x2800,0x2800],[0xFE20,0xFE2F]]; const h=x=>"0x"+x.toString(16).toUpperCase().padStart(4,"0"); const en=c=>c<=0x10FFFF&&(c<0xD800||c>0xDFFF)&&(re.test(String.fromCodePoint(c))||ex.some(([a,b])=>c>=a&&c<=b)); const t=[]; let s=-1; for(let c=1;c<=0x110000;c++){const ok=en(c); if(ok&&s<0)s=c; if(!ok&&s>=0){t.push([s,c-1]); s=-1;}} const modo=process.argv[1]; if(modo==="tramos") t.forEach(([a,b])=>console.log("["+h(a)+", "+h(b)+"]")); else t.flatMap(([a,b])=>a>1?[a-1,b+1]:[b+1]).forEach(v=>console.log(h(v)));' tramos
```

- Con `ex = []`, da los 29 tramos de referencia.
- Con `ex`, da los 34 de la migración: `0300-036F` absorbe `034F`, y entran `1AB0-1AFF`, `1DC0-1DFF`, `20D0-20FF`, `2800` y `FE20-FE2F`.

**J28h · un tramo, una negativa (34 aserciones)**
- **Concepto**: un prefijo seguido de todos los puntos de código del tramo, en orden.
  - El prefijo es U+2060 (unión de palabras).
  - Para el tramo `205F-206F`, que contiene U+2060, el prefijo es U+200B.
- **Por qué el prefijo.**
  - Sin él, los tramos que son todo blanco (`1680`, `3000`, `2028-202F`…) los pararía antes el 6.3 con su fragmento, «El concepto de una línea», y la prueba no llegaría a la clase.
  - El prefijo no es `[:space:]` en ninguna base, porque es Cf y no White_Space.
  - Así, el 6.3 deja pasar el concepto y lo rechaza la clase.
- **Forma.** Una sentencia sobre los 34 pares, delimitados por `-- tramos:inicio` y `-- tramos:fin` como en la migración:

  ```sql
  select pg_temp.assert_lanza_codigo_msg(
    pg_temp.sv(:BORR1, jsonb_build_array(pg_temp.linea_borrador(
      chr(<prefijo>) || (select string_agg(chr(c), '' order by c) from generate_series(a, b) c), 1, 6000)),
      60.00, 0.00, 60.00, :PRO1, 'Ana Uno', :CA),
    '23514', 'Un concepto invisible',
    format('26.J28h · tramo %s-%s', upper(to_hex(a)), upper(to_hex(b))))
  from <los 34 pares> as t(a, b);
  ```

  - Las filas corren en orden.
  - La primera que falla corta el banco (`ON_ERROR_STOP`), con el tramo en el rótulo.
- **Fallan antes de la migración nueva** los 17 tramos con puntos que la ronda 3 no tenía:

  `0300-036F, 0600-0605, 06DD, 070F, 0890-0891, 08E2, 1AB0-1AFF, 1DC0-1DFF, 20D0-20FF, FE20-FE2F, FFF0-FFFB, 110BD, 110CD, 13430-1343F, 1BCA0-1BCA3, 1D173-1D17A, E0000-E0FFF`

- **Los otros 17 pasan ya con la ronda 3.** Son las negativas que faltaban por tramo, entre ellas las seis de B-H3: `E0000-E007F`, `00AD`, `FE00-FE0F`, `2028-202F` y `3000`, que ahora van dentro de sus tramos, y `0001-0020`.

**J28i · los 67 vecinos se sellan (67 aserciones)**
- **Concepto**: un solo carácter, `chr(v)`.
- **La línea**: exenta 1 × 6000, sellada en BORR3 con `assert_no_lanza` y rótulo `format('26.J28i · U+%s', upper(to_hex(v)))`.
- **Los vecinos**: la salida del generador sin el argumento `tramos`.

  `0021 007E 00A1 00AC 00AE 02FF 0370 05FF 0606 061B 061D 06DC 06DE 070E 0710 088F 0892 08E1 08E3 115E 1161 167F 1681 17B3 17B6 180A 1810 1AAF 1B00 1DBF 1E00 1FFF 2010 2027 2030 205E 2070 20CF 2100 27FF 2801 2FFF 3001 3163 3165 FDFF FE10 FE1F FE30 FEFE FF00 FF9F FFA1 FFEF FFFC 110BC 110BE 110CC 110CE 1342F 13440 1BC9F 1BCA4 1D172 1D17B DFFFF E1000`

- **Qué fijan.** Fijan los extremos de cada tramo desde fuera: un tramo ensanchado en un punto rompe una J28i.
- **Coste.** 67 versiones más en BORR3. Cada `sv` usa `now()` y el sellado numera por máximo + 1, así que no hay colisión dentro de la transacción.

**J28e · solo el rótulo**
- Pasa a «`26.J28e · concepto de relleno hangul y espacio ideográfico`».
- El control J28e.0 dice ya «U+3164 y U+3000»: se queda.

#### Bloque de la banda (después de J48)

Q se escribe en céntimos y T es la nueva tolerancia. Los importes son base / cuota / total, en euros.

| Id | Líneas (`linea_borrador`) | Base / cuota / total | Q · T · diferencia | Espera | Cierra |
|---|---|---|---|---|---|
| **J49g** | 3 × `('Sesión de evaluación', 1, 3333, 'general', 2100)` | 82,65 / 17,34 / 99,99 | 1735,364 · 3 · 1,364 | se sella (BORR3) | S2 de B; mata MB1 (M49) |
| J49 | `('Informe pericial', 1, 10000, 'general', 2100)` + `('Material de evaluación, incluido', 1, 0, 'general', 2100)` | 82,63 / 17,37 / 100,00 | 1735,537 · 1 · 1,463 | `fuera de la banda` | la línea de 0 € suma 0; mata MB2 (M50) |
| J49h | las mismas | 82,64 / 17,36 / 100,00 | · 1 · 0,463 | se sella (BORR3) | la línea de 0 € es legítima |
| J49u | `('Sesión de evaluación', 3, 3333, 'general', 2100)` | 82,65 / 17,34 / 99,99 | 1735,364 · 1 · 1,364 | `fuera de la banda` | el desglose por unidad ya no entra (R4.3-D3) |
| J49ug | la misma | 82,64 / 17,35 / 99,99 | · 1 · 0,364 | se sella (BORR3) | `desglosarDesdeTotal(99,99)` de la línea entera |
| J50 | `('Informe pericial', 1, 10000, 'general', 2100)` + `('Ajuste', 1000000, 0, 'general', 2100)` | 0,00 / 100,00 / 100,00 | 1735,537 · 1 · 8264,46 | `fuera de la banda` | A-R1 = B-S1b |
| J50a | `('Informe pericial', 1, 10000, 'general', 2100)` + `('Material', 5000, 1, 'general', 2100)` + `('Descuento material', 5000, -1, 'general', 2100)` | 0,00 / 100,00 / 100,00 | 1735,537 · 3 · 8264,46 | `fuera de la banda` | A-R2 |
| J50b | `('Sesión', 1, 6000)` + `('Material', 1000000, 1, 'general', 2100)` + `('Descuento material', 1000000, -1, 'general', 2100)` | 50,00 / 10,00 / 60,00 | 0 · 2 · 1000 | `fuera de la banda` | B-S1c |
| J50c | `('Sesión', 1, 100000)` + `('Informe pericial', 1, 10000, 'general', 2100)` + `('Ajuste', 100000, 0, 'general', 2100)` | 600,00 / 500,00 / 1100,00 | 1735,537 · 1 · 48264 | `fuera de la banda` | A-R3 |
| J50d | `('Sesión', 1, 20000)` + `('Abono del informe', 1, -10000, 'general', 2100)` + `('Ajuste', 100000, 0, 'general', 2100)` | 82,64 / 17,36 / 100,00 | −1735,537 · 1 · 3471,5 | `fuera de la banda` | A-R4 (signo contrario) |
| J50e | J50, sellado por PRO1 autenticado sobre BORR1 | 0,00 / 100,00 / 100,00 | igual que J50 | `fuera de la banda` | A-R5 |
| J50g | `('Sesión', 1, 50000)` + `('Informe pericial', 1, 10000, 'general', 2100)` + `('Ajuste', 60000, 0, 'general', 2100)` | 100,00 / 500,00 / 600,00 | 1735,537 · 1 · 48264 | `fuera de la banda` | B-S1d |
| J50f | `('Sesión', 1, 6000)` + `('Material de evaluación, incluido', 1, 0, 'general', 2100)` | 50,00 / 10,00 / 60,00 | 0 · 0 · 1000 | `fuera de la banda` | la banda corre con T = 0: mata M55 |
| J50fg | las mismas | 60,00 / 0,00 / 60,00 | 0 · 0 · 0 | se sella (BORR3) | el límite exacto: mata M58 (`>=`) |
| J52g | `('Abono de un informe', 1, -10000, 'general', 2100)` | −82,64 / −17,36 / −100,00 | −1735,537 · 1 · 0,463 | se sella (BORR3) | `abs` dentro de `least`: mata M53 |
| J53g | `('Fotocopias', 10, 2, 'general', 2100)` | 0,17 / 0,03 / 0,20 | 3,471 · 1 · 0,471 | se sella (BORR3) | la cantidad dentro de `least`: mata M54 |

Notas:
- **J50e** sigue el patrón de J39 y J40:
  1. `call pg_temp.como(:PRO1);`
  2. `select pg_temp.assert_lanza_codigo_msg(pg_temp.sv(:BORR1, <líneas de J50>, 0.00, 100.00, 100.00, :PRO1), '23514', 'fuera de la banda', '26.J50e · …');`
  3. `call pg_temp.reset_sesion();`
- **Las líneas exentas** usan los valores por defecto de `linea_borrador`: `exento_sanitario`, tipo 0.
- **Comprobado que el resto del sellado no para antes ninguna fila de la tabla:**
  - la suma de líneas es igual al total en todas;
  - J50f y J50fg tienen parte general 0, así que «general ⇒ cuota ≠ 0» del 6.4 no salta;
  - J50f no es «todo exento», así que la cuota 10 no la para el 6.4;
  - signos: J52g es todo negativo y las demás, todo positivo o 0.
- **Las pruebas existentes conservan su resultado con la T nueva** (comprobado a mano, con Q y T por fila):

  | Prueba | Resultado | T | Diferencia |
  |---|---|---|---|
  | B2 | se sella | 1 | 0 |
  | J42 | `signo_ck` | 1 | 0,46 |
  | J43 | banda | 1 | 4982 |
  | J43g | se sella | 1 | 0,36 |
  | J44 | banda | 1 | 8264 |
  | J45 | banda | 2 | 1000 |
  | J45g | se sella | 2 | 0 |
  | J46g | se sella | 1 | 0 |
  | J47 | banda | 1 | 1,46 |
  | J47g | se sella | 1 | 0,46 |
  | J47b | banda | 1 | 1,54 |
  | J47c | se sella | 1 | 0,54 |
  | J47d | se sella | 1 | 0 |
  | J48 | banda | 1 | 3471 |

- **Fallan antes de la migración nueva**, con la ronda 3 aplicada:
  - **los 17 J28h** de los tramos nuevos;
  - **J49, J49u, J50, J50a, J50b, J50c, J50d, J50e y J50g.** Con `U = Σ cantidad` se sellan las nueve: J49 tiene U = 2 y diferencia 1,46; J49u, U = 3 y 1,36; las demás, U ≥ 5000.
- **Las positivas pasan ya con la ronda 3 y deben seguir pasando**: J28i, J49g, J49h, J49ug, J50fg, J52g y J53g. J50f también pasa ya, porque con la ronda 3 tiene U = 1 y diferencia 1000.

**Cabecera del banco (`26:5-30`)**
- La sección O (ronda 3): «el profesional lee mientras tiene asignado al paciente».
- En la J, la ronda 4:
  - «la clase de invisibles, tramo a tramo, con sus vecinos (J28h, J28i)»;
  - «la tolerancia de la banda por línea general (J49-J53)».

**`scripts/rls/README.md`, fila 26**: añadir «Ronda 4: la clase de invisibles tramo a tramo con sus vecinos (J28h, J28i) y la tolerancia por línea general de la banda (J49-J53)».

### R4.3 · Decisiones y alternativas descartadas

**D1 · Una migración nueva, `20261011140000_economico_ronda_4.sql`. No se reescribe la 20261011130000.**

Por qué:
- **La regla de CLAUDE.md** («migraciones siempre hacia delante») no se mide contra `main`, sino contra cualquier base donde se haya aplicado. La base local compartida tiene registrada la `20261011130000` (R4.0).
  - Si se edita el fichero, el historial de esa base dice «aplicada» con un contenido que ya no existe. La divergencia es silenciosa: el linter no la ve (R4.0).
- **Un número nuevo da una señal fiable.** `max(version) = 20261011140000` dice que la ronda 4 está en la base que se verifica. Es la comprobación que la memoria del proyecto pide antes de lanzar un verificador.
- **Es el precedente de la ronda 3** (D8 de R3: «la orden de la ronda es solo añadir»).
- **El diff de la ronda 4 queda en una sola función**, y es lo que los revisores leen.

Coste:
- una segunda definición de `fn_cotas_version_borrador()`, que mitigan su comentario («Redefine la de 20261011130000») y la regla de `supabase.md:43`;
- una línea en `territorio:` (P-R4.1).

Descartado: reescribir la 20261011130000. Daría un historial más limpio antes del merge a cambio de una base local que miente.

**D2 · Tolerancia `T = Σ_generales least(1, |Q_i|)`, con `Q_i = cantidad·precio·tipo/(10000+tipo)`.**

Qué consigue:
- **T no crece con lo que no mueve dinero.**
  - Una línea de 0 € suma 0.
  - Una pareja ±1 céntimo con un millón de unidades suma como mucho 1 por línea.
- **Una línea legítima de 0 € («incluido») sigue entrando** (J49h). Solo deja de aflojar la banda.
- **Un céntimo por línea**, y no 0,5, por tres razones:
  - J47, J47b, J47c y J47g siguen en su sitio (la banda de ±1 de una línea que ya cerró la ronda 3);
  - la tolerancia no depende de que T-026 redondee al más cercano o trunque;
  - el error real de `desglosarDesdeTotal` por llamada (≤ 0,5) queda dentro con margen.
- **El tope `least(1, |Q_i|)`, y no 1 a secas.** Una línea cuya cuota exacta es menor que un céntimo no puede desviar más que eso (J53g).

Descartado:
- **La de A, por unidad: `Σ cantidad·least(0,5, |p·t/(10000+t)|)`.** Una pareja ±1 céntimo con n unidades aún suma n·0,17·2: el millón de unidades de B-S1c da 347.000 céntimos.
- **Rechazar las líneas generales de precio 0.** Mata un tipo de línea legítimo («material incluido»). Si se quiere, es una decisión de producto de T-026 o T-046, no de una cota de la base.
- **Un céntimo fijo** (MB1). Rechaza S2, un documento legítimo (J49g).
- **El número de líneas generales** (MB2). Una línea de 0 € seguiría sumando 1 (J49).
- **Repetir el redondeo exacto en el disparador.** Excluido desde la ronda 2 (`diseno.md`, líneas 642-645 y 2130).

**D3 · Consecuencia aceptada: el desglose por unidad ya no se sella.**
- Una línea de 3 × 33,33 € desglosada unidad a unidad da una diferencia de 1,36 con T = 1 (J49u).
- T-026 desglosa por línea (J49ug) o por documento y tipo, que es como se calcula la cuota sobre la base imponible.
- Va a `state.md` como condición para T-026.

**D4 · La banda corre si hay alguna línea general (`v_hay_general`), no si T > 0.**
- Con la guarda en T > 0, una línea general de 0 € junto a líneas exentas dejaría sellar cualquier cuota con T = 0 (J50f).

**D5 · Residuo aceptado: un céntimo por línea general visible que mueva al menos un céntimo de cuota.** Una línea así cuesta unos 6 céntimos de precio.

| Para que pase | Hace falta |
|---|---|
| un error de cuota de k céntimos, sin mala fe | k líneas generales reales |
| un documento de 100 € con base 0 y cuota llena | unas 8264 líneas visibles con concepto e importe |

- Se anota en `state.md`, con la recomendación de que el esquema Zod de T-026 acote el número de líneas.
- Un techo de líneas en la base es una decisión de producto: «Lo que no entra».

**D6 · La clase de invisibles es una lista fija de tramos**, generada fuera (Node, Unicode 17.0) y guardada como enteros hexadecimales. Sin `[:space:]` y sin barras invertidas.
- **Hace dos cosas:**
  - es independiente del proveedor de locale (ICU, glibc o el `builtin` de Postgres 17 clasifican Cf de forma distinta);
  - quita de raíz la trampa de la decodificación de escapes.
- **El conjunto:**
  - Default_Ignorable_Code_Point, la propiedad que Unicode define precisamente como «no se ve si no se sabe pintar»;
  - Cf entera, que añade los signos de formato que sí ocupan sitio pero que, solos, no dicen nada: `0600-0605`, `06DD`, `070F`, `0890-0891`, `08E2`, `110BD`, `110CD`;
  - White_Space y Cc, que cubren lo que antes daba `[:space:]`;
  - las marcas combinantes genéricas, para la marca suelta de A-H2;
  - U+2800, que estaba en la ronda 3.
- **Descartado:**
  - la clase de caracteres `[:print:]` o `[:graph:]`: depende del locale (ICU excluye Cf; glibc y `builtin`, no);
  - generar la lista en SQL: Postgres 17 no expone la categoría general ni la propiedad.

**D7 · J28h, uno por tramo con todos sus puntos, y J28i, uno por vecino.**
- Juntas fijan cada tramo desde dentro y desde fuera.
- La lista del banco se diffa contra el generador, no contra la migración. Así, un error común de copia entre los dos ficheros no se compensa.

### R4.4 · Cómo se cierra cada hallazgo

Todo con la base reseteada en el worktree: `npx supabase db reset`, y después `max(version) = 20261011140000`.

**A-H1 = B-H1**
- Primero, con la ronda 3 sola: J49, J49u, J50, J50a, J50b, J50c, J50d, J50e y J50g en rojo. Salida en la evidencia.
- Después, con la ronda 4: el banco 00 + 01 + 26 en verde.
- M48 muere.

**B-H2**
- J49g en verde.
- M49 (MB1) muere en J49g y M50 (MB2) en J49. Los dos se anotan en `mutantes.json`.

**A-H2 / B-H3**
- J28h en verde para los 34 tramos, y en rojo antes para los 17 nuevos.
- J28i en verde.
- J28e con su rótulo nuevo.
- Las tres comprobaciones de texto, salida literal en la evidencia:

  | Comprobación | Resultado esperado |
  |---|---|
  | el generador (`tramos`) contra `sed -n '/tramos:inicio/,/tramos:fin/p' supabase/migrations/20261011140000_economico_ronda_4.sql \| grep -o '\[0x[0-9A-F]*, 0x[0-9A-F]*\]'` | diff vacío |
  | el mismo generador contra la extracción equivalente del banco 26 | diff vacío |
  | `grep -c '\\' supabase/migrations/20261011140000_economico_ronda_4.sql` | 0 |

- M56·01-M56·34 y M57a-c mueren.

**A-H3 = B-H4**
- `docs/state.md` reescrito, ≤ 80 líneas, con las entradas de R4.9 (`wc -l`).
- La bitácora con las tres reglas de R3.9 y la de la ronda 4.

**Comunes**

| Comando | Resultado |
|---|---|
| `npm run lint:migraciones` | sin hallazgos |
| `npm run lint` | verde |
| `npm run build` | verde |
| `npm run tipos` | `git diff --stat lib/supabase/tipos-bd.ts` vacío |
| `node ~/.claude/pipeline/territorio.mjs T-021` | limpio, tras P-R4.1 |

`npm run test:rls` completo cae en 16 antes de llegar a 26 (state.md): vale el banco 00 + 01 + 26, como en la ronda 3, con la nota.

### R4.5 · Qué revisar (revisores A y B, y autoevaluación)

**Qué elige quien sella, y su efecto en T**

| Entrada | Rango | Efecto en T |
|---|---|---|
| `concepto` | texto libre | no entra en T; la clase lo filtra |
| `cantidad` | entero ≥ 1, sin techo | solo dentro de `least(1, \|Q_i\|)` |
| `precio_unitario_centimos` | entero de cualquier signo, 0 incluido | ídem |
| `regimen_iva` | `exento_sanitario` o `general` | decide si la línea entra en T |
| `tipo_iva_centesimas` | 0..10000 | dentro de `Q_i` |
| número de líneas | sin techo | ver D5 |
| base / cuota / total | coherentes por `importes_ck` | la cuota se compara con Q |

Para el revisor, la pregunta es: ¿hay alguna entrada que haga crecer T sin mover Q, más allá de 1 por línea general con |Q_i| ≥ 1? La respuesta del diseño es no. Que se ataque con:
- líneas de 0 €;
- parejas ±1;
- tipos bajos con cantidades altas: tipo 1 y cantidad 10⁶ da |Q_i| ≥ 1, y suma 1;
- documentos negativos.

**La banda**
1. **`v_hay_general`, no `v_holgura > 0`, abre la banda.** J50f debe fallar con M55, por `fuera de la banda`, que no aparece.
2. **`abs` va dentro de `least`.** J52g debe fallar con M53, porque T sale negativo y la positiva da 23514.
3. **La cantidad va dentro de `Q_i` y de `least`.** J53g debe fallar con M54, porque T = 0,347 < 0,471.
4. **Es `>` y no `>=`.** J50fg debe fallar con M58: diferencia 0 y T 0.
5. **Los mensajes y el código no cambian.** Los fragmentos `Un concepto invisible` y `fuera de la banda` siguen siendo únicos frente a los del paso 6.

**La migración**

6. **No lleva barras invertidas** (`grep -c '\\'` = 0) **ni ningún carácter crudo invisible.**
   - Comprobación: `LC_ALL=C.UTF-8 grep -cP '[\x{0080}-\x{00A0}\x{00AD}\x{200B}-\x{200F}\x{2060}-\x{206F}\x{FEFF}\x{3000}\x{3164}]'` = 0 sobre la migración y sobre el banco 26.
7. **Solo trae `create or replace function`, `revoke` y `comment`.**
   - Ni `drop`, ni `create trigger`, ni `alter policy`, ni `grant`.
   - El disparador sigue siendo el de la ronda 3 (L10r3 en verde).
8. **Los 34 pares coinciden con el generador**, tanto en la migración como en el banco (R4.4).
   - Un par que falte lo detecta su J28h: M56.
   - Uno que sobre, sus J28i: M57.

**Otras puertas**

9. **Nulos.** Ningún nulo llega a las cotas: el 6.3 los rechaza antes (R4.0). Si se quitara el sellado, el 42501 del paso 0 tampoco correría; eso lo vigila J28g/M39, no esta ronda.
10. **Concurrencia.** La función no lee ninguna tabla, así que no hay carrera nueva.
11. **Permisos.** La función es invoker con `execute` revocado a `public`. No hay `grant` de tabla entera.
12. **Solo adición.** `UPDATE`, `DELETE` y `TRUNCATE` sobre las versiones siguen cerrados por las tres capas que prueban A y `10-solo-adicion`. Esta ronda no las toca.
13. **Las seis negativas de tramo que faltaban** (B-H3) están dentro de J28h, no aparte. Las que pide A-H2 son tramos de J28h:
    - U+FFF9-FFFB y U+E0080, dentro de `FFF0-FFFB` y `E0000-E0FFF`;
    - U+13430-1343F, U+1BCA0-1BCA3, U+1D173-1D17A y U+E01F0, también en sus tramos;
    - la marca combinante suelta, dentro de `0300-036F`.

### R4.6 · Riesgos, por probabilidad

1. **(Media) Se cuela un carácter crudo o se decodifica un escape al editar el banco.**
   - Mitigación: el código nuevo usa `chr(0x…)`, J28e solo cambia el rótulo, y está la comprobación de R4.5-6.
   - Si el `grep -cP` da más de 0, el ticket no se cierra.
2. **(Media) `state.md` pasa de 80 líneas al añadir tres entradas, y el hook lo bloquea.** Se reescribe:
   - las tres entradas de T-021 (líneas 11, 13 y 62-64) se compactan;
   - la línea 11 pasa a «ronda 4».
3. **(Media) T-026 desglosa por unidad y sus borradores no se sellan.** Queda escrito como condición en `state.md` (D3), y J49u lo documenta.
4. **(Baja) El residuo de D5 se usa con mala fe.** Hacen falta miles de líneas visibles. La cota de T-026 en Zod lo cierra del lado de la aplicación.
5. **(Baja) Una marca combinante propia de una escritura** (hebrea, devanagari…), sola como concepto, se sella. Es un residuo anotado: se pinta sobre un círculo de puntos en casi todos los renderizadores.
6. **(Baja) Dos definiciones de la función confunden a quien la lea.** Lo mitigan el comentario y `supabase.md:43`.
7. **(Baja) Coste de J28h y J28i.** Son 34 + 67 altas, y la mayor lleva un concepto de 4096 puntos (16 KB). La auditoría recorta el sobre. Es despreciable frente al banco.

### R4.7 · `mutantes.json` de la ronda 4

- **Método**: el de la ronda 3, en `metodo_ronda3`:
  1. `create or replace function` como `postgres` sobre la base viva;
  2. bancos 00 + 01 + 26 con las aserciones convertidas en avisos;
  3. restaurar desde la migración 20261011140000.
- **Clave nueva**: `metodo_ronda4`, que dice lo mismo y nombra el fichero restaurado.

| Id | Mutación | Muere en |
|---|---|---|
| M48 | la tolerancia de la ronda 3: `v_holgura + cantidad` | J49, J49u, J50, J50a, J50b, J50c, J50d, J50e, J50g |
| M49 | MB1 de B: `> 1` fijo | J49g |
| M50 | MB2 de B: T = número de líneas generales (`v_holgura + 1`) | J49 |
| M51 | `least(0.5, abs(v_q))` | J47c |
| M52 | sin tope: `v_holgura + abs(v_q)` | J47, J47b, J49, J49u |
| M53 | sin `abs`: `least(1, v_q)` | J52g, J45g |
| M54 | tope sin la cantidad: `least(1, abs(precio·tipo/(10000+tipo)))` | J53g |
| M55 | la banda abre con `v_holgura > 0` en vez de `v_hay_general` | J50f |
| M56·01-34 | quitar el par k del array | J28h del tramo k |
| M57a | ensanchar `0001-0020` a `0001-0021` | J28i U+0021 |
| M57b | ensanchar `3000` a `3000-3001` | J28i U+3001 |
| M57c | ensanchar `FFF0-FFFB` a `FFF0-FFFC` | J28i U+FFFC |
| M58 | `>` por `>=` | J50fg |

**Se vuelven a correr y deben seguir muertos**, adaptados a los nombres nuevos:

| Mutante | Muere en |
|---|---|
| M37 | J28c-e y J28h |
| M39 | J28g |
| M40 y M41 | J46 y J46g |
| M42 (quitar la banda) | J43-J48, J49, J49u y J50* |
| M43 (`> 0`) | J47g, J47c, J43g, J49g, J49h, J49ug, J52g y J53g |
| M44 (`2·T`) | J47, J47b y J49 |
| M45 | J47b |
| M46 | J48 |
| M47 | J47d |
| M7 y M8 | K14, K15 y K17 |
| M21 | J42 |
| M22 | J28b |
| M25 | J31b |

M38 (quitar U+FEFF) queda subsumido en M56, en el par `FEFF`.

**Equivalentes declarados, con su motivo:**
- **Contar en T las líneas exentas.** El 6.3 obliga a que una exenta tenga tipo 0, así que `Q_i = 0` y suma 0. Si además abriera la banda, el 6.4 ya obliga a cuota 0 cuando todo es exento: diferencia 0 ≤ 0.
- **Volver a añadir `[:space:]` a la clase.** En esta base (ICU), sus 29 puntos están todos en los tramos (R4.0).

### R4.8 · Territorio y delegable

**Escribe la ronda 4:**
- `supabase/migrations/20261011140000_economico_ronda_4.sql`, **que no está en el `territorio:`** del contrato (P-R4.1);
- `scripts/rls/26-economico.sql` y `scripts/rls/README.md`;
- `tickets/T-021/**`: `mutantes.json`, la evidencia, y la de la ronda 3 archivada como `evidencia.ronda3.json`, igual que se hizo con la ronda 2;
- `docs/bitacora/T-021.md`;
- `docs/state.md`;
- `lib/supabase/tipos-bd.ts`: solo si `npm run tipos` lo cambia, y no se espera.

**No se tocan:**
- la 20261011120000 ni la 20261011130000;
- `00-ayudantes` y `01-fijacion`;
- `11-cobertura`, porque no hay políticas nuevas;
- el linter.

**Delegable**: nada. Es una cota de dinero en la base, y el banco que la prueba.

### R4.9 · Memoria al cerrar (A-H3 = B-H4)

**`docs/state.md`**, reescrito y no ampliado, ≤ 80 líneas:
- **En curso**: T-021 ronda 4 implementada, con la migración 20261011140000. La línea 13 pasa a «T-021 (20261011120000, 20261011130000, 20261011140000)».
- **§Hallazgos**, entradas nuevas, compactando las de T-021 que ya hay:
  - «T-021 · los documentos mixtos (exento negativo y general positivo) no se sellan por `signo_ck`; lo decide T-026.»
  - «T-021 · la banda de la cuota tolera un céntimo por línea general (`least(1, |Q_i|)`). T-026 desglosa por línea o por documento y tipo, nunca por unidad (J49u). Residuo: un céntimo por línea general visible; el Zod de T-026 debe acotar el número de líneas.»
  - «T-021 · una marca combinante de una escritura concreta (fuera de los bloques genéricos), sola como concepto, se sella. Residuo aceptado.»

**`docs/bitacora/T-021.md`**:
- **Las tres reglas de R3.9**, que faltaban:
  1. «Las cotas del sellado viven en dos disparadores; el orden es por nombre.»
  2. «Mensajes de error que no comparten prefijo.»
  3. La segunda regla de R3.9, «Una banda con tolerancia U no es repetir el redondeo», con su enmienda de la ronda 4: «la tolerancia de una banda se mide en lo que mueve dinero: un céntimo por línea general que mueva al menos un céntimo, nunca por una cantidad que elige quien sella».
- **La entrada de la ronda 4**:
  - los hallazgos y su cierre;
  - la clase como lista generada (Unicode 17.0) sin barras invertidas.

**Para `.claude/rules/supabase.md`**, propuesta al usuario y no a este ticket: «Una lista de caracteres en una expresión de Postgres se escribe como enteros hexadecimales y `chr()`, nunca con escapes de barra invertida: las herramientas de edición los decodifican.»

### Lo que no entra en la ronda 4, y por qué

- **Un techo de líneas por documento, o de cantidad por línea, en la base.** Es una decisión de producto (cuántas líneas tiene un borrador real). Su sitio natural es el Zod de T-026 (D5).
- **Rechazar las líneas generales de 0 €.** Matan un tipo de línea legítimo (D2).
- **Repetir el redondeo de `lib/dinero` en el disparador.** Excluido desde la ronda 2.
- **Las marcas combinantes propias de cada escritura.** No hay propiedad Unicode que las separe de las que se usan solas, y Postgres no da la categoría. Es un residuo anotado.
- **Normalizar o limpiar el concepto.** La base no reescribe lo que se sella (R3).
- **La comparación literal del catálogo en L10r3** (nota 1 de B). J28g y M39 ya cubren el orden de los disparadores; la aserción de catálogo se queda como está.
- **Defender las cotas de un concepto nulo** con `coalesce`. El 6.3 lo rechaza antes, y el orden lo fijan J28g y M39.

### Resumen de la ronda 4

1. Se construye una migración nueva, `20261011140000_economico_ronda_4.sql`, que solo redefine `fn_cotas_version_borrador()`. No se reescribe la 20261011130000, porque la base local ya la tiene aplicada.
2. **Decisión 1 · La tolerancia de la banda pasa a `T = Σ least(1, |Q_i|)` por línea general**, y la banda corre si hay alguna línea general. Las líneas de 0 € y las parejas ±1 ya no la inflan. S2 se sella (J49g).
3. **Decisión 2 · La clase de invisibles es una lista fija de 34 tramos** (Unicode 17.0: Default_Ignorable_Code_Point, Cf, White_Space, Cc, marcas combinantes genéricas y U+2800). Se guarda como enteros hexadecimales y `chr()`: sin `[:space:]` ni barras invertidas, y diffada contra un generador Node.
4. **Decisión 3 · El desglose por unidad deja de sellarse.** T-026 desglosa por línea o por documento (J49u). Residuo: un céntimo por línea general visible.
5. **Pruebas nuevas:**
   - J28h, uno por tramo (34), y J28i, uno por vecino (67);
   - J49-J53, con los ataques A-R1 a A-R5 y B-S1b a B-S1d como negativas;
   - S2, J49h, J49ug, J50fg, J52g y J53g como positivas.
6. **Fallan primero:** 17 J28h, y J49, J49u, J50, J50a-e y J50g.
7. **Mutantes M48-M58**, con M56·01-34 y M57a-c. MB1 y MB2 de B mueren en J49g y J49.
8. **La memoria:** en `state.md`, `signo_ck` y los documentos mixtos, la condición de desglose para T-026 y los residuos; en la bitácora, las tres reglas de R3.9.
9. **Revisar con más cuidado:**
   - `v_hay_general` frente a `T > 0` (J50f);
   - `abs` y la cantidad dentro de `least` (J52g, J53g);
   - `>` en el límite exacto (J50fg);
   - que no haya ninguna barra invertida ni carácter crudo en los dos ficheros.
10. **Antes de implementar**, el contrato tiene que añadir la migración nueva a `territorio:` (P-R4.1).

**Pregunta al propietario**
- **P-R4.1** · Añadir `supabase/migrations/20261011140000_economico_ronda_4.sql` al `territorio:` de `tickets/T-021-economico-esquema.md`. Recomendación: sí. Es una migración nueva en vez de reescribir la 20261011130000, que ya está aplicada en la base local (R4.3-D1).

### Respuestas del propietario a la ronda 4 (06-10-2026)

- **P-R4.1: cerrada, aprobada con migración nueva.** `supabase/migrations/20261011140000_economico_ronda_4.sql` ya está en el `territorio:` de `tickets/T-021-economico-esquema.md`. El diseño de la ronda 4 queda listo para implementar.
