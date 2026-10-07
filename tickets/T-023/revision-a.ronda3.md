Sin hallazgos ALTA. Revisor A, ronda 3: 0 ALTA, 0 MEDIA, 4 BAJA.

# T-023 · Ronda 3 · Revisor A (datos, acción del servidor, banco y constitución)

Diff: `git diff worktree-agent-a65aa0bb5f872243e..worktree-agent-a875b9deffe28f1da -- . ':!tickets'` (19 ficheros).
Contrato: anexo R3 de `tickets/T-023/diseno.md` (R3.1, R3.4, R3.5 y R3.6, «Revisor A»).
No he leído `evidencia.json` ni el informe del implementador.

## Medido

Ejecuté `00-ayudantes + 01-fijacion + 30-cobros` de la rama (HEAD e7c356f) dentro de `begin … rollback`
en `supabase_db_Psicogestion` (max(version) = 20261013120000) y añadí al final una sonda propia.
Resultado: rc=0, con E12, E12b, E12c y E12g en OK. La sonda dio esto:

| Sonda | Qué | Salida |
|---|---|---|
| S1 | PRO2 (CB) inserta con el id del cobro de PRO1 y su propio paciente P30B | `23505 … "cobros_pkey"` |
| S2 | relectura del servidor como PRO2 (`id = X and registrado_por = auth.uid()`) | 0 filas |
| S3 | PRO2 con el mismo id y un paciente que no ve (P30A) | `42501` (la RLS va antes que el índice único) |
| S4 | PRO1 con su id existente y fecha futura | `23514` (el disparador before va antes que el índice único) |
| S5 | relectura del servidor como PRO1 | 1 fila |

## «Qué revisar» de R3.6 (Revisor A), punto por punto

- **El 23505 solo se da por bueno con `cobros_pkey` y fila propia bajo RLS.** Se cumple
  (`acciones.ts:100-112`). La condición pide `code === '23505'` y `cobros_pkey` en el mensaje. Después,
  `select('id').eq('id', id).eq('registrado_por', usuario.id).maybeSingle()` con el cliente de sesión.
  Si un usuario reutiliza el id de otro, recibe el mensaje genérico. Lo he medido: S1 + S2 dan 23505
  y 0 filas, así que la acción devuelve `fallo()`. Para el administrador, que con la RLS lo ve todo,
  la única guarda es `registrado_por`. La prueba positiva la fija con
  `toHaveBeenCalledWith('registrado_por', USUARIO)`, y un mutante que la quitara cae.
- **Sondeo de un cobro ajeno.** Con un id ajeno existente sale el genérico. Con uno inexistente, el cobro
  entra de verdad y no se puede borrar (regla 6). Ese diferencial ya existía antes de este diff, porque
  `authenticated` tiene `insert (id, …)` sobre `cobros` desde T-021 (`20261011120000_economico_esquema.sql:1255`)
  y PostgREST devuelve el 23505 tal cual. Además, solo sirve si ya se conoce el uuid, y conocerlo ya es el
  dato. Este diff no abre un oráculo nuevo, así que no lo cuento como hallazgo.
- **E12 lleva su gemela.** Sí: E12g mete otro id en la misma sesión con el mismo importe y entra. E12b usa
  `assert_lanza_codigo_msg` con el código y el fragmento `cobros_pkey`, así que no se pondría verde con un
  23505 de otra restricción.
- **Nada nuevo lee `perfiles`.** Revisé las líneas añadidas del diff: no aparece ningún `from('perfiles')`.
  `cargarOpcionesProfesional` sigue usando `directorio_perfiles` y la RPC.
- **`z.uuid()` antes de todo lo demás.** Va antes del paciente (`acciones.ts:33-35`). Sin id, o con un id
  que no es UUID, devuelve `fallo()` y no llega al insert. Las pruebas cubren `undefined`, `'x'` y `7`.

## Mutantes M18-M22 y banco E12

- **M21** (cualquier 23505 cuenta como éxito y no se relee): cae por el motivo correcto. «Sin fila propia»
  y «error al releer» esperan `fallo()`, y «otra restricción» espera además que no se llame a
  `selectCobros`. He razonado también tres variantes intermedias:
  - quitar `.eq('registrado_por', …)`: cae por `toHaveBeenCalledWith` en la positiva;
  - quitar `includes('cobros_pkey')`: cae «otra restricción», cuya fixture trae una fila existente;
  - quitar la validación del id: caen los tres `it.each`, que esperan que no se inserte.
  Quitar `&& !errorRelectura` no lo caza ninguna prueba, pero es equivalente: `maybeSingle` no devuelve
  `data` junto con `error`.
- **M18** (`router.refresh()` de vuelta en el catch): la prueba sigue simulando `next/navigation`
  (`formulario-cobro.test.tsx:8-9`), así que cae por `refresh not.toHaveBeenCalled` y no porque se rompa
  el renderizado.
- **M19, M20, M22**: son de interfaz (revisor B). Las pruebas que los cazan existen y comprueban lo que dice
  `mutantes.json`.
