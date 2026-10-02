# T-041 · Diseño — Altas de centro para quien atiende

> Arquitecto, 02-10-2026. Contrato: `tickets/T-041-altas-de-centro-para-quien-atiende.md`.
> ADR citados: ADR-033, ADR-051, ADR-065, ADR-066, ADR-072, ADR-073; decisión fundacional 5.

**Hace falta migración.** Una sola, `supabase/migrations/20261010120000_altas_de_centro.sql`
(provisional: 20261008 y 20261009 quedan para T-038 y T-040, que van antes en la cola; el
implementador comprueba con `ls supabase/migrations | tail -1` que su sello es el último y,
si no, toma el siguiente día libre). El ticket **entra** en la cola de `supabase/`, después de
T-040. Los cuatro motivos están en §2 D1.

---

## 0 · Hechos verificados contra el código

**La tabla guarda vigencia; retirar es cerrar.**

- `supabase/migrations/20260829120000_perfiles_centros_multicentro.sql` crea
  `perfiles_centros (id, perfil_id → perfiles on delete cascade, centro_id, principal, desde date
  default current_date, hasta date, creado_en)`.
  - Comprobaciones: `perfiles_centros_vigencia_coherente` (`hasta >= desde`) y
    `perfiles_centros_cierre_no_futuro` (`hasta <= current_date`).
  - Índices únicos parciales: `perfiles_centros_un_principal_vigente (perfil_id) where principal
    and hasta is null` y `perfiles_centros_una_vigente_por_par (perfil_id, centro_id) where hasta
    is null`.
- «Vigente» en la base es `hasta is null`, y nada más. `desde` es solo histórico.
  - `centros_actuales()` y el paso 7c filtran solo por `hasta is null`.
  - La interfaz filtra además por fechas: `components/armazon/armazon.tsx` `cargarCentros` y
    `app/(app)/agenda/datos.ts` usan `desde <= hoy` y `hasta is null or hasta >= hoy`.
  - Por eso, el mismo día en que se retira un alta, el selector del armazón aún muestra el centro
    (véase §4 R6).

**Quién puede escribir, y qué puertas tiene.**

- Políticas (misma migración, líneas 397-411):
  - `perfiles_centros_lectura`: `select` si `rol_actual() is not null`. El directorio es abierto a
    propósito.
  - `perfiles_centros_alta_administrador`: `insert`, `with check` administrador.
  - `perfiles_centros_cierre_administrador`: `update` con `using` y `with check` administrador,
    **sin restringir columnas**. Hoy un administrador puede, por PostgREST:
    - reabrir una fila cerrada (`hasta = null`);
    - cambiar `centro_id` o `desde` de una fila antigua.

    Las dos cosas reescriben el rastro, y `fn_auditar` las registra pero no las impide.
  - No hay política de `delete`.
- Permisos: `grant select, insert, update to authenticated`. No hay `delete` ni `truncate`, y está
  revocado a `public`, `anon` y `service_role`.
- Disparadores:
  - `espejar_centro_principal` (definer, `after insert/update/delete`) copia el principal vigente,
    o `null`, a `perfiles.centro_id`. Con un técnico, ese `null` lo rechaza
    `perfiles_tecnico_exige_centro`.
  - `auditar_perfiles_centros` → `fn_auditar()`, con actor `auth.uid()`. Dentro de una función
    definer, `auth.uid()` sigue leyendo el JWT del llamante, así que el actor es el administrador.
- Bajo RLS, el `update` de un no administrador no lanza: afecta 0 filas.
  - `scripts/rls/12-resto-de-tablas.sql:226-234` lo comprueba así, a propósito.
  - El criterio 3 pide «error desde la base», y hoy retirar no lo da.

**Alta por invitación.**

- `fn_crear_perfil_de_usuario` (misma migración) lee `raw_user_meta_data.rol`, `centro_id` y
  `nombre_completo`. Si viene `centro_id`, inserta **una** pertenencia `principal = true`.
- `lib/cuentas/invitar.ts` hace tres pasos:
  1. `preparar_invitacion(p_rol, p_centro_id)`;
  2. `auth.admin.inviteUserByEmail(correo, { data: { rol, centro_id, nombre_completo } })`;
  3. `registrar_invitacion(p_perfil_id)`.
- `lib/cuentas/esquemas.ts`: `esquemaInvitacion.centroId: z.uuid().nullable()`, con un `refine`
  que lo exige solo al técnico.
- `app/(app)/ajustes/invitar/formulario-invitar.tsx:85-92` borra `centroId` al cambiar a un rol
  que no sea técnico, y el `Desplegable` de centro solo aparece con técnico.
  - `formulario-invitar.test.tsx:68` lo fija con la prueba «un profesional sanitario no pide
    centro, y no manda ninguno». **Esa prueba cambia** (§5).
- `preparar_invitacion` (`20260830090000_cuentas_invitacion_baja_totp.sql:319`):
  - comprueba que el llamante es administrador, que el técnico lleva centro (23514) y que el centro
    existe (23503);
  - no escribe nada y no mira `centros.activo`.
- Nada en `app/` ni en `lib/` escribe en `perfiles_centros`. Lo leen cuatro sitios:
  - `armazon.tsx`;
  - `app/(app)/acciones.ts` `elegirCentro`;
  - `agenda/datos.ts`;
  - `lib/notas/servidor.ts:312-340`.

**El selector de coprofesional ya hace lo que pide el criterio 5.**

- `lib/notas/servidor.ts:312-340` lee `perfiles_centros` con `centro_id = episodio.centroId and
  hasta is null`, quita al llamante y cruza con `directorio_perfiles` por `ROLES_COPROFESIONAL` y
  `estado = 'activo'`.
- Por tanto, dar un alta basta para que la persona aparezca, y retirarla basta para que
  desaparezca. **La pantalla de la nota no se toca.**

**La regla 7c no cambia.**

- `20261004120000_centro_congelado_y_coprofesional.sql`, `fn_exigir_episodio_coherente_en_nota`,
  paso 7. Solo se evalúa si el coprofesional es nuevo o cambia el episodio:
  - 7b: rol en (`profesional_sanitario`, `administrador`); si no, 23514.
  - 7b': perfil activo; si no, 23514.
  - 7c: `e.centro_id is null or not exists (perfiles_centros … hasta is null)`; si no, 23514.
- 7c **no se vuelve a evaluar al firmar** si el coprofesional no cambia (véase §4 R3).

**Uso de los centros en la RLS: nada fuera del técnico.**

- Todas las llamadas a `centros_actuales()` están acotadas por `rol_actual() =
  'tecnico_administrativo'`:
  - políticas de `pacientes` del técnico, rama del técnico en `alertas`, vista
    `pacientes_indicador_riesgo`, vista `citas_agenda`;
  - políticas de `citas` y `series_cita`, `pacientes_identificacion_lectura_tecnico`, funciones
    `agenda_*`.
- **Excepción, la única:** `episodio_para_nota` (`20260929120000_nota_siempre_en_episodio.sql:362-367`):
  - si se pasa `p_centro_id` y no está en `centros_actuales()`, lanza 42501 «El centro no es uno
    de los tuyos.», sea cual sea el rol.
  - Hoy, un administrador o un profesional invitado sin altas no puede abrir un episodio sin
    cita.
  - Con un alta, sí puede, y solo en ese centro.