- **E12**: no tiene mutante SQL porque la guarda es la clave primaria, y el diseño lo acepta. Sin
  `cobros_pkey`, E12b caería («no lanzó nada»).

## Constitución (regla 6)

El diff no trae ningún `UPDATE`, `DELETE` ni `upsert` sobre tablas económicas. La acción hace un `insert` y,
si ese insert falla, un `select`. El banco solo inserta. La migración no cambia. **Sin violaciones.**

## Hallazgos A de la ronda 2

- **A-H1: cerrado.** `docs/state.md:26-31` de la rama coincide byte a byte con el bloque de R3.5 (`diff` vacío).
  Ya dice «Queda rastro en `auditoria`» y «sigue sin módulo propio».
- **A-H2: cerrado.** Están los tres casos (filtro del administrador, técnico del centro del superviviente y
  profesional del absorbido), con «No cambia ninguna cifra. Ticket aparte.».
- **A-H3: cerrado** en lo que pedía, que era no presentar un error como ausencia. Un fallo de la RPC o un
  error del directorio dan `{ ok: false }`, «Profesional no encontrado» solo sale sin fila y sin error, y
  hay pruebas para la RPC, el directorio (57014) y la página. Queda el residuo de H4.

## Hallazgos

### H1 · BAJA · `app/(app)/facturacion/acciones.ts:109`
Si la relectura falla después de un 23505 de la propia clave, el usuario lee «No se ha podido registrar el
cobro», y es falso: el cobro con ese id ya está en la base. El registro solo guarda `23505`, no el código de
la relectura (`:115`). La prueba «con error al releer» no comprueba la consola.

**Escenario.** Un corte de red tras el primer envío, que sí entró. El usuario vuelve a pulsar, el insert da
23505 `cobros_pkey` y la relectura cae (57014 o se agota la conexión). La acción devuelve `fallo()`. El
usuario entiende que no quedó registrado, cierra el diálogo y lo vuelve a rellenar. El formulario se monta
de nuevo con otro id, así que queda un cobro duplicado que no se puede borrar.

El texto que corresponde aquí es `resultadoDesconocido`. No abre ningún oráculo, porque un error de lectura
no depende de que el cobro sea de otro. El diseño (R3.1, «sin fila o con error: `fallo()`») dicta lo que hay
ahora.

### H2 · BAJA · `app/(app)/facturacion/acciones.ts:55`
El reintento con la misma clave vuelve a pasar por todas las guardas previas al insert. Si una de ellas
cambia entre los dos intentos, contesta como si el cobro no existiera.

**Escenario.** El primer envío del cobro de P entra, pero la red corta la respuesta. Antes del reintento,
un administrador fusiona P en Q. Al reintentar, la acción devuelve `pacienteFusionado` («Registra el cobro
en el que se conserva») sin llegar al insert. El usuario lo registra en Q y el pendiente consolidado de Q
suma los dos: queda `cobrado_de_mas`.

El caso es improbable, porque exige que la fusión caiga justo entre el corte y el reintento. Lo cerraría
comprobar la clave propia antes de las guardas: `select … where id = :id and registrado_por = :yo` y, si
devuelve la fila, éxito.

### H3 · BAJA · `docs/state.md:21`
El §«Siguiente paso» no se reescribió y sigue pidiendo «T-023 ronda 2: verificador y dos revisores», cuando
la línea 11 ya dice «ronda 3 implementada». Además, la línea 11 sitúa «M18-M22» dentro del «banco 30»,
pero son mutantes TS (`mutantes.json` → `ts_ronda_3`). El pie de `30-cobros.sql` se queda en M17, como
corresponde.

**Escenario.** La sesión siguiente lee las primeras 80 líneas (regla 4) y lanza otra vez el verificador y
los revisores de la ronda 2. O busca M18-M22 en `scripts/rls/30-cobros.sql` y no los encuentra.

### H4 · BAJA · `app/(app)/facturacion/page.tsx:36`
Cuando falla la carga de profesionales, la página quita el selector y pinta el aviso. Pero la métrica, el
pendiente y «Últimos cobros» siguen filtrados por `?profesional=` y nada en pantalla dice por quién.

**Escenario.** El administrador abre un enlace guardado, `/facturacion?profesional=<Ana>`, y
`profesionales_del_pendiente` agota el tiempo. Ve «No se ha podido cargar la lista de profesionales» y, debajo,
«Pendiente total» con la cifra solo de Ana. Lo toma por el total de la consulta. Antes la mentira era
«Todos»; ahora es una omisión.

Lo arreglaría que el aviso dijera que las cifras están filtradas, o un enlace «quitar filtro» cuando
`profesionalFiltrado !== null`. El diseño R3.4 dicta el comportamiento actual.

## Fuera de mi ámbito, para B (sin contar)

`claveRef` vive en `FormularioCobro`. Si el usuario cierra y vuelve a abrir el diálogo tras
`resultadoDesconocido`, o cambia un campo y lo deja como estaba, la huella o el montaje cambian y el id
también. El texto pide «sin cambiar nada» y no menciona cerrar el diálogo.