- `docs/architecture.md:276-279` dice que `centros_actuales()` está «vacío para administrador y
  profesional». **Es falso**: está vacío solo si no tienen altas. Se corrige (§1 P9).

**Las notas no miran el centro.**

- `notas_clinicas_lectura` y `notas_clinicas_versiones_lectura` (`20260822160000`, líneas
  ~1117-1180; nunca se redefinieron) solo dejan pasar lo siguiente, siempre con
  `historia_desbloqueada()`:
  - `autor_id = auth.uid()`;
  - `es_profesional_asignado`;
  - versión conjunta con `es_profesional_del_episodio`.
- Ninguna de las dos mira centros ni `coprofesional_id`. Un alta no puede añadir ni una fila.

**Centro del paciente.**

- `fn_rellenar_centro_paciente` (redefinida en `20260829120000:357`) toma
  `centro_principal(profesional_id)`. Si no hay, el único centro activo; si no, `null`, que es
  fallo cerrado para el técnico.
- `alta_paciente` no pasa centro. Por eso **el alta principal decide el centro de los pacientes
  que esa persona dé de alta a partir de entonces**.

**Directorio.**

- `directorio_perfiles` (definer, `security_barrier`) da `id, nombre_completo, rol, estado,
  centro_id` a todo perfil activo.

**Siembras.**

- `supabase/seed.sql` corre en cada `db reset`, también antes de `test:rls`.
  - Su administrador `b0080001-…-000000000001` no tiene centro.
- `supabase/seed-completo.sql` (`npm run seed`):
  - §3.bis inserta la pertenencia no principal de Ana en Canarias con id fijo
    `a0080008-0000-4000-8000-000000000001`, `on conflict (id) do nothing`;
  - constantes `k_adm`, `k_c_madrid`, `k_fecha_base`.

**Banco de RLS.**

- `scripts/test-rls.mjs` concatena `scripts/rls/*.sql` en orden alfabético, en una sola
  transacción con `rollback`.
- Ayudantes en `00-ayudantes.sql`: `assert`, `assert_lanza`, `assert_lanza_codigo`,
  `assert_lanza_codigo_msg`, `assert_no_lanza`, `contar`, `como`, `como_con_2fa`,
  `reset_sesion`.
- `11-cobertura.sql` cuadra solo las **políticas**. Este diseño no añade ni quita ninguna, así que
  no se toca.
- `13-cuentas.sql` emula la invitación:
  1. `preparar_invitacion` como ADM;
  2. `insert into auth.users` con `raw_user_meta_data`;
  3. `registrar_invitacion`.
- Módulo 19 (T-035): da al ADM del banco un alta en C35E **como `postgres`**. Es justo lo que el
  criterio 1 pide no hacer.
- Números ya tomados: 19 (T-035), 20 (T-012), 21 (T-028a, sin integrar), 22 (T-015), 23 (T-039);
  24 probablemente T-040.

**Compatibilidad del disparador nuevo con lo que ya actualiza `perfiles_centros`.**

- `06-centro.sql:23`, `12-resto-de-tablas.sql:220,230`, `19-nota-en-episodio.sql:742` y
  `scripts/t002-enmienda-multicentro.sql` (fuera de CI) solo hacen dos cosas:
  - cerrar filas vigentes (`hasta = current_date`, o `current_date + 30` esperando 23514 de la
    comprobación);
  - cambiar `principal` en filas vigentes.
- Ninguno toca una fila ya cerrada. La línea 230 de `12` lo intenta como PRO1 y RLS la filtra
  antes de que salte un disparador.

**Funciones de cuentas.**

- Ninguna exige segundo factor reciente: ni `preparar_invitacion`, ni `registrar_invitacion`, ni
  `dar_de_baja_perfil`.
- Las tres comprueban `rol_actual() <> 'administrador'`, y eso **no es seguro con `null`**: un
  perfil no activo con JWT vivo pasa. Es un hallazgo previo, no se arregla aquí (§Lo que no
  entra).

---

## 1 · Piezas y contratos

### P1 · Migración `supabase/migrations/20261010120000_altas_de_centro.sql`

Cabecera con el porqué (D1) y referencia a ADR-051/073 y a T-041. Tres objetos y nada más.

**(a) `public.dar_alta_centro(p_perfil_id uuid, p_centro_id uuid) returns uuid`**

`language plpgsql`, `security definer`, `set search_path = ''`, `volatile`. Hace esto, en este
orden:

1. Si `(select public.rol_actual()) is distinct from 'administrador'::public.rol_usuario`,
   lanza 42501 «Solo el administrador da altas de centro.».
2. Bloquea el perfil, **antes** de mirar nada:
   `select f.rol, f.estado into v_rol, v_estado from public.perfiles f where f.id = p_perfil_id
   for update`.
   - Si no se encuentra, lanza 23503 «El perfil no existe.».
   - El bloqueo serializa dos altas simultáneas al mismo perfil: ninguna ve «sin principal» a la
     vez que la otra.
3. Si `v_rol not in ('profesional_sanitario', 'administrador')`, lanza 22023 «Las altas de
   centro de quien atiende son para profesional sanitario o administrador.».
   - **Lista cerrada, la misma que 7b**: no se escribe `<> 'tecnico_administrativo'`.
4. Si `v_estado <> 'activo'`, lanza 23514 «El perfil no está activo.».
5. `select c.activo from public.centros c where c.id = p_centro_id`.
   - Si no se encuentra, lanza 23503 «El centro no existe.».
   - Si `not activo`, lanza 23514 «El centro está cerrado.».
6. Si ya hay fila con ese par y `hasta is null`, devuelve su `id` sin escribir. Es idempotente:
   un doble clic no da error.
7. Calcula `v_principal := not exists (select 1 from public.perfiles_centros where perfil_id =
   p_perfil_id and principal and hasta is null)`.
8. `insert into public.perfiles_centros (perfil_id, centro_id, principal, desde) values (…,
   current_date) returning id`, y devuelve ese id.

No se escribe nada más. La auditoría la pone el disparador que ya existe, y `perfiles.centro_id`
lo pone el espejo.

**(b) `public.retirar_alta_centro(p_perfil_id uuid, p_centro_id uuid) returns void`**

Mismo encabezado técnico. Hace esto:

1. La misma comprobación de administrador que (a), con la misma forma `is distinct from` →
   42501 «Solo el administrador retira altas de centro.».
2. Mismo bloqueo `for update` del perfil y el mismo 23503 si no existe.
3. Si el rol no está en la lista cerrada de (a), lanza 22023 «Esta pantalla no cambia los
   centros de un técnico administrativo.». Ver P1 de las preguntas.
4. `update public.perfiles_centros set hasta = current_date where perfil_id = p_perfil_id and
   centro_id = p_centro_id and hasta is null`.
   - Si `not found`, lanza P0002 «No tenía alta vigente en ese centro.».
   - **No se promociona otro principal** si se retira el principal: ver D5 y la pregunta P2.

Para las dos funciones:

- `revoke execute … from public, anon;`
- `grant execute … to authenticated;`
- un `comment on function` cada una.

**(c) Disparador `perfiles_centros_solo_cierre`, función `public.fn_perfiles_centros_solo_cierre()`**

- `before update on public.perfiles_centros for each row`.
- `security invoker`; no lee nada, solo compara `old` y `new`. `search_path = ''`.
- Comprobaciones:
  - Si `old.hasta is not null`, lanza 42501 «Una pertenencia cerrada no se modifica: se da un
    alta nueva (ADR-051).».
  - Si `new.id`, `new.perfil_id`, `new.centro_id`, `new.desde` o `new.creado_en` son `is distinct
    from` sus `old`, lanza 42501 «De una pertenencia vigente solo cambian el cierre y la marca de
    principal.».
  - Lo demás pasa: `hasta` de `null` a fecha, porque las comprobaciones existentes validan el
    valor, y `principal` en una fila vigente.
- **Aplica a todos los roles, también a `postgres`**. Todos los usos que hay ya lo cumplen (§0).
- `comment on trigger` con el porqué.

**Lo que NO cambia**, y que el revisor confirme que sigue igual:

- las tres políticas de `perfiles_centros`, los permisos y el espejo;
- `fn_crear_perfil_de_usuario`, `fn_exigir_episodio_coherente_en_nota` (7b, 7b' y 7c) y
  `centros_actuales()`.

La inserción directa por PostgREST sigue siendo solo del administrador (RLS). Las dos RPC son la
puerta de la aplicación.

### P2 · `lib/supabase/tipos-bd.ts`

Solo con `npm run tipos`, tras `npx supabase db reset`. No se edita a mano.

### P3 · `lib/cuentas/esquemas.ts`

```ts
export const MAX_CENTROS_DE_ALTA = 50;

esquemaInvitacion = z.object({
  correo, nombreCompleto, rol,                      // sin cambios
  centrosIds: z.array(z.uuid()).max(MAX_CENTROS_DE_ALTA),
  centroPrincipalId: z.uuid().nullable(),
})
// refine 1 (path ['centrosIds']): técnico ⇒ centrosIds.length === 1
//   mensaje: el de hoy, «Debe seleccionar un centro para técnicos administrativos»
// refine 2 (path ['centrosIds']): sin duplicados (new Set(...).size === length)
// refine 3 (path ['centroPrincipalId']):
//   centrosIds.length === 0 ⇒ centroPrincipalId === null
//   centrosIds.length  >  0 ⇒ centroPrincipalId !== null && centrosIds.includes(centroPrincipalId)
//   mensaje: «Elige cuál es su centro principal»

export const esquemaAltaCentro = z.object({ perfilId: z.uuid(), centroId: z.uuid() });
export type EntradaAltaCentro = z.infer<typeof esquemaAltaCentro>;
```

`centroId` desaparece del esquema. Todos sus usos (`invitar.ts`, `formulario-invitar.tsx`, su
prueba y `ajustes/acciones.ts`) pasan a `centrosIds` y `centroPrincipalId`.

### P4 · `lib/cuentas/invitar.ts` — `invitarPerfil(sesion, entrada)`

Orden, en este orden:

1. **Validación sin escribir.**
   - `preparar_invitacion(p_rol, p_centro_id)` una vez por cada centro de `centrosIds`.
   - Con `centrosIds = []`, una sola llamada con `p_centro_id: null`, igual que hoy.
   - Al primer error, `{ ok: false }` con el mensaje de hoy. Todavía no se ha enviado nada.
2. `inviteUserByEmail` con `data.centro_id = centroPrincipalId` (o `null`). El disparador crea el
   perfil y su alta principal.
3. `registrar_invitacion`, sin cambios.
4. Para cada `id` de `centrosIds` distinto del principal, `sesion.supabase.rpc('dar_alta_centro',
   { p_perfil_id, p_centro_id: id })`, con la sesión del administrador y **nunca con el cliente de
   administración**.
   - Se recogen los centros que fallen.
   - Si alguno falla, devuelve `{ ok: true, perfilId, altasSinDar: string[] }`: la invitación ya
     salió y no se deshace.

`ResultadoInvitacion` pasa a `{ ok: true; perfilId: string; altasSinDar: string[] } | { ok: false;
motivo; mensaje }`.

### P5 · `lib/cuentas/altas.ts` (nuevo, `import 'server-only'`)

```ts
export async function darAltaCentro(sesion: Sesion, entrada: EntradaAltaCentro)
  : Promise<ResultadoCuentas<{ altaId: string }>>;       // rpc('dar_alta_centro')
export async function retirarAltaCentro(sesion: Sesion, entrada: EntradaAltaCentro)
  : Promise<ResultadoCuentas>;                           // rpc('retirar_alta_centro')
export function mensajeDeErrorDeAlta(codigo: string | undefined, mensajeBase: string | undefined): string;
```

`mensajeDeErrorDeAlta` va por `error.code` y es pura, para poder probarla sin red. Los mensajes
son literales en castellano, como en `baja.ts`:

| Código | Mensaje |
|---|---|
| 42501 | «Solo el administrador da o retira altas de centro.» |
| 22023 | «Las altas de centro son para profesionales sanitarios y administradores.» |
| 23514 | El `message` de la base. Las dos causas (perfil no activo, centro cerrado) las escribe P1 en castellano llano. |
| 23503 | «El perfil o el centro no existen.» |
| P0002 | «No tenía alta vigente en ese centro: puede que otra persona la haya retirado ya.» |
| 23505 | «Otro cambio se ha cruzado con este. Vuelve a cargar la página y repite.» |
| otro | «No se pudo guardar el cambio de centro.», y `console.error` con el error. |

### P6 · `app/(app)/ajustes/acciones.ts`

- `invitar`: adapta el mensaje de éxito. Si `altasSinDar.length > 0`, usa
  `tCon('invitar.resultados.exitoConAltasPendientes', { correo, centros })`, con los nombres de
  los centros resueltos en la acción a partir de `centros`.
- Añade `darAltaDeCentro(datos: unknown)` y `retirarAltaDeCentro(datos: unknown)`. Las dos:
  1. llaman a `exigirAdministrador()`;
  2. hacen `esquemaAltaCentro.safeParse`;
  3. llaman al envoltorio de P5;
  4. con éxito, `revalidatePath('/ajustes/centros')` (patrón de `agenda/acciones.ts`);
  5. devuelven `EstadoFormulario`.
- La comprobación de rol en la acción es **cortesía**; la que manda es la de la RPC.

### P7 · `app/(app)/ajustes/centros/` (nuevo): «Altas de centro»

- **`page.tsx`**, Server Component con el patrón de `dar-de-baja/page.tsx`:
  - Comprueba con `estadoDeCuenta` y, si no es administrador, `redirect('/ajustes')`.
  - Lee tres cosas:
    - `perfiles (id, nombre_completo, rol)` con `estado = 'activo'` y `rol in
      ('profesional_sanitario','administrador')`;
    - `perfiles_centros (id, perfil_id, centro_id, principal, desde)` con `hasta is null`;
    - `centros (id, nombre)` con `activo = true`, ordenados por nombre.
  - Pasa al cliente filas planas: persona → sus altas vigentes `{ centroId, nombre, principal,
    desde }` y la marca `tienePrincipal`.
- **`gestion-altas.tsx`** (`'use client'`). Una lista, no tarjetas ni arrastre: ADR-051 e
  `interfaz.md` §Ajustes. Por cada persona:
  - nombre y rol;
  - sus centros vigentes, con «principal» en texto (no solo color) y la fecha `desde`;
  - un botón «Retirar» por centro.
- Bajo la lista, un formulario «Dar alta»:
  - `Desplegable` persona, `Desplegable` centro y botón «Dar alta».
  - El desplegable de centro excluye los que la persona ya tiene vigentes.
- Las dos acciones abren `Dialogo` (`components/ui/dialogo.tsx`) con la confirmación explícita
  que exige ADR-051. Los textos están en P8.
  - Dentro, «Confirmar» y «Cancelar». `focoInicial` va a «Cancelar».
  - Tras confirmar:
    - Con éxito, cierra el diálogo y lleva el foco al mensaje de estado (`role="status"`,
      `tabIndex={-1}`). El botón que abrió el diálogo puede haber desaparecido, y
      `useDevolucionDeFoco` no tendría adónde volver: véase el hallazgo «Foco del candado» en
      `state.md`.
    - Con error, deja el diálogo abierto con el mensaje dentro.
- **`page.tsx` de `/ajustes`**: en `AccesosDeAdministracion`, que ya devuelve `null` si no es
  administrador, se añade el enlace `/ajustes/centros` con `t('ajustes.acciones.altasCentro')`.
  No se pone enlace en ningún otro sitio.
- **`invitar/page.tsx`**: la lectura de `centros` pasa a filtrar `activo = true`.
- **`invitar/formulario-invitar.tsx`**:
  - Técnico: el `Desplegable` de hoy. Al elegir, escribe `centrosIds = [id]` y
    `centroPrincipalId = id`.
  - Profesional o administrador: un `fieldset` con `legend` «Centros donde atiende» y una
    `Casilla` por centro (`components/ui/casilla.tsx`, objetivo de 44 px).
    - Con exactamente uno marcado, `centroPrincipalId` es ese.
    - Con dos o más, aparece un `Desplegable` «Centro principal» entre los marcados, con valor
      `null` hasta que se elija.
    - Si se desmarca el principal, vuelve a `null`. No se elige en silencio.
  - Al cambiar el rol, siempre `centrosIds = []` y `centroPrincipalId = null`. Así un técnico no
    hereda varias casillas.
  - Texto de ayuda bajo el grupo: `invitar.formulario.centrosAyuda`.

### P8 · `lib/i18n/es.ts`

- `ajustes.acciones.altasCentro`: «Altas de centro».
- `invitar.formulario`:
  - `centros`: «Centros donde atiende»;
  - `centrosAyuda`: «Puede figurar como coprofesional en las notas de los episodios de estos
    centros. No le da acceso a ningún paciente.»;
  - `centroPrincipal`: «Centro principal»;
  - `centroPrincipalAyuda`: «Los pacientes que dé de alta quedan en este centro.».
- `invitar.errores.centroPrincipalRequerido`: «Elige cuál es su centro principal».
- `invitar.resultados.exitoConAltasPendientes`: «Invitación enviada a {correo}. No se pudo dar
  el alta en {centros}: dásela desde Ajustes › Altas de centro.».
- `altasCentro.titulo`: «Altas de centro».
- `altasCentro.descripcion`: «En qué centros atiende cada profesional. Un alta permite figurar
  como coprofesional en las notas de ese centro; no da acceso a pacientes ni a notas.».
- `altasCentro.persona`, `altasCentro.centro`, `altasCentro.principal`, `altasCentro.desde`,
  `altasCentro.darAlta`, `altasCentro.retirar`, `altasCentro.sinAltas`.
- `altasCentro.confirmacion.dar`: «¿Dar de alta a {nombre} en {centro}? Podrá figurar como
  coprofesional en las notas de los episodios de ese centro y abrir episodios en él. No le da
  acceso a ningún paciente ni a ninguna nota.».
- `altasCentro.confirmacion.darPrincipal`, que se añade a la anterior cuando la persona no tiene
  principal: «Será su centro principal: los pacientes que dé de alta a partir de hoy quedarán en
  {centro}, y el personal de recepción de {centro} verá sus datos básicos y sus citas.».
- `altasCentro.confirmacion.retirar`: «¿Retirar el alta de {nombre} en {centro}? Dejará de poder
  figurar como coprofesional en notas nuevas de ese centro. Las notas firmadas no cambian, y el
  alta queda registrada con su fecha de cierre.».
- `altasCentro.confirmacion.retirarPrincipal`, que se añade cuando es su principal: «Es su centro
  principal. Los pacientes que dé de alta a partir de hoy no quedarán en ningún centro mientras
  no tenga otro principal.».
- `altasCentro.resultados.dada` y `altasCentro.resultados.retirada`.

### P9 · Documentación

- **`docs/architecture.md:276-279`**: sustituir «vacío para administrador y profesional, y es
  correcto» por el hecho, más un párrafo corto §Roles bajo la matriz, «Un alta de centro no
  amplía la matriz» (§3, tabla Q). El hecho es este:
  - la RLS solo usa el conjunto para acotar al técnico;
  - para administrador y profesional contiene sus altas;
  - les permite dos cosas:
    - (a) abrir episodios sin cita en esos centros (`episodio_para_nota`);
    - (b) cumplir 7c como coprofesional.
- **`docs/interfaz.md` §Ajustes**: una línea bajo «Asignar un profesional a un centro». Dice que
  vive en `/ajustes/centros`, que es una lista con confirmación y que el técnico queda fuera de
  esta pantalla (P1).
- **`docs/interfaz.md:67`**: no se toca; es de otro ticket.

### P10 · `supabase/seed-completo.sql`

En §3.bis, tras la fila de Ana:

```sql
insert into public.perfiles_centros (id, perfil_id, centro_id, principal, desde, creado_en)
values ('a0080008-0000-4000-8000-000000000002', k_adm, k_c_madrid, true,
        k_fecha_base::date, k_fecha_base)
on conflict (id) do nothing;
```

- El comentario dice tres cosas:
  - por qué es principal: el administrador no tiene principal y no tiene pacientes, así que no
    cambia el centro de nadie;
  - que con eso el selector de Ana lo ofrece en Madrid;
  - que en una instalación real esta alta se da por `/ajustes/centros`.
- **`supabase/seed.sql` no se toca.** El banco usa su propia fijación, y meter el alta en la
  siembra base cambiaría `perfiles.centro_id` del administrador antes de cada `test:rls`.

### P11 · Banco `scripts/rls/25-altas-de-centro.sql`

Provisional 25: el implementador toma el siguiente número libre tras `ls scripts/rls`. Más una
fila en `scripts/rls/README.md`.

- **Fijación propia**:
  - centros C41A y C41B, con UUIDs de patrón `c0410001-0000-4000-8000-00000000000a/b`;
  - un centro C41Z inactivo;
  - un paciente P41 de PRO1 con un episodio E41A en C41A y otro E41B en C41B, insertados como
    `postgres` (es fijación, no lo que se prueba).
- **Al empezar**, el módulo asevera que ADM no tiene alta vigente en C41A ni en C41B. Si un
  módulo anterior se la diera, la gemela «sin alta» dejaría de serlo.
- Usa los ADM, PRO1, PRO2 y TEC1 de `01-fijacion.sql`. No los de la siembra.

Las secciones y lo que prueba cada una están en §3.

### P12 · Pruebas unitarias (vitest)

- **`lib/cuentas/esquemas.test.ts`** (nuevo):
  - los tres `refine`, cada uno con su gemela;
  - `esquemaAltaCentro` rechaza un `perfilId` que no es UUID.
- **`lib/cuentas/invitar.test.ts`** (nuevo), con `sesion.supabase.rpc` y `crearClienteAdministracion`
  simulados:
  - (a) con `[A, B]` y principal `B`:
    - `preparar_invitacion` se llama con A y con B **antes** de `inviteUserByEmail`;
    - los metadatos llevan `centro_id: B`;
    - después, un solo `dar_alta_centro` con A, y por `sesion.supabase`, no por el cliente de
      administración.
  - (b) si `preparar_invitacion` falla en el segundo centro, `inviteUserByEmail` no se llama.
  - (c) si `dar_alta_centro` falla, `ok: true` con `altasSinDar: [A]`.
  - (d) con `[]`, una sola `preparar_invitacion(…, null)` y ningún `dar_alta_centro`.
- **`lib/cuentas/altas.test.ts`** (nuevo):
  - `mensajeDeErrorDeAlta`, código por código;
  - los envoltorios llaman a la RPC con exactamente `{ p_perfil_id, p_centro_id }`.
- **`app/(app)/ajustes/invitar/formulario-invitar.test.tsx`**: se reescribe la prueba de la línea
  68, y se añaden:
  - profesional con dos casillas y sin principal → no llega a la acción y el error cuelga de
    `centroPrincipalId`;
  - gemela con principal → llega con `centrosIds` y `centroPrincipalId`;
  - cambiar de rol vacía las casillas.
- **`app/(app)/ajustes/centros/gestion-altas.test.tsx`** (nuevo):
  - «Retirar» abre el diálogo con el texto del principal cuando toca;
  - «Cancelar» devuelve el foco al botón;
  - tras el éxito, el foco está en el mensaje de estado;
  - la acción recibe `{ perfilId, centroId }`.

---

## 2 · Decisiones y alternativas descartadas

**D1 · Migración, sí.** Hay cuatro motivos, y cualquiera bastaría:

- (a) El criterio 3 pide error **desde la base** al retirar. Un `update` de un no administrador
  bajo RLS da 0 filas en silencio (`12-resto-de-tablas.sql:226`). Solo una función que lanza
  42501 da error.
- (b) La política de `update` deja al administrador reabrir o reescribir filas cerradas, y eso
  borra el rastro. La tarea 2 pide que no.
- (c) El criterio 1 pide el alta «por la ruta de la aplicación». Con una RPC, la aplicación y el
  banco ejecutan **la misma llamada SQL**. Con un `insert` por PostgREST, el banco solo podría
  imitar la ruta.
- (d) La lista cerrada de roles (D3) no se puede expresar en `with check` sin duplicar 7b en una
  política.

Descartado: «sin migración, la aplicación hace `insert`/`update` directos». No cumple ni (a) ni
(b).

**D2 · Dos RPC `security definer`, no políticas nuevas.**

- Las comprobaciones necesitan leer `perfiles.rol`, `perfiles.estado` y `centros.activo` del
  **destino**, y bloquear su fila. Una política no bloquea.
- Las políticas existentes se quedan: no hay cambio de cobertura ni riesgo de regresión en `12`.

Descartado: cerrar `insert`/`update` directos a `authenticated`. Rompe `12-resto-de-tablas.sql` y
`06`, y no gana nada que el disparador D4 no dé ya.

**D3 · Lista cerrada `in ('profesional_sanitario','administrador')`, idéntica a 7b, en las dos
RPC.**

- Así el técnico queda fuera (P1).
- Si mañana se añade un rol `director_administrativo` al enum (ADR-065), no entra sin que alguien
  edite la lista.

Descartado: `<> 'tecnico_administrativo'`. Un rol nuevo pasaría por defecto.

**D4 · Disparador «solo cierre», en vez de reescribir la política de `update`.**

- Una política no compara `old` con `new`; un disparador `before update` sí.
- Vale para todos los roles, también el administrador por PostgREST y `postgres`.

Descartado: `revoke update` y que solo la RPC cierre. Rompe `12` y `06` y la herramienta de
emergencia del administrador; el disparador ya impide lo peligroso.

**D5 · Retirar el principal no promociona otro, y la primera alta de quien no tiene principal es
principal.**

- Promocionar en silencio elegiría el centro de retención de 25 años de pacientes futuros sin que
  nadie lo decida (ADR-033).
- Sin principal, `fn_rellenar_centro_paciente` cae al único centro activo o a `null`, que es
  fallo cerrado y visible.
- La confirmación lo dice antes de hacerlo. Cambiar el principal es otro ticket (P2).

**D6 · `dar_alta_centro` es idempotente** (devuelve el id de la vigente), y `retirar_alta_centro`
**no lo es** (P0002).

- Dar dos veces no es un error del usuario.
- Retirar lo ya retirado indica que otra persona se adelantó, y conviene decirlo.

**D7 · `for update` sobre `perfiles`, no confiar solo en los índices únicos.**

- Dos altas simultáneas a un perfil sin principal darían 23505 en una de ellas.
- Con el bloqueo, la segunda ve la primera y entra como no principal. El 23505 queda solo como
  red, con su mensaje.

**D8 · La invitación conserva un único centro en los metadatos** (el principal), y el resto entra
por `dar_alta_centro` con la sesión del administrador.

- No se toca `fn_crear_perfil_de_usuario`: leer un array de `raw_user_meta_data` en un disparador
  sobre `auth.users` es más superficie, y la invitación ya es de tres pasos.
- Cada alta extra queda auditada con el administrador como actor. El alta principal, la del
  disparador, queda con actor nulo, como hoy.

**D9 · Validar todos los centros antes de enviar el correo.** Un correo enviado no se desenvía.
Un alta que falla después se recupera desde Ajustes, y el mensaje lo dice.

**D10 · El principal se elige explícitamente con dos o más centros.**

- Decide el centro de los pacientes, su retención y qué técnico los ve.
- Descartado: «el primero marcado». El orden de las casillas no es una decisión.

**D11 · El técnico no entra en esta pantalla ni en estas RPC.**

- Cambiarle centros le cambia los pacientes que lee (ADR-051). Necesita su propia fricción y su
  prueba de RLS.
- El contrato habla de «quien atiende».
- Hoy se sigue gestionando como antes: un centro al invitar.

**D12 · El administrador de la siembra recibe Madrid como principal, y solo en
`seed-completo.sql`.**

- `seed.sql` corre antes de `test:rls` y el banco no debe depender de la siembra.

**D13 · Sin guarda de segundo factor reciente.** La invitación y la baja no la tienen. Añadirla
solo aquí sería incoherente, y es una decisión de cuentas, no de este ticket.

---

## 3 · Cómo se cierra cada criterio de aceptación

### Q · Qué ve de más quien gana un alta (escrito antes de la primera alta)

Contrastado con la matriz de `docs/architecture.md` §Roles y con el código de §0.

| Recurso | Administrador con alta en X | Profesional con alta en X | ¿Cambia la matriz? |
|---|---|---|---|
| Pacientes (ficha, DNI, salud, riesgo) | Nada nuevo: ya ve «Total» la ficha y «solo los suyos» lo clínico; ninguna política suya mira centros | Nada nuevo: los suyos por `es_profesional_asignado`, sin centro (`06-centro.sql` ya lo prueba) | No |
| Notas clínicas | **Cero filas nuevas**: las políticas no miran centro ni `coprofesional_id` (ADR-072) | Igual | No |
| Agenda | Igual: «Todas» (`agenda/datos.ts` le da todos los centros activos) | El centro X aparece en su selector de agenda (lee sus pertenencias); las citas que ve siguen siendo las suyas | No |
| Alertas | Nada: la rama por centro es del técnico | Nada | No |
| Selector de centro del armazón | Aparece con dos o más altas, y la cookie `centro_activo` admite X | Igual | No (es navegación) |
| Abrir episodio sin cita | **Nuevo**: puede abrirlo en X (`episodio_para_nota` paso 8) | Igual | No (escribe en sus pacientes) |
| Coprofesional | **Nuevo**: candidato en episodios de X (7c) | Igual | No (ADR-072: no abre nada) |
| Pacientes que da de alta | Si el alta es su principal, quedan en X y el **técnico de X** los ve según su columna | Igual | No: es la columna del técnico aplicada a quien corresponde |
| Directorio | Su pertenencia es visible a todo perfil activo | Igual | No (`perfiles_centros_lectura` ya era abierta) |

Conclusión: **un alta no amplía ninguna celda de la matriz.**

- Añade dos capacidades de escritura sobre lo propio: abrir episodio y figurar como
  coprofesional.
- Decide el centro de los pacientes futuros si es principal.

El criterio 4 lo prueba para las notas. Para el resto, la ausencia de centro en las políticas no
técnicas está verificada en §0 y la cubren `02-matriz-roles.sql` y `06-centro.sql`, que no
cambian.

### Criterios

| # | Criterio | Cómo se demuestra |
|---|---|---|
| 1 | ADM con alta → coprofesional; gemela sin alta → 23514; alta por la ruta de la aplicación | Banco, sección A: `pg_temp.como(:ADM)` y `select public.dar_alta_centro(:ADM, :C41A)`, la misma RPC que llama `lib/cuentas/altas.ts`. `altas.test.ts` asevera el nombre y los parámetros exactos de esa llamada. Luego, como PRO1 con la historia desbloqueada, `assert_no_lanza` del `insert` de una nota de P41 en E41A con `coprofesional_id = ADM`. **Gemela**: la misma nota en E41B (C41B, sin alta) → `assert_lanza_codigo_msg(…, '23514', 'no tiene alta en el centro del episodio')`. |
| 2 | Profesional invitado con un centro: coprofesional allí, no en otro | Banco, sección B: emulación de `13-cuentas.sql` (`preparar_invitacion('profesional_sanitario', C41A)` como ADM; `insert into auth.users` con `raw_user_meta_data = {rol, centro_id: C41A, nombre_completo}`; `registrar_invitacion`). Se asevera que el disparador le dio **una** fila principal vigente en C41A. Nota de PRO1 en E41A con él → pasa; en E41B → 23514. Luego, como ADM, `retirar_alta_centro(:INV, :C41A)` y una nota **nueva** en E41A → 23514 (guion manual 3, en automático). La parte de varios centros (el segundo por `dar_alta_centro`) se prueba en `invitar.test.ts` (a)-(c). |
| 3 | Solo el administrador da o retira; profesional y técnico reciben error de la base | Banco, sección C: como PRO1 y como TEC1, `assert_lanza_codigo` de `dar_alta_centro` y de `retirar_alta_centro` → `42501`, y **la fila sigue igual** (contar antes y después). **Gemela**: las mismas dos llamadas como ADM no lanzan. Además, perfil inactivo con JWT (`update perfiles set estado = 'suspendido'` como postgres y luego `como`) → 42501: prueba el `is distinct from` frente al `<>`. Inserción directa por PostgREST como PRO1 → 42501 (ya en `12`, no se duplica). |
| 4 | Cero filas de `notas_clinicas_versiones` ajenas tras el alta | Banco, sección D: ADM con PIN y historia desbloqueada (patrón de `03-candado.sql`). **Antes** del alta: `contar('select * from public.notas_clinicas_versiones where autor_id <> ADM')` guardado con `\gset`. Después de `dar_alta_centro(:ADM, :C41A)` y de firmar la nota de PRO1 en E41A **con ADM como coprofesional**: el mismo recuento es **igual al de antes** (el alta no añade ninguna), y el recuento restringido a P41 (`… where paciente_id = :P41`, paciente de PRO1 que no es de ADM) **es 0**, con la versión de la nota de coterapia incluida. El recuento global no se exige en 0: la fijación del banco puede asignar a ADM pacientes con notas de otros, que ve por `es_profesional_asignado` y no por el alta. **Gemela** (que la consulta muerde): PRO1, desbloqueado, ve 1 fila de esa versión. Y ADM ve la suya propia si firma una nota en un paciente suyo. |
| 5 | Manual: con la siembra, Ana ve al administrador en el selector en Madrid | Guion: `npx supabase db reset && npm run seed && npm run dev`; entrar como Ana; abrir una nota nueva en un episodio de Madrid; el selector de coprofesional ofrece a «Álvaro Administrador». Captura y salida de `select principal, hasta from perfiles_centros where id = 'a0080008-0000-4000-8000-000000000002'` en `evidencia.json`. |
| 6 | Manual: `/ajustes` enseña la gestión solo al administrador | Guion con los tres roles de la siembra. Solo el administrador ve el enlace «Altas de centro». Navegar a `/ajustes/centros` como profesional y como técnico redirige a `/ajustes`. Captura de cada uno. |
| 7 | lint, build, `test:rls` verdes | `npm run lint && npm run build`, `npx supabase db reset && npm run test:rls` y `npm test`, con la salida real en `evidencia.json`. |

**Pruebas del disparador D4** (banco, sección E; no hay criterio propio, pero sostienen la tarea
2 «nunca borrar el rastro»):

- ADM cierra con `retirar_alta_centro`. Luego, como ADM por PostgREST,
  `update perfiles_centros set hasta = null where id = <cerrada>` → 42501, y la fila sigue
  cerrada.
- `update … set centro_id = :C41B where id = <vigente>` → 42501.
- `update … set desde = desde - 1 where id = <vigente>` → 42501.
- **Gemela**: `update … set principal = false` en una vigente pasa.
- `delete from perfiles_centros where id = …` como ADM → 42501, por falta de `grant delete`.
  Se prueba para que nadie añada el `grant` sin verlo.
- Tras retirar, existe exactamente una fila del par con `hasta = current_date`, y
  `auditoria` tiene un `UPDATE` de `perfiles_centros` con `actor_id = ADM`.

**Resto de casos de las RPC** (banco, sección F):

- destino técnico → 22023 en las dos RPC;
- perfil suspendido → 23514;
- centro inexistente → 23503;
- C41Z inactivo → 23514;
- dar dos veces → mismo id y una sola fila vigente;
- retirar sin alta vigente → P0002;
- primera alta de quien no tiene principal → `principal = true`, y `perfiles.centro_id` lo
  refleja (espejo);
- segunda alta → `principal = false`;
- retirar el principal → `perfiles.centro_id` es `null` y la otra alta sigue vigente y **no**
  principal (D5).

**Alarma ADR-065** (banco, sección G):

- Asevera que la lista de columnas de `public.perfiles` en `information_schema.columns` es
  exactamente la de hoy. El implementador la copia de la base tras `db reset`, no de memoria.
- Mensaje: «ADR-065: si añades una marca de función a perfiles (director administrativo),
  exclúyela en 7b de fn_exigir_episodio_coherente_en_nota y en dar_alta_centro antes de tocar
  este assert».
- Con `pg_get_functiondef('public.dar_alta_centro(uuid,uuid)'::regprocedure)`, asevera que
  contiene `in ('profesional_sanitario', 'administrador')`. Mismo patrón que 19.62 con 7b.

---

## 4 · Riesgos, por probabilidad

1. **ALTA · R1 — Las pruebas de la invitación existentes se rompen** al quitar `centroId` (prueba
   de la línea 68 y la de la línea 63). Es esperado: se reescriben, no se borran. El revisor
   comprueba que la gemela del técnico sigue y exige un solo centro.
2. **ALTA · R2 — Sello o número de banco ocupado** al implementar (T-038 y T-040 van antes). Se
   comprueba con `ls`, y el sello va siempre después del último.
3. **MEDIA · R3 — Retirar el alta no quita a la persona de un borrador que ya la tenía como
   coprofesional.**
   - 7c solo se evalúa si el coprofesional cambia, así que ese borrador se firma igual.
   - No rompe ADR-072, porque el coprofesional no da acceso. Pero deja una nota sellada con un
     coprofesional sin alta ese día.
   - No entra (contrato: 7c no cambia). Se anota en `state.md` como hallazgo para el dueño de
     T-035.
4. **MEDIA · R4 — Retirar el principal deja sin centro a los pacientes futuros** de esa persona
   (o el único activo).
   - La confirmación lo dice. Hoy no hay pantalla para cambiar el principal.
   - Si el propietario quiere promoción automática, es P2.
5. **MEDIA · R5 — `episodio_para_nota` se abre a más gente**: un administrador con alta puede
   abrir episodios sin cita en X. Es lo que pide la coterapia y escribe solo en lo suyo, pero es
   una capacidad nueva. Queda escrita en Q y en `architecture.md`.
6. **BAJA · R6 — Desfase de fechas**: el armazón y la agenda tratan como vigente una fila con
   `hasta = hoy`, mientras la base y el selector de coprofesional no.
   - El día del cierre, el centro aún aparece en el selector del armazón; `elegirCentro` lo
     aceptaría y `episodio_para_nota` lo rechazaría con 42501.
   - Previo a este ticket; va a `state.md`.
7. **BAJA · R7 — Inserción directa** por PostgREST de un administrador con `principal = true`
   sobre un técnico, o cualquier rol: sigue permitida por la política existente. No borra rastro
   (es una fila nueva y auditada); se deja.
8. **BAJA · R8 — Auditoría del alta principal de la invitación con actor nulo** (la inserta el
   disparador sobre `auth.users`). Es como hoy; el `CUENTA_INVITADA` de `registrar_invitacion`
   la acompaña.

---

## 5 · Qué revisar

**Qué elige el llamante, y qué efecto tiene.**

- `dar_alta_centro(p_perfil_id, p_centro_id)`: los dos parámetros los elige el cliente.
  - Que un perfil técnico dé 22023.
  - Que un perfil suspendido o de baja dé 23514.
  - Que un centro inactivo dé 23514.
  - Que **no exista** parámetro `p_principal`. La marca la decide la función, nunca el
    llamante.
- `retirar_alta_centro`: que no cierre filas de otro par. El `where` lleva `perfil_id`,
  `centro_id` y `hasta is null`.
- `invitarPerfil`: `centroPrincipalId` lo elige el cliente.
  - Que el `refine` 3 lo obligue a estar en `centrosIds`.
  - Que el `centro_id` de los metadatos sea **ese** y no `centrosIds[0]`.

**Qué prueba debe fallar, y con qué motivo exacto.**

- Gemela del criterio 1: 23514 **con** el texto «no tiene alta en el centro del episodio». No vale
  un 23514 cualquiera: 7b también da 23514.
- Criterio 3:
  - Debe ser 42501, y la fila no debe cambiar.
  - Si alguien escribe `<>` en vez de `is distinct from`, la prueba del perfil suspendido debe
    fallar. Mutante: cambiarlo y ver el banco rojo.
- Criterio 4: el recuento global igual al de antes **y** el de P41 en 0. La gemela de PRO1 viendo su versión
  prueba que la consulta no da 0 por estar mal escrita.
- Disparador D4, con un mutante por cada comprobación: quitar `old.hasta is not null` deja pasar
  la reapertura, y quitar `centro_id` del cotejo deja pasar el cambio de centro.
- Lista cerrada D3, mutante: cambiarla a `<> 'tecnico_administrativo'`. La sección G debe fallar.

**Invariantes que se podrían saltar por otra puerta.**

- **Null**:
  - `rol_actual()` nulo (perfil no activo) debe dar 42501, no pasar.
  - `p_centro_id` nulo: 23503 por «no existe». Comprobar que no se inserta un `centro_id` nulo:
    la columna es `not null`, y el revisor lo confirma en la migración de 0829.
- **Duplicados**: dar dos veces → una fila vigente (D6). Dos sesiones a la vez → `for update`
  (D7). El índice `una_vigente_por_par` sigue de red.
- **Concurrencia de principal**: dos primeras altas simultáneas a un perfil sin principal. Con
  el bloqueo, una principal y otra no. Sin el bloqueo, 23505 con el mensaje de P5.
- **Permisos de tabla entera**:
  - que la migración **no** añada `grant delete` ni `grant truncate` a `authenticated`;
  - que las funciones tengan `revoke … from public, anon`;
  - que `search_path = ''` lleve todo cualificado con `public.`.
- **TRUNCATE**: `authenticated` no tiene `truncate`. `postgres` sí, y ningún disparador `before
  update` lo para. Es aceptable porque `postgres` no es un rol de la aplicación, y lo mismo pasa
  con `delete` como `postgres`. No se añade disparador de `truncate`, porque `perfiles_centros`
  no está en la invariante 6 (no es clínica ni económica). El revisor que no esté de acuerdo lo
  eleva; no se resuelve en silencio.
- **Coprofesional por la puerta del alta**: que nada en este ticket toque
  `fn_exigir_episodio_coherente_en_nota`. Se comprueba con `git diff` sobre
  `supabase/migrations/`: un solo fichero nuevo.
- **Director administrativo (H2)**: que `dar_alta_centro` use la misma lista cerrada que 7b, y
  que la alarma G exista. No se resuelve H2.
- **Clave de servicio**: que `dar_alta_centro` se llame con `sesion.supabase` y **nunca** con
  `crearClienteAdministracion()`. Con la clave de servicio, `rol_actual()` sería nulo y daría
  42501, pero además es la regla del proyecto. Lo prueba `invitar.test.ts` (a).
- **Interfaz**:
  - `/ajustes/centros` redirige a quien no es administrador **en servidor**, no solo ocultando el
    enlace;
  - la lista no muestra técnicos;
  - la confirmación dice qué cambia, con «principal» en texto;
  - objetivos de 44 px a 360 px (ADR-044).
- **Memoria**: la bitácora de T-041 y `state.md`, reescrito, con los hallazgos R3 y R6, el `<>`
  no seguro con `null` de las funciones de cuentas y el cierre de T-035 B-H1.

---

## 6 · Territorio

Definitivo. Sustituye al provisional del contrato.

```yaml
territorio:
  - supabase/migrations/20261010120000_altas_de_centro.sql   # o el sello libre siguiente; un solo fichero
  - supabase/seed-completo.sql
  - scripts/rls/25-altas-de-centro.sql                       # o el número libre siguiente
  - scripts/rls/README.md
  - lib/supabase/tipos-bd.ts                                 # solo `npm run tipos`
  - lib/cuentas/**
  - lib/i18n/es.ts
  - app/(app)/ajustes/**
  - docs/architecture.md
  - docs/interfaz.md
  - docs/state.md
  - docs/bitacora/T-041.md
```

Sale del territorio provisional:

- `supabase/seed.sql`, por D12;
- `scripts/rls/11-cobertura.sql`, porque no hay políticas nuevas;
- `accesibilidad/**`, porque el foco del diálogo se prueba en jsdom (P12) y los dos criterios
  manuales no piden un spec de Playwright.

---

## 7 · Delegable

Casi nada.

- Las claves de `lib/i18n/es.ts` (P8) son texto y no tienen comportamiento. Pero son pocas, y el
  implementador las necesita para escribir las pruebas: no compensa el viaje.
- Todo lo demás es de la fábrica: RLS, la RPC, la invitación con varios pasos y el diálogo con
  foco (regla de `pipeline.md`).

**`delegable: no`.**

---

## Lo que no entra, y por qué

- **Cambiar el centro principal** de un perfil existente: decide la retención de los pacientes
  futuros (ADR-033) y merece su propia confirmación. Es P2.
- **Altas y cierres del técnico** desde esta pantalla: le cambian los pacientes que lee y necesitan
  la fricción de ADR-051 con recuento. Es P1.
- **Resolver H2 de T-035** (director administrativo como marca o como rol): solo se deja la lista
  cerrada y la alarma G.
- **Volver a evaluar 7c al firmar** (R3): el contrato dice que 7c no cambia.
- **Arreglar `<>` frente a `is distinct from`** en `preparar_invitacion`, `registrar_invitacion` y
  `dar_de_baja_perfil`: es otro ticket de cuentas. Se anota.
- **Igualar las fechas del armazón y la agenda con `hasta is null`** (R6): es previo y no es de
  este territorio (`components/**`).
- **Elegir el centro del paciente en su alta**: otra pantalla y otro ticket.
- **Segundo factor reciente para las acciones de administración** (D13).

---

## Preguntas para el propietario

**P1 · ¿El técnico administrativo queda fuera de esta pantalla de altas?**

- Recomendación: **sí**.
- Esta pantalla es para quien atiende. Cambiar los centros de un técnico le cambia los pacientes
  que puede leer (ADR-051) y debería enseñar cuántos son antes de confirmar. Eso es otro ticket.
- Mientras tanto, el técnico sigue entrando con un centro al invitarle, como hoy.

**P2 · Centro principal.**

- **(a)** ¿La primera alta de alguien sin centro principal pasa a ser la principal?
  - Recomendación: **sí**. Los pacientes que dé de alta tienen que quedar en algún centro, y la
    confirmación lo avisa.
- **(b)** Si se retira el centro principal y quedan otros, ¿se elige otro automáticamente?
  - Recomendación: **no**.
  - El principal decide en qué centro quedan sus pacientes futuros, cuánto tiempo se guarda su
    historia y qué recepción los ve.
  - La pantalla avisa y queda sin principal hasta que un ticket posterior permita elegirlo.

**P3 · En la siembra de demostración, el centro de Madrid del administrador, ¿es su principal?**

- Recomendación: **sí**.
- No tiene pacientes, así que no cambia el centro de nadie.
- Es lo que pasaría en una instalación real con su primera alta.

---

## Resumen (para el gate)

1. Se construyen dos funciones en la base, `dar_alta_centro` y `retirar_alta_centro`, más un
   disparador que congela las altas cerradas. La migración es `20261010120000`.
2. La invitación permite elegir varios centros y cuál es el principal.
3. Nueva pantalla `/ajustes/centros`, solo para el administrador, para dar y retirar altas con
   confirmación.
4. La siembra da al administrador Madrid como principal. Es el banco 25 de RLS.
5. Decisión 1: hace falta migración. Sin ella, retirar no da error para quien no es administrador,
   y un administrador puede reabrir o reescribir filas cerradas.
6. Decisión 2: la lista de roles es cerrada (`profesional_sanitario`, `administrador`), la misma
   que la regla 7b. Deja fuera al técnico y a un futuro director administrativo, con una alarma
   ADR-065.
7. Decisión 3: el principal nunca lo elige el llamante ni se promociona solo, porque decide el
   centro y la retención de los pacientes futuros.
8. Un alta no amplía ninguna celda de la matriz de permisos. Añade dos capacidades: ser
   coprofesional y abrir episodios sin cita en ese centro.
9. Revisar con más cuidado: `is distinct from` frente a `<>`, las gemelas 23514 con su texto
   exacto, el recuento cero de notas ajenas y las versiones mutadas del disparador.
10. Revisar también que la llamada a `dar_alta_centro` nunca use la clave de servicio. Quedan
    abiertas P1-P3 para el propietario, y R3 (7c no se vuelve a comprobar al firmar) va a
    `state.md`.

## Decisiones del propietario (02-10-2026)

| Pregunta | Respuesta |
|---|---|
| P1 | **El técnico administrativo queda fuera** de `/ajustes/centros`; sus centros se siguen fijando al invitarlo. |
| P2a | **Sí**: la primera alta de alguien sin centro principal pasa a ser la principal. |
| P2b | **No** se reasigna solo: al retirar el principal con otras altas vigentes, la pantalla avisa y el principal lo elige una persona. |
| P3 | **Sí**: en la siembra, el administrador tiene Madrid como principal. |

Las cuatro coinciden con la recomendación: el diseño queda como está. Cola de `supabase/`: tras T-040.
