# T-012 · Nota clínica — borrador, firma y versión sellada · Diseño

**Fecha**: 15-09-2026 · **Riesgo**: alto (`modelo: opus`) · **Arquitecto**: fábrica (Opus 5)

Leído para escribir esto: el contrato entero; `docs/architecture.md` §Invariantes 1-3 y
§Reserva de anotaciones subjetivas; ADR 026, 027, 030, 035, 036, 037, 043, 044, 046, 056 y
**057**; `docs/state.md` (80 líneas); `docs/bitacora/T-013.md` y `T-013a.md`;
`docs/interfaz.md` §Pacientes y choques 11 y 12; y los ficheros de código citados en §0.

---

## B1 · RESUELTO por el propietario el 15-09-2026: **B1-a**

> La ruta existe y **no pinta nada al cargarse**. El contenido llega por
> `abrirEditorDeNota()`, que registra el acceso y fija `abierta_en`. La enmienda está
> escrita en el [ADR-058](../../docs/decisions/ADR-058.md), que acota la excepción a la
> nota de sesión y deja el ADR-056 vigente para todo lo demás. El corte B se diseña
> sobre esta salida; queda abajo el planteamiento tal y como se elevó.


**B1 · La ruta `/pacientes/<uuid>/historia/notas?cita=<uuid>` contradice de frente al ADR-056.**

El contrato (tarea «Entrada desde dos sitios, una sola ruta») pide esa ruta. El ADR-056,
aceptado el **15-09-2026** —después de escribirse el contrato— decide lo contrario con estas
palabras: «**La pestaña activa es estado de cliente, no de URL**» y, como consecuencia
explícita, «`?p=historia` **no se puede marcar ni compartir** […] un enlace a la historia de
alguien es exactamente lo que no queremos que circule por un chat». El choque 11 de
`docs/interfaz.md` remata: «la historia clínica tiene dos puertas y solo puede tener una»,
porque dos puertas son dos sitios donde poner el candado y **así es como se olvida uno**.

Un ADR es ley, así que no diseño la ruta esquivando el ADR. Las dos salidas son:

| | Qué se hace | Qué se paga |
|---|---|---|
| **B1-a** (recomendada) | La ruta existe, pero **no pinta nada al cargar**: el `page.tsx` es armazón estático (cabecera no clínica + botón «Abrir el editor»); el contenido llega por `abrirEditorDeNota()`, que registra el acceso y fija `abierta_en`. Se escribe un **ADR-058 que enmienda al 056** acotando la excepción y dejando escritas las tres propiedades que se conservan. | Un ADR nuevo y un gesto explícito al llegar desde el calendario. El gesto **no es fricción inventada**: es el mismo que el contrato ya exige para fijar `abierta_en`. |
| **B1-b** | Se cae la ruta. El editor vive dentro de la sub-pestaña Notas de la ficha (estado de cliente, ADR-056 intacto) y el calendario enlaza `/pacientes/<uuid>` a secas. | Se incumple una tarea del contrato y desde el calendario hacen falta tres gestos: abrir ficha → Historia → Notas. |

**Recomendación**: B1-a. Conserva literalmente las tres propiedades por las que existe el
ADR-056 —(1) aparecer en pantalla ⟺ existir la fila de acceso, (2) sin desbloqueo no se lee
nada, (3) una pantalla recargada no reabre la historia sola— y le quita a la URL lo único que
el ADR le reprocha: pintar contenido clínico por el mero hecho de cargarse.

**Esto solo bloquea el corte B.** El corte previo (§8) y el corte A no dependen de ello:
ninguna de sus piezas conoce la ruta.

---

## 0 · Hechos verificados contra el código

Todo lo de abajo está leído, no recordado. Ruta y línea cuando importa.

### El sobre y la cadena

1. `lib/huella/sobre.ts` — `ESQUEMA_VERSION = 2`, `ALGORITMO_VERSION = 1`, `esquemaSobre`
   es un `z.object({…}).strict()` con **once** claves. `EntradaFirma` **ya recibe
   `alcance: 'individual' | 'conjunta'`** y `construirSobre()` **no lo usa**: se queda por el
   camino, tal como dice el ADR-057.
2. `construirSobre()` impone el orden `normalizarNfc → esquemaSobre.parse → canonizar`, fuerza
   `firmada_en === creada_en`, `autor_id.toLowerCase()`, y anula margen y ventana cuando
   `cita_id === null`.
3. `lib/huella/sesion.ts` — `calcularRedactadaEnSesion()` es pura: cierto si y solo si hay
   ventana **y** margen y `abiertaEn >= inicio - margen` y `firmadaEn <= fin + margen`.
4. `lib/huella/firmar.ts` — `firmarVersionNota(cliente, entrada)` construye el sobre, canoniza,
   y hace **un solo `insert`** con `nota_id, cuerpo, anotaciones_reservadas,
   contenido_canonico, motivo_cambio, alcance, esquema_version, autor_id, creada_en`. No manda
   `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` ni `numero_version`. **No
   importa `node:crypto`**; el SHA-256 es de pgcrypto, en la base.
5. `supabase/migrations/20260829210000_cadena_de_huellas.sql` — `fn_sellar_version_nota()`,
   `security definer`, `before insert`: guarda 1 (columnas calculadas a mano → 42501), guarda
   1.bis (`algoritmo_version <> 1` → 42501), cerrojo consultivo por paciente, encadenado, y
   **comprobaciones 6.1 a 6.9** (23514). `v_esperadas` es un `text[]` de **once** literales y
   se compara con `array_agg(k order by k)` sobre `json_object_keys(new.contenido_canonico::json)`
   —`::json`, no `::jsonb`, para que una clave repetida dé doce elementos y salte.
6. `lib/huella/vectores-congelados.json` — **ocho** vectores, todos con `"esquema_version":2`.
   `vectores.test.ts` recalcula la huella desde `canonico`; `vectores-sql.test.ts` exige que los
   **tres** pares literales `$vec$…$vec$` de `scripts/rls/14-cadena-huellas.sql` estén idénticos
   en el JSON.
7. `scripts/rls/00-ayudantes.sql:146` — `pg_temp.sobre_prueba(...)` escribe el sobre a mano con
   `'"esquema_version":2,'` literal. Sus llamantes: `01-fijacion.sql` (4, una con
   `alcance = 'conjunta'`), `04-baja.sql` (1), `14-cadena-huellas.sql` (≈12).
   `supabase/seed-completo.sql:57` y `scripts/t005-concurrencia.sql:76` tienen **su propia copia**
   del mismo generador.

### Las dos tablas

8. `notas_clinicas` (`20260822094547:618`): `id, paciente_id, episodio_id, autor_id,
   fecha_sesion, borrador_contenido jsonb, borrador_actualizado_en timestamptz,
   borrador_autor_id, creada_en`, más `cita_id` añadida en `20260906120000:399`. Restricción
   `check (num_nonnulls(borrador_contenido, borrador_actualizado_en, borrador_autor_id) in (0,3))`.
   **No hay columna `estado`**, y el comentario de la tabla dice que es deliberado.
   **No hay ninguna columna donde viva `abierta_en`.**
9. `notas_clinicas_versiones` (`20260822094547:648`): `id, nota_id, numero_version, cuerpo text,
   anotaciones_reservadas text, contenido_canonico text, huella bytea(32), huella_anterior
   bytea(32), algoritmo_version, esquema_version, motivo_cambio, alcance, autor_id, creada_en`,
   más `paciente_id` y `posicion_cadena` (T-005). **No existen aquí `cita_id`, `abierta_en`,
   `firmada_en`, `redactada_en_sesion` ni `margen_sesion_minutos`**: esos cinco viven
   *únicamente dentro del sobre*, en `contenido_canonico`. El sello que la pantalla enseña hay
   que sacarlo de ahí, parseando; no hay columna que consultar.
10. `check (numero_version = 1 or (motivo_cambio is not null and length(trim(motivo_cambio)) > 0))`
    — el «modificar exige motivo» ya está en la base, no hay que inventarlo.
11. `fn_tocar_borrador()` (`20260822094547:1252`), `before insert or update`: pone
    `borrador_actualizado_en := now()` cuando `borrador_contenido` cambia, y limpia las tres
    columnas si el borrador pasa a nulo. **El testigo lo fija la base, nunca el cliente.**
12. `fn_congelar_cabecera_sellada()` redefinida en `20260906120000:405`: en cuanto existe una
    versión, `paciente_id`, `fecha_sesion`, `autor_id`, `episodio_id` y `cita_id` quedan
    congelados (42501). El disparador es `before update of <esas cinco>`, así que un `update`
    que solo toque columnas de borrador **no lo dispara**.
13. Solo adición en tres capas: `revoke update, delete … from public, anon, authenticated,
    service_role, postgres` (`20260829150000:395`), disparador `before update or delete` por fila
    y `before truncate` por sentencia (`20260822094547:1436`).

### RLS y candado

14. `notas_clinicas_modificacion`: `historia_desbloqueada() and autor_id = auth.uid()`, en
    `using` y en `with check`. El borrador solo lo escribe **el autor de la cabecera**, y solo con
    el candado abierto. `notas_clinicas_versiones_alta`: candado + `autor_id = auth.uid()` +
    `exists(notas_clinicas n where n.id = nota_id and n.autor_id = auth.uid())`.
15. `notas_clinicas_versiones_lectura` abre la versión a los profesionales del episodio cuando
    `alcance = 'conjunta'` — es la política que el ADR-057 pone dentro del sobre.
16. `registrar_acceso_historia(paciente, pestaña, agente, ip)` (`20260915120000`) es **solo para
    `tipo = 'apertura'`** y levanta 42501 sin desbloqueo vigente. `lib/cuentas/accesos.ts` la
    envuelve y devuelve `{ok, accesoId, vistas, apertura}`; nunca lanza.
17. `accesos_historia_alta` permite `desbloqueo_id is null` para los tipos que no salen del
    candado, y `authenticated` tiene `grant select, insert` sobre la tabla: **una exportación se
    registra con un `insert` directo desde la Server Action**, sin función nueva.
18. `app/(app)/pacientes/[id]/acciones.ts` — `abrirPestanaDeHistoria(pacienteId, pestana)` valida
    con Zod, registra el acceso y **solo si el registro salió bien** lee; para
    `pestana !== 'historial_clinico'` devuelve `historial: null`. Ese es el hueco de este ticket.
19. `panel-historia.tsx` — cliente, con la sub-pestaña `notas_clinicas` cayendo hoy en
    `<EnPreparacion/>`; el reloj del candado cierra con `setApertura(null)`.

### Contexto del sello

20. `citas` tiene `inicio`, `fin`, `estado`, `centro_id` (nulable), `profesional_id`.
21. **No existe ninguna columna de margen de sesión en ninguna tabla** (`grep margen` sobre
    `supabase/migrations/` solo devuelve comentarios de T-005). El ADR-046 exige que el margen sea
    «configurable por centro»: hay que crearlo.
22. `organizacion` ya tiene el patrón exacto a copiar: `minutos_desbloqueo_historia smallint not
    null default 15 check (between 1 and 60)`, y `centros.zona_horaria` es nulable con el
    significado «hereda la de la organización». Las dos tablas las lee cualquier `authenticated`
    (`organizacion_lectura`, `centros_lectura`).
23. `fn_alertar_nota_sin_firmar()` (`20260906120000:451`) abre la alerta al pasar la cita a
    `realizada` sin versión firmada. `alertas_documentacion` tiene `estado` y `resuelta_en`;
    **nada la resuelve hoy al firmar**.
24. `app/layout.tsx:28` exporta ya un `viewport: Viewport` (con `themeColor`), y
    `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md:135`
    confirma que `interactiveWidget` es una clave válida de ese objeto en Next 16.
25. `components/ui/piezas.tsx` exporta `Tarjeta, Metrica, FilaConAvatar, Pildora,
    BarraDeProgreso, FranjaDeColor, EncabezadoDeModulo, PanelLateral, EstadoVacio, Cargando,
    AvisoDeError`. No hay editor, ni área de texto, ni `<textarea>` primitivo: **no existe
    ninguna primitiva que este ticket pueda reutilizar para el editor**.

26. `git show 2fddabd --stat` — el commit que acepta el ADR-057 toca **solo tres ficheros de
    `docs/`** y su mensaje lo dice: «Solo la decision: el codigo y la migracion van con su
    ticket». Es decir: el sobre de doce claves **no está implementado en ninguna parte**, y el
    propietario ya dejó escrito que su código viaja en un ticket, no suelto. §2.1 se apoya en
    esto.

---

## 1 · Piezas y contratos

### 1.1 · El sobre de diecisiete claves (era 4: ADR-057, ADR-067, ADR-071, ADR-072)

> Enmienda del 29-09-2026 (ADR-071.6). Sustituye la versión de doce claves de esta sección. La
> escribe el arquitecto de T-012c: su diseño, `tickets/T-012c/diseno.md` §9, es la referencia
> de la forma, del disparador y de las pruebas. Donde esta sección choque con §1.5 (pasos 4 y
> 8), con §1.4 (línea «`esquema_version` no es 3») o con el punto 2 del Resumen, **manda esta
> sección**.

**Quién implementa qué.**
- La era 3 (doce claves, `alcance`) la dejó hecha T-012a
  (`supabase/migrations/20260915130000_alcance_en_el_sobre.sql`).
- La era 4 la implementa **T-012c**, que depende de T-034: `notas_clinicas.episodio_id` pasa a
  obligatorio y aparece la columna `coprofesional_id`.
- T-012 **no toca** `lib/huella/**`, la migración del sello ni los generadores del banco. Consume
  `firmarVersionNota` tal como la deja T-012c, y va después de T-012c.

**Forma exacta**, en el orden que produce JCS:

```json
{"abierta_en":"…Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"…","cita_id":null,"coprofesional_id":null,"creada_en":"…Z","cuerpo":{…},"episodio_id":"…","esquema_version":4,"fecha_sesion":"AAAA-MM-DD","firmada_en":"…Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"…","paciente_id":"…","redactada_en_sesion":false}
```

Las cinco claves nuevas:

| Clave | Valor | Nulable | Sale de |
|---|---|---|---|
| `nota_id` | UUID en minúsculas | no | la nota que se firma |
| `paciente_id` | UUID en minúsculas | no | `notas_clinicas.paciente_id` |
| `episodio_id` | UUID en minúsculas | **no** (ADR-071.1 y .4) | `notas_clinicas.episodio_id` |
| `fecha_sesion` | cadena `AAAA-MM-DD`, sin hora ni zona | no | `notas_clinicas.fecha_sesion`, tal como la devuelve PostgREST |
| `coprofesional_id` | UUID en minúsculas o `null`; la clave está siempre | **sí** (ADR-072.2 y .3) | `notas_clinicas.coprofesional_id` |

**Lo que cambia en T-012.**

1. **Paso 4 de §1.5.** El `select` de la cabecera añade `fecha_sesion` y `coprofesional_id`.
   Queda así:
   `id, paciente_id, cita_id, episodio_id, autor_id, fecha_sesion, coprofesional_id, borrador_contenido, borrador_actualizado_en, borrador_abierta_en`.
2. **Paso 8 de §1.5.** La llamada pasa cuatro campos más, **leídos de esa cabecera y nunca del
   formulario**:
   ```ts
   firmarVersionNota(supabase, {
     notaId, autorId: usuario.id, cuerpo, anotacionesReservadas, motivoCambio, alcance,
     citaId, ventanaCita, margenMinutos, abiertaEn: cabecera.borrador_abierta_en,
     pacienteId: cabecera.paciente_id,
     episodioId: cabecera.episodio_id,
     fechaSesion: cabecera.fecha_sesion,          // 'AAAA-MM-DD', string, nunca new Date()
     coprofesionalId: cabecera.coprofesional_id,  // string | null
   })
   ```
   El tipo `EntradaFirma` los hace obligatorios, así que olvidar uno es un error de `tsc`.
3. **Episodio y coprofesional se eligen en el editor** y se escriben en la cabecera **antes** de
   la primera firma:
   - El episodio sale de la función de T-034 (`episodio_para_nota()`). El paso 4 de
     `abrirEditorDeNota` (§1.4) ya no inserta un `episodio_id` libre.
   - El coprofesional sale de la casilla que pinta T-012 (ADR-072).
   - Tras la primera versión, los dos quedan congelados junto con el paciente, la fecha de
     sesión, el autor y la cita. `congelar_cabecera_sellada` responde 42501 con «no se puede
     reatribuir». La pantalla deja de ofrecer los dos controles en cuanto hay una versión.
4. **Errores del sellado que hay que traducir**, además de los de §1.5:
   - **42501 «No puedes firmar una versión de esta nota»**: es el paso 0 del disparador, que
     comprueba permisos antes que cotejo (ADR-071.5). Significa lo mismo que el rechazo de la
     RLS: no eres el autor o el candado está cerrado. El mensaje no revela nada de la cabecera.
     Se desambigua con la misma relectura de la tabla «Desambiguar las cero filas» de §1.5:
     - sin fila: `{ok:false, motivo:'sin_acceso'}`, pantalla de bloqueo y PIN;
     - fila de otro autor: «Esta nota la escribe su autor».
   - **23514 de las comprobaciones 6.11-6.16** (`nota_id`, `paciente_id`, `episodio_id`,
     `autor_id`, `fecha_sesion`, `coprofesional_id` no coinciden con la cabecera): la cabecera
     cambió entre el paso 4 y la firma, antes de estar congelada. Se trata como
     `{ok:false, motivo:'conflicto'}`: releer y volver a pedir la firma. No se reintenta en
     silencio.
5. **Sello en pantalla (§1.4, línea «si el parseo falla o `esquema_version` no es 3»).** Pasa a
   «no es 4». El parseo usa el `esquemaSobre` de diecisiete claves que exporta `sobre.ts`.
6. **Resumen, punto 2.** Donde dice «sobre de doce claves con `alcance`, `esquema_version = 3`»,
   se lee «sobre de diecisiete claves, `esquema_version = 4`, implementado por T-012a (era 3) y
   T-012c (era 4); T-012 lo consume».

**Por qué se sellan.**
- `nota_id`, `paciente_id` y `episodio_id` deciden quién lee la versión.
- `autor_id` decide quién la firmó.
- `fecha_sesion` sitúa el acto clínico.
- `coprofesional_id` dice quién más estuvo en la sala.

El disparador los coteja con la cabecera al sellar (23514), y `verificar_cadena_huellas()` los
vuelve a cotejar después. Si alguien mueve una versión o reatribuye una cabecera saltándose la
congelación, la cadena lo señala aunque las huellas sigan cuadrando.

### 1.2 · Migración de T-012: `abierta_en` y el margen

Fichero único `supabase/migrations/2026MMDDHHMMSS_nota_clinica_borrador_firma.sql`, en este
orden (el orden es el diseño; ver §4):

1. **`notas_clinicas.borrador_abierta_en timestamptz`**, nulable.
   *Por qué columna y no una clave dentro de `borrador_contenido`*: `abierta_en` es la mitad de
   `redactada_en_sesion`, y `authenticated` tiene `grant update` **de tabla entera** sobre
   `notas_clinicas`. Una `abierta_en` dentro del JSON del borrador la puede escribir el cliente
   por PostgREST sin pasar por la Server Action, y entonces la casilla que el ADR-046 prohíbe
   vuelve a existir por la puerta de atrás. En columna propia, escrita **solo** por disparador,
   no la elige nadie.
2. **Relleno**, antes de cualquier restricción:
   `update public.notas_clinicas set borrador_abierta_en = borrador_actualizado_en where borrador_contenido is not null;`
   (no dispara `congelar_cabecera_sellada`: su `update of` no incluye esta columna; tampoco
   mueve el testigo, porque `fn_tocar_borrador` solo lo toca si cambia `borrador_contenido`).
3. `alter table … add constraint notas_clinicas_borrador_abierta_ck check ((borrador_abierta_en is null) = (borrador_contenido is null));`
4. `create or replace function public.fn_tocar_borrador()` — misma función, tres líneas más:

```sql
  if new.borrador_contenido is null then
    new.borrador_actualizado_en := null;
    new.borrador_autor_id := null;
    new.borrador_abierta_en := null;                 -- descartar o firmar cierra la ventana
  else
    -- Se ignora SIEMPRE lo que mande el llamante: primera vez `now()`, después la que
    -- ya había. Es lo que hace que `redactada_en_sesion` no se pueda fingir (ADR-046).
    new.borrador_abierta_en := coalesce(
      case when TG_OP = 'UPDATE' then old.borrador_abierta_en end, now());
    if TG_OP = 'INSERT' or new.borrador_contenido is distinct from old.borrador_contenido then
      new.borrador_actualizado_en := now();
    end if;
  end if;
```

5. **`fn_vaciar_borrador_al_firmar()`**, `after insert on notas_clinicas_versiones for each row`,
   **`security invoker`**: `update public.notas_clinicas set borrador_contenido = null,
   borrador_actualizado_en = null, borrador_autor_id = null, borrador_abierta_en = null where id = new.nota_id;`
   *Por qué en la base y no en la acción*: «el borrador se vacía» (ADR-036) tiene que ocurrir en
   **la misma transacción** que la firma. Dos sentencias desde PostgREST no son una transacción:
   entre el `insert` y el `update` cabe un fallo de red, y lo que queda es una versión firmada
   con un borrador vivo cuyo `abierta_en` es el de la versión anterior — es decir, la siguiente
   firma mentiría sobre `redactada_en_sesion`. *Por qué invoker y no definer*: quien inserta la
   versión es, por `notas_clinicas_versiones_alta`, el autor de la cabecera y tiene el candado
   abierto, que es exactamente lo que `notas_clinicas_modificacion` exige. No hace falta ningún
   privilegio extra, y si algún día la política cambiara, esto **debe** fallar en voz alta en vez
   de saltársela.
6. **`organizacion.margen_sesion_minutos smallint not null default 15 check (between 0 and 120)`**
   — los **15 minutos por defecto los confirma el propietario el 15-09-2026**: «escrita en sesión»
   significa durante la cita o en el hueco hasta el paciente siguiente, y es el mismo número que la
   ventana del candado del ADR-026, de modo que la aplicación no maneja dos relojes distintos con
   el mismo aspecto. Quien escriba al final de la mañana verá `false`, y eso es lo que el sello
   tiene que decir.
   y **`centros.margen_sesion_minutos smallint check (between 0 and 120)`** (nulable = hereda,
   igual que `zona_horaria`). Con sus `comment on column` citando el ADR-046.
7. **`public.margen_sesion_de_cita(p_cita_id uuid) returns smallint`**, `stable`, `security
   definer`, `set search_path = ''`: `coalesce(c.margen, o.margen)` resolviendo por
   `citas.centro_id`; devuelve `null` si la cita no existe. Definer porque el margen no es dato
   clínico y el profesional tiene que poder resolverlo aunque la cita sea de otro centro; no
   revela nada que `centros_lectura` no dé ya. `grant execute … to authenticated`.
8. **`fn_resolver_alerta_nota_sin_firmar()`**, `after insert on notas_clinicas_versiones`,
   invoker: marca `resuelta` la alerta `nota_sin_firmar` cuyo `origen_id` es la `cita_id` de la
   cabecera. *(Ver §Lo que no entra: si la revisión de alcance lo considera fuera del contrato,
   se cae sin tocar nada más.)*
9. `alter default privileges … revoke all on tables …` no hace falta: no se crea ninguna tabla.
   **Sí** hay que pasar `npm run lint:migraciones` y regenerar `lib/supabase/tipos-bd.ts`
   (`npm run tipos`) tras `npx supabase db reset`.

### 1.3 · `lib/notas/` (nuevo, funciones puras, sin `server-only`)

| Fichero | Contrato |
|---|---|
| `lib/notas/cuerpo.ts` | `export const esquemaCuerpo = z.object({ formato: z.literal('texto_plano'), texto: z.string() }).strict()` y `export type CuerpoNota = z.infer<…>`. **Decisión**: el cuerpo es texto plano dentro de un objeto con discriminante, no un documento de editor enriquecido (§2.7). |
| `lib/notas/estado.ts` | `export type EstadoNota = 'pendiente' \| 'borrador' \| 'firmada' \| 'firmada_con_cambios' \| 'modificada'`; `export function estadoDeNota(p: { versiones: number; hayBorrador: boolean }): EstadoNota`. Sin columna, sin segunda verdad (§2.6). |
| `lib/notas/comparar.ts` | `export type Segmento = { tipo: 'igual' \| 'anadido' \| 'retirado'; texto: string }`; `export function compararTextos(antes: string, despues: string): Segmento[]` — LCS por palabras conservando los espacios. Pura, determinista, sin DOM. **Delegable** (§7). |
| `lib/notas/exportar.ts` | `export function componerExportacion(n: NotaExportable): string` — el texto plano de la descarga (§1.6). Pura. **Delegable**. |

### 1.4 · Las Server Actions

Viven en `app/(app)/pacientes/[id]/historia/notas/acciones.ts` (`'use server'`), con la misma
disciplina literal que `acciones.ts` de T-013: `exigirSesion()` primero, Zod después, registro
del acceso antes de leer nada clínico, y nunca leer si el registro falló.

**Esquemas Zod compartidos** en `app/(app)/pacientes/[id]/historia/notas/esquemas.ts` (sin
`'use server'`, importable desde el formulario de cliente — es el «mismo esquema» que exige
CLAUDE.md):

```ts
export const SIN_NULO = /^[^\u0000]*$/;   // U+0000 no entra en jsonb: 22P05 (T-005)

export const esquemaBorrador = z.object({
  notaId: z.uuid(),
  pacienteId: z.uuid(),
  // El testigo del bloqueo optimista viaja como CADENA OPACA, jamás como Date (§4).
  testigo: z.string().min(1),
  texto: z.string().regex(SIN_NULO),
  anotacionesReservadas: z.string().regex(SIN_NULO).nullable(),
});

export const esquemaFirma = z.object({
  notaId: z.uuid(),
  pacienteId: z.uuid(),
  testigo: z.string().min(1),
  alcance: z.enum(['individual', 'conjunta']),
  // El `check` de la base exige length(trim(motivo)) > 0 a partir de la versión 2; aquí
  // se refleja exactamente, sin inventar un mínimo más duro.
  motivo: z.string().trim().min(1).max(500).regex(SIN_NULO).nullable(),
});
```

| Acción | Firma | Qué hace, en orden |
|---|---|---|
| `abrirEditorDeNota` | `(pacienteId: string, citaId: string \| null) => Promise<ResultadoEditor>` | 1 `exigirSesion`; 2 Zod; 3 `registrarAccesoHistoria(sesion, pacienteId, 'notas_clinicas', {ip, agente})` → si `!ok`, `{abierto:false, mensaje}` **sin tocar ninguna tabla clínica**; 4 localizar la cabecera: si `citaId` no es nulo, `select … from notas_clinicas where cita_id = citaId` (el índice `notas_clinicas_cita_idx` existe); si no hay, `insert` con `paciente_id, autor_id = usuario.id, cita_id, fecha_sesion = fecha local de la cita, episodio_id` y `borrador_contenido = {formato,texto:''}` + `borrador_autor_id = usuario.id`; 5 releer cabecera + versiones; 6 devolver el modelo de vista. |
| `guardarBorrador` | `(entrada: z.infer<typeof esquemaBorrador>) => Promise<ResultadoGuardado>` | 1 sesión; 2 Zod; 3 `update notas_clinicas set borrador_contenido = {…}, borrador_autor_id = uid where id = notaId and borrador_actualizado_en = testigo` con `.select('id, borrador_actualizado_en')`; 4 si vuelven **0 filas**, desambiguar (§1.5); 5 `prolongarDesbloqueo(sesion)`; 6 devolver `{ok:true, testigo: nuevo, caducaEn}`. |
| `firmarNota` | `(entrada: z.infer<typeof esquemaFirma>) => Promise<ResultadoFirma>` | §1.5. |
| `descargarNotaCompleta` | `(notaId: string, pacienteId: string) => Promise<{ok:true; nombre:string; texto:string} \| {ok:false; mensaje:string}>` | 1 sesión; 2 Zod; 3 `insert into accesos_historia (perfil_id, paciente_id, tipo, pestana) values (uid, …, 'exportacion', 'notas_clinicas')` — **antes** de leer; si falla, no se lee; 4 leer todas las versiones ordenadas por `numero_version`; 5 `componerExportacion(...)`. |

`ResultadoEditor` es un **modelo de vista estrecho** (ADR-056): nada de filas crudas.

```ts
export type VersionDeVista = {
  numero: number; autor: string; creadaEn: string;   // ya formateada en servidor (ADR-034)
  motivo: string | null; alcance: 'individual' | 'conjunta';
  huella: string; huellaAnterior: string;            // hex, para el sello y la descarga
  cuerpo: string; anotacionesReservadas: string | null;
  sello: { enSesion: boolean; citaId: string | null; ventana: string | null };
};
export type ResultadoEditor =
  | { abierto: true; notaId: string; estado: EstadoNota; caducaEn: string | null;
      borrador: { texto: string; anotacionesReservadas: string | null; testigo: string } | null;
      soyElAutor: boolean; puedeSerConjunta: boolean; versiones: VersionDeVista[] }
  | { abierto: false; mensaje: string };
```

`sello` **se deriva parseando `contenido_canonico`** con `esquemaSobre` (hecho 9: no hay
columnas). Si el parseo falla o `esquema_version` no es 3, el sello se pinta como
«desconocido», jamás como `false`: un sobre que no se entiende no es una nota escrita fuera de
sesión.

### 1.5 · Firmar, paso a paso (la pieza cara)

```
firmarNota(entrada):
  1  sesion = await exigirSesion()
  2  esquemaFirma.parse                               // el mismo del formulario
  3  registrarAccesoHistoria(...'notas_clinicas')     // el candado se prolonga aquí, no al pintar
  4  cabecera = select id, paciente_id, cita_id, episodio_id, autor_id,
                      borrador_contenido, borrador_actualizado_en, borrador_abierta_en
                 from notas_clinicas where id = notaId
     · sin fila              → {ok:false, motivo:'sin_acceso'}
     · borrador_actualizado_en !== testigo → {ok:false, motivo:'conflicto', ...}
     · borrador_contenido nulo → {ok:false, motivo:'sin_borrador'}
  5  cuerpo = esquemaCuerpo.parse(cabecera.borrador_contenido)   // se firma LO GUARDADO
  6  si cabecera.cita_id !== null:
        cita = select inicio, fin from citas where id = cabecera.cita_id
        · si no vuelve fila  → ABORTA: {ok:false, motivo:'cita_ilegible'}     (§2.4)
        margen = rpc margen_sesion_de_cita(cita_id)
        · si margen es null  → ABORTA
     si no: ventana = null, margen = null
  7  versiones = count(*) where nota_id = notaId
     · versiones > 0 y motivo nulo → {ok:false, motivo:'falta_motivo'}
     · versiones === 0 y motivo no nulo → se ignora y se manda null (la v1 no lleva motivo)
  8  firmarVersionNota(supabase, { notaId, autorId: usuario.id, cuerpo,
       anotacionesReservadas, motivoCambio, alcance, citaId, ventanaCita, margenMinutos,
       abiertaEn: cabecera.borrador_abierta_en })          // lib/huella/firmar.ts, sin tocar
  9  el disparador sella, encadena y VACÍA EL BORRADOR (§1.2.5) en la misma transacción
 10  releer versiones y devolver el modelo de vista nuevo
```

**El paso 5 es contrato**: `firmarNota` **no recibe el texto**. Sella lo que hay guardado. El
editor guarda y *después* firma con el testigo que le devolvió el guardado. Así «lo que se
firma» y «lo que el usuario vio guardado» son el mismo objeto por construcción, y la carga útil
de la firma no puede traer un cuerpo distinto del que el bloqueo optimista protegía.

**Desambiguar las cero filas** (guardar y firmar): `update … where testigo` devolviendo 0 filas
significa **tres cosas distintas** —otro dispositivo guardó antes, el candado se cerró, o no soy
el autor— porque RLS no da error, devuelve vacío. Tras 0 filas se hace
`select id, borrador_actualizado_en from notas_clinicas where id = notaId`:

| Relectura | Diagnóstico | Qué se dice |
|---|---|---|
| fila con testigo distinto | conflicto real | «Se guardó desde otro sitio…» + ofrecer ver lo guardado; **no se pisa** |
| fila con el mismo testigo | no soy el autor (`notas_clinicas_modificacion`) | «Esta nota la escribe su autor» |
| sin fila | candado cerrado o sin acceso | pantalla de bloqueo, PIN |

Sin esto, un candado caducado se anuncia como «otro dispositivo guardó antes»: una mentira de la
aplicación sobre un dato clínico.

### 1.6 · Interfaz

| Fichero | Qué es |
|---|---|
| `app/(app)/pacientes/[id]/historia/notas/page.tsx` | **Servidor, armazón estático**. Valida el UUID contra `pacientes` (404 si no), pinta cabecera no clínica (nombre, volver a la ficha) y monta `<EditorDeNota/>` cerrado. **No lee ni una fila clínica** y no recibe `searchParams` clínicos: `cita` solo viaja como UUID hacia la acción. Exporta `viewport` con `interactiveWidget: 'resizes-content'` (hecho 24). |
| `.../editor-de-nota.tsx` | `'use client'`. Estado, candado (copia el patrón del reloj de `panel-historia.tsx`), autoguardado, firma, y el conmutador de cuerpos. |
| `.../barra-de-acciones.tsx` | `'use client'`. La barra táctil del ADR-044 (§2.8). |
| `.../comparador.tsx` | `'use client'`, pinta los `Segmento` de `lib/notas/comparar.ts` (§2.5). |
| `.../sello.tsx` | Servidor puro (sin estado): la frase del sello a partir de `VersionDeVista.sello`. |
| `app/(app)/pacientes/[id]/acciones.ts` | `ResultadoDeApertura` gana `notas: ResumenDeNota[] \| null`, rellenado cuando `pestana === 'notas_clinicas'`. Es **lista, no editor**: fecha, estado derivado, autor, nº de versiones y el sello. |
| `app/(app)/pacientes/[id]/panel-historia.tsx` | El `<EnPreparacion/>` de `notas_clinicas` pasa a `<ListaDeNotas/>`, con un enlace por nota a la ruta del editor y un botón «Nueva nota». |
| `lib/i18n/es.ts` | Todas las cadenas. **Fichero CRLF** (bitácora T-013): cualquier edición por bytes repone `\r\n` o git lo marca binario. |

---

## 2 · Decisiones y alternativas descartadas

**2.1 · El ADR-057 va en un corte previo con ticket propio, no dentro de T-012.** Toca seis
ficheros de la cadena y cero de pantalla; se verifica entero con `db reset` + `npm test` +
`npm run test:rls` + `verificar:huellas`, sin una línea de interfaz. Es el mismo argumento
literal de `docs/bitacora/T-013a.md`: «se separó para no enrutarlo por la revisión equivocada».
Aquí el riesgo es mayor todavía —define la era del esquema **para siempre**, y el ADR-035
prohíbe recalcular— así que lo que quiero es una revisión mirando una sola cosa, no dos
revisores repartiéndose quince tareas. *Descartado*: meterlo en el corte A (se diluye entre
columnas, disparadores y acciones); *descartado*: dejarlo para después (caduca en cuanto se
firme la primera nota, y entonces cuesta `esquema_version = 4` y dos lectores para siempre).

**2.2 · `abierta_en` en columna propia escrita por disparador.** Alternativas descartadas: (a)
dentro de `borrador_contenido` — el cliente tiene `grant update` de tabla entera y puede
escribirla por PostgREST sin pasar por la acción, es decir, la casilla prohibida por otro
nombre; (b) en la sesión o en una cookie — no sobrevive a cambiar de dispositivo, y el ADR-046
exige que sobreviva al borrador; (c) columna escrita por la Server Action — mismo agujero que
(a), porque el grant no distingue quién escribe.

**2.3 · Abrir el editor escribe un borrador vacío.** Es lo que hace que `abierta_en` sea «la
primera vez que se abre el editor» y no «la primera vez que se teclea», que puede caer fuera de
la sesión con toda legitimidad. Precio aceptado: abrir y abandonar deja un borrador vacío; el
ADR-036 ya prevé que un borrador abandonado genere aviso, y el aviso no es de este ticket.

**2.4 · Si la cita no se puede leer, la firma se aborta.** La alternativa —sellar
`redactada_en_sesion: false` porque no pudimos leer la ventana— guarda **para siempre** una
afirmación falsa dentro de una huella que nadie podrá recalcular. Un error que el usuario ve es
infinitamente más barato que un sello mentiroso.

**2.5 · La comparación no usa color como único canal.** Cada segmento va con tres señales
redundantes: elemento semántico (`<ins>` / `<del>`), marca tipográfica (subrayado / tachado) y
**texto**: un prefijo `+` / `−` visible más una etiqueta `sr-only` («Añadido:», «Retirado:»).
Descartado el clásico verde/rojo a secas (ADR-041/WCAG 1.4.1) y descartado apoyarse solo en
`<ins>/<del>`, que muchos lectores de pantalla no anuncian por defecto.

**2.6 · El estado se deriva, no se guarda.** `estadoDeNota({versiones, hayBorrador})`:
`0 + no → pendiente`; `0 + sí → borrador`; `≥1 + no → firmada` (y `modificada` si `versiones > 1`);
`≥1 + sí → firmada_con_cambios`. El comentario de la tabla lo pide y el contrato lo repite:
una columna de estado es una segunda verdad que se desincroniza en silencio.

**2.7 · El cuerpo es texto plano dentro de `{formato:'texto_plano', texto}`.** El maestro
mencionaba TipTap, pero **el contrato no nombra ninguna dependencia** y la regla de
`.claude/rules/pipeline.md` es tajante: solo las dependencias que el ticket nombra. Ningún
criterio de aceptación necesita texto enriquecido, y los que sí existen —NFC, dos cuerpos,
comparación, 360 px— se cierran igual. El discriminante `formato` deja la puerta abierta:
`{formato:'tiptap', doc:{…}}` entra mañana **sin subir `esquema_version`**, porque `cuerpo` es
un objeto opaco para el sobre y para el disparador.

**2.8 · El diseño táctil del ADR-044.** (a) La barra de acciones va **abajo**, `sticky bottom-0`
con `padding-bottom: env(safe-area-inset-bottom)`, altura mínima `min-h-11` (44 px) por destino
—la primitiva `Button` mide 40 px, hallazgo abierto en `state.md`, así que aquí se repite el
`min-h-11` local de T-013 y **no se toca la primitiva**—. (b) El teclado virtual no tapa el
cursor: `interactiveWidget: 'resizes-content'` en el `viewport` de la ruta, el área de texto con
`flex-1` dentro de un contenedor `h-[100dvh]` (no `100vh`) y `scroll-margin-bottom` en el área;
así el navegador reduce el contenido en vez de superponer. (c) Ningún atajo de teclado es la
única forma de nada: Guardar, Firmar y el conmutador Cuerpo/Reservadas son botones reales. (d)
Los dos cuerpos en móvil son **un conmutador de dos pestañas** con el aviso del art. 18.3
siempre visible sobre la zona reservada; en pantalla ancha, dos bloques apilados y visibles a la
vez. Nunca «se ve mejor en ordenador».

**2.9 · El autoguardado prolonga la ventana del candado; el reloj del cliente, no.** ADR-026:
la ventana se prolonga en las Server Actions, jamás en el renderizado. Teclear es presencia; un
temporizador no demuestra nada. Debounce de 3 s tras la última tecla y al perder el foco, una
sola escritura en vuelo, y la última pendiente se encola.

**2.10 · La nota conjunta (ADR-030).** `alcance` se elige **una vez, al firmar**, y solo se
ofrece la elección si la cabecera tiene `episodio_id` y ese episodio tiene más de un
participante activo (`episodio_participantes`). En cualquier otro caso es `individual` fijo y
**no se pinta ningún control** —la regla de interfaz prohíbe controles sin una acción real
detrás—, lo que además evita chocar de frente con `fn_exigir_episodio_en_nota_conjunta()`. Al
marcar «conjunta», el diálogo de firma dice las tres cosas en este orden: cuelga del episodio y
la leerán los profesionales del episodio (es literalmente lo que hace
`notas_clinicas_versiones_lectura`); es **un solo eslabón**, no una copia por participante; y
**no se entregará entera** en un ejercicio de acceso individual. Desde el ADR-057 esa elección
va sellada: cambiarla es una versión nueva con motivo.

**2.11 · La descarga es texto plano, no PDF.** Sin dependencia nueva. Incluye, versión a versión
y en orden: número, autor, fecha, motivo, alcance, el sello, **los dos cuerpos**, `huella` y
`huella_anterior` en hex y el `contenido_canonico` literal —que es lo que permite a un tercero
recalcular la cadena sin nuestro código—. Encabezado explícito: copia íntegra para uso
profesional o judicial, **incluye anotaciones reservadas** y por tanto **no es** la salida del
derecho de acceso del paciente (ADR-027) ni de un acceso individual sobre nota conjunta
(ADR-030). Registra `accesos_historia.tipo = 'exportacion'`.

**2.12 · U+0000 se rechaza en el formulario.** Es una mina conocida de T-005: un texto pegado con
un NUL revienta el `::jsonb` del disparador con `22P05` y la nota **no se puede firmar**. El
`regex(SIN_NULO)` del esquema Zod lo convierte en un mensaje de formulario en vez de en un
error de base de datos al final del trabajo del usuario.

---

## 3 · Cómo se cierra cada criterio de aceptación

Cada criterio automático es una aserción en `scripts/rls/18-notas-firma.sql` (banco nuevo, mismo
patrón que el 14) o una prueba de Vitest. Los del banco se ejecutan con `npm run test:rls`.

| # | Criterio | Cómo se demuestra |
|---|---|---|
| 1 | v1 con `numero_version = 1`, `huella` no nula y `huella_anterior` de 32 ceros | `18-notas-firma.sql`: paciente nuevo sin cadena previa; `assert` sobre las tres columnas; además `posicion_cadena = 1`. |
| 2 | Releer `contenido_canonico` y su SHA-256 da la `huella` guardada | `assert(digest(convert_to(contenido_canonico,'UTF8') \|\| huella_anterior,'sha256') = huella)` **leyendo la columna**, nunca reconstruyendo el sobre. Y `verificar_cadena_huellas()` = 0 filas. |
| 3 | `redactada_en_sesion` true dentro de la ventana, false al día siguiente; tocarlo rompe la huella | Vitest sobre `construirSobre()` con `ahora` inyectado (los dos casos) + banco: `assert_lanza_codigo` al insertar un sobre con el campo cambiado y la huella vieja… **ojo**: la huella la recalcula el disparador, así que la demostración correcta es la de T-005: cambiar el campo en el texto canónico produce **otra** `huella`, y se comprueba `<>` contra la del vector gemelo. |
| 4 | `update`/`delete`/`truncate` como `postgres` fallan | Ya cubierto por `scripts/rls/10-solo-adicion.sql`; se añaden las tres aserciones **con la fila recién firmada por el camino de la aplicación**, no con una sembrada a mano (lección T-013a). |
| 5 | Sin motivo falla; con motivo, v2 cuya `huella_anterior` es la `huella` de v1 | Banco: negativa con `assert_lanza_codigo(…, '23514')` (el `check` de tabla) y positiva encadenada. Vitest: `firmarNota` sin motivo con una versión previa devuelve `motivo:'falta_motivo'` **sin llegar a insertar**. |
| 6 | Acento compuesto y precompuesto → misma huella | `lib/huella/vectores-congelados.json` (`acentos-nfd`/`acentos-nfc`) ya lo hace; **hay que regenerarlos** con `alcance` y comprobar que la igualdad se mantiene. |
| 7 | `anotaciones_reservadas` entra en el cómputo | `sobre.test.ts` ya tiene la prueba; se conserva y se añade la gemela para `alcance` (ADR-057). |
| 8 | **Manual** · Candado cerrado: pantalla de bloqueo y **el HTML no contiene el borrador** | `curl -s <ruta> \| grep -c "<texto sembrado>"` → `0`, y además `npm test` con una prueba de render del `page.tsx` que afirma que no aparece. El HTML no puede contenerlo por construcción: el `page.tsx` no lee nada. |
| 9 | **Manual** · Comparación v1↔v2 distinguible sin color | Vitest sobre `compararTextos()` (la lógica) + comprobación visual en escala de grises. La prueba de unidad **no** demuestra el criterio: lo demuestra la captura en grises. |
| 10 | **Manual** · 360 px con teclado virtual: cursor visible, barra alcanzable | Guion del contrato, en teléfono real o emulación con teclado. |
| 11 | `disponible: true` no aplica | No se toca el armazón; se comprueba que `components/armazon/**` no aparece en el diff. |
| 12 | `npm run lint && npm run build` limpios | Con `> log 2>&1; echo "exit=$?"` (trampa de `state.md`). |

Evidencia: `tickets/T-012/evidencia.json` con la salida real de `npx supabase db reset`,
`npm test`, `npm run test:rls`, `npm run verificar:huellas`, `npm run lint:migraciones`, `lint`
y `build`.

---

## 4 · Riesgos, por probabilidad

1. **Alta · El testigo pierde precisión al pasar por JavaScript.** `borrador_actualizado_en`
   llega de PostgREST con microsegundos (`…:00.123456+00:00`). Si alguien lo mete en un `Date` y
   lo devuelve con `toISOString()`, pierde tres dígitos, el `where` no encuentra la fila y **todo
   guardado da conflicto permanente**. Mitigación: tipo `string` en toda la cadena de estado y
   una prueba con un testigo de seis decimales.
2. **Alta · Cero filas se lee como conflicto.** RLS no da error. Sin la desambiguación de §1.5,
   un candado caducado se anuncia como edición concurrente. Mitigación: la tabla de §1.5, con
   prueba por cada una de las tres ramas.
3. **Media · El banco de RLS deja de sembrar al cambiar el sobre.** `01-fijacion.sql` firma
   `NCONJ` con `alcance = 'conjunta'`: si no se le pasa a `sobre_prueba()`, la 6.10 lo rechaza y
   fallan los diecisiete ficheros del banco, no uno. Mitigación: es lo primero que se ejecuta
   tras el cambio.
4. **Media · Se regeneran los vectores de TypeScript y no los literales de SQL.**
   `vectores-sql.test.ts` lo atrapa, pero solo si se ejecuta `npm test` antes que `test:rls`.
5. **Media · El disparador de vaciado del borrador se salta el candado.** Si alguien lo escribe
   `security definer` «para que no falle», el borrador se vacía aunque `notas_clinicas_modificacion`
   lo hubiera impedido. Mitigación: invoker, escrito y comentado como tal.
6. **Baja · Doble firma por doble pulsación.** Dos `insert` concurrentes se serializan por el
   cerrojo consultivo, pero producen **dos versiones** (v1 y v2), y la v2 necesitaría motivo →
   falla con 23514. Feo pero no corrompe. Mitigación: botón deshabilitado durante la transición e
   idempotencia por testigo (tras la primera firma el borrador es nulo → `sin_borrador`).
7. **Baja · Alertas huérfanas.** Si se cae el punto 8 de §1.2, firmar deja la alerta
   `nota_sin_firmar` abierta y la bandeja miente. Se anota en `state.md` si se cae.
8. **Baja · `fecha_sesion` de la nota creada desde el calendario.** Se toma de la cita en la zona
   del centro (ADR-034), no `current_date` del servidor: una cita de las 23:30 crearía la nota con
   la fecha del día siguiente en UTC.

---

## 5 · Qué revisar

Lista específica de este ticket, para los dos revisores y para la autoevaluación del
implementador. Ordenada por lo que más caro sale si se escapa.

**Lo que el llamante puede elegir, y qué efecto tiene**

- `notas_clinicas_versiones` tiene `grant insert` **de tabla entera** a `authenticated`: el
  llamante elige `alcance`, `esquema_version`, `creada_en`, `cuerpo`, `anotaciones_reservadas`,
  `motivo_cambio` y `nota_id`. Comprobar que **cada uno** está atado por una comprobación 6.x
  —`alcance` por la 6.10 nueva— o por una política. `algoritmo_version` lo cierra la guarda
  1.bis; las cinco calculadas, la guarda 1.
- `notas_clinicas` tiene `grant update` de tabla entera: el llamante puede mandar
  `borrador_abierta_en`, `borrador_actualizado_en` y `borrador_autor_id`. Verificar con un
  `update` crudo (rol `authenticated`, no `postgres`) que **el disparador pisa los dos primeros**
  y que el tercero, aunque no esté atado, no entra en ningún sobre.
- `firmarNota` no recibe el cuerpo. Si en el código acabado lo recibe, aunque sea «para validar»,
  es un hallazgo: abre la puerta a firmar algo distinto de lo guardado.
- `?cita=<uuid>` es entrada pública: comprobar que la acción **no confía** en ella para decidir
  el paciente. El paciente sale del segmento de ruta y el acceso se registra contra ese paciente;
  una `cita` de otro paciente no puede reatribuir la nota (y si la cabecera ya existe, manda la
  cabecera).

**Qué prueba debe fallar, y por qué motivo exacto**

- La negativa de la 6.10 tiene que fallar con **`23514`** usando `assert_lanza_codigo`, no
  `assert_lanza` a secas (hallazgo MEDIA-1 de la segunda revisión de T-005): con `assert_lanza`,
  una fila que choca con el índice único de `huella` da «OK» sin haber pasado por la
  comprobación.
- La prueba de `"alcance":null` debe fallar **por la 6.10** y no por el `strict()` de Zod ni por
  el enum de la columna: es el caso exacto que `->>`+`<>` dejaba pasar.
- La prueba de conflicto de borrador debe fallar **por testigo distinto**, no porque la fila no
  exista: si la sesión de prueba no es la del autor, cero filas por RLS y la prueba pasa por el
  motivo equivocado.
- El banco nuevo **firma por el camino de la aplicación** (insert con solo las nueve columnas que
  manda `firmar.ts`). Una prueba que inserte `huella` y `posicion_cadena` a mano prueba el
  esquema, no el producto (lección T-013a) — y además fallaría por la guarda 1.

**Invariantes que se pueden saltar por otra puerta**

- **Nulos**: toda comparación sobre el sobre va con `is distinct from` sobre el valor JSONB
  completo. Un `->>` nuevo en la 6.10 es un fallo de revisión, no un detalle de estilo.
- **Duplicados**: `json_object_keys(…::json)`, nunca `jsonb_object_keys`. Una clave `alcance`
  repetida debe dar trece elementos y saltar por `is distinct from v_esperadas`.
- **Concurrencia**: `npm run test:huellas` sigue en verde tras el cambio de sobre (no es
  idempotente: exige `db reset` antes).
- **Permisos de tabla entera y TRUNCATE**: las tres capas del invariante 2 se comprueban **sobre
  una fila firmada por la aplicación**, incluido `truncate` como `postgres`.
- **El candado**: `guardarBorrador` y `firmarNota` no pueden tener ningún camino que lea o escriba
  contenido clínico antes de `registrarAccesoHistoria`. Y la ventana se prolonga **solo** en
  acciones; buscar cualquier `prolongarDesbloqueo` en un componente de servidor.
- **`use cache`**: ni una directiva en toda la ruta del editor (ADR-043), tampoco
  `use cache: private`.
- **El HTML**: `page.tsx` no puede tener ni un `await supabase.from('notas…')`.
- **Migración**: `npm run lint:migraciones` en verde y `lib/supabase/tipos-bd.ts` regenerado, no
  editado a mano.
- **La guarda de era**: la migración del ADR-057 **debe** abortar si `notas_clinicas_versiones`
  tiene una sola fila. Revisar que está y que el mensaje se entiende.

---

## 6 · Territorio

El contrato no declara `territorio:`. Se declara aquí (comprobable con
`node ~/.claude/pipeline/territorio.mjs`):

```
supabase/migrations/**            scripts/rls/**              supabase/seed-completo.sql
scripts/t005-concurrencia.sql     lib/huella/**               lib/notas/**
lib/supabase/tipos-bd.ts (generado)
app/(app)/pacientes/[id]/**       lib/i18n/es.ts
tickets/T-012/**                  docs/bitacora/              docs/state.md
docs/decisions/ (solo el ADR nuevo del BLOQUEO B1, si se aprueba)
```

**Fuera**: `components/ui/**` (las primitivas de T-007 no se reescriben; el hallazgo abierto de
los 40 px se sortea con `min-h-11` local, como en T-013), `components/armazon/**`,
`next.config.ts`, `proxy.ts`, `package.json` (ninguna dependencia nueva).

---

## 7 · Delegable

`delegable: volumen`, sin comportamiento y con contrato cerrado:

- `lib/notas/comparar.ts` + su prueba: LCS por palabras, entrada y salida de tipos fijados en
  §1.3, casos obligatorios (vacío↔texto, todo añadido, todo retirado, cambio en medio, acentos
  NFC/NFD, espacios múltiples).
- `lib/notas/exportar.ts` + su prueba: función pura de composición de texto; el formato de cada
  bloque se le entrega literal.
- La regeneración de `lib/huella/vectores-congelados.json` es **mecánica pero no delegable**: es
  la era del esquema, y el generador de un CLI que se equivoque en una clave se congela para
  siempre. La hace la fábrica y la revisan los dos revisores.

**No delegable**: nada de `supabase/**` (dueño único), nada con foco, ARIA o teclado virtual
(regla medida en T-007: la pintura a la primera, los diálogos con foco tres veces mal), y nada
que toque el candado.

---

## 8 · Cortes propuestos

| Corte | Qué entra | Por qué corta ahí | Cierra |
|---|---|---|---|
| **Previo · ticket propio (T-012·a)** `riesgo: alto` | El ADR-057 entero: §1.1. Cero interfaz. | Define la era del esquema y tiene que estar **antes de la primera firma real**. Revisión mirando una sola cosa (argumento literal de T-013a). | Criterios 6 y 7; deja 1-3 y 5 listos para el corte A. |
| **A** `riesgo: alto` | Migración de §1.2, `lib/notas/{cuerpo,estado}.ts`, las tres Server Actions de §1.4-1.5 con su Zod, banco `18-notas-firma.sql`. Sin pantalla. | Es todo el mecanismo que hay que revisar de verdad: sobre, sello, candado, bloqueo optimista, solo adición. | Criterios **1, 2, 3, 4, 5** y 12. |
| **B** `riesgo: medio` | El editor: ruta sin apertura automática (B1-a, ADR-058), dos cuerpos, autoguardado, barra táctil, firma desde pantalla, lista dentro de la ficha. | No toca la cadena ni una vez; lo que se revisa aquí es foco, candado en pantalla y 360 px. | Criterios **8, 10, 11** y 12. |
| **C** `riesgo: medio` | Versión vigente con «modificada el · por», comparación, sello como frase, descarga completa. | Todo lectura y presentación sobre lo que A y B ya sellaron. | Criterio **9** y la tarea de descarga. |

El corte A **no puede empezar** hasta que el previo esté en `main`: firmar con el sobre de once
claves crea filas que la migración del 057 hará abortar (y con razón).

---

## Lo que no entra, y por qué

- **Editor de texto enriquecido (TipTap o equivalente).** Ninguna dependencia que el contrato no
  nombre (regla de pipeline), ningún criterio lo necesita, y el discriminante `formato` del
  cuerpo deja que entre mañana sin subir `esquema_version`.
- **Pantalla de ajustes para el margen de sesión.** Se crean las dos columnas porque el ADR-046
  exige que sea configurable y que quede *guardado con la nota*; la pantalla que lo edita es de
  Ajustes, y Ajustes no es este ticket. Se anota en `state.md`.
- **Aviso de borrador abandonado más de N días** (ADR-036). Necesita decidir N; no hay criterio de
  aceptación que lo pida.
- **Recuperar el borrador tras un conflicto** más allá de enseñar lo guardado. El ADR-036 dice
  explícitamente que el borrador no es recuperable versión a versión.
- **Que un colega que hereda el caso pueda corregir una nota ajena.** Decidido por el propietario
  el 15-09-2026 y escrito en el [ADR-059](../../docs/decisions/ADR-059.md): **se queda como está**.
  `notas_clinicas_versiones_alta` exige `n.autor_id = auth.uid()` a propósito, y quien hereda el
  caso escribe nota nueva en vez de reescribir el relato de otro. Ya no es un hallazgo abierto: es
  una restricción que nadie debe «arreglar». La pantalla lo dice con palabras cuando el que mira no
  es el autor, en vez de esconder el botón.
- **La proyección para el derecho de acceso del paciente** (sin anotaciones reservadas, con la
  valoración del profesional sobre la nota conjunta). Es su propio ticket; aquí solo se deja dicho
  en la cabecera de la descarga que esta **no** es esa salida.
- **Enganchar `verificar:huellas` a la ejecución nocturna**: es de T-009 y de `.github/**`.

---

## Resumen

1. Se construye la nota clínica de punta a punta: borrador en la cabecera mutable, firma que
   entra en la cadena, versiones encadenadas con motivo, comparación, sello y descarga.
2. **Decisión 1**: el ADR-057 —sobre de doce claves con `alcance`, `esquema_version = 3`— va en un
   **corte previo con ticket propio**, antes de la primera firma real, por el mismo motivo por el
   que se separó T-013a: para que una revisión mire una sola cosa, y porque esta decide la era del
   esquema para siempre.
3. **Decisión 2**: `abierta_en` vive en una columna nueva, `notas_clinicas.borrador_abierta_en`,
   escrita **solo por disparador** y nunca por el llamante; abrir el editor crea el borrador vacío
   y ahí queda fijada. Es lo que impide que «lo escribí en sesión» vuelva a ser una casilla por la
   puerta de atrás, ahora que `authenticated` tiene `update` de tabla entera.
4. **Decisión 3**: firmar **no recibe el texto**: sella el borrador guardado, y el vaciado del
   borrador lo hace un disparador `after insert` en la misma transacción que la firma.
5. Hay **un BLOQUEO real**: la ruta `/pacientes/<uuid>/historia/notas` que pide el contrato
   contradice al ADR-056 («la pestaña activa es estado de cliente, no de URL»), aceptado después
   del contrato. Recomiendo la ruta **sin apertura automática** más un ADR-058 que enmiende;
   decide el propietario. Solo bloquea el corte B.
6. Lo que más caro sale si se escapa: una comparación del sobre escrita con `->>` en vez de
   `is distinct from` (un `null` JSON la desactiva en silencio), y el testigo del bloqueo optimista
   perdiendo microsegundos al pasar por `Date`.
7. Segundo foco de revisión: que «cero filas» no se anuncie como conflicto cuando lo que pasó es
   que el candado se cerró — la aplicación diciendo una falsedad sobre un dato clínico.
8. Tercer foco: que el banco nuevo firme **por el camino de la aplicación** y no sembrando filas a
   mano, que es la lección exacta de T-013a.
9. No entra ninguna dependencia nueva, ninguna primitiva de `components/ui/` se reescribe y el
   armazón no se toca.
10. Cuatro cortes: previo (cadena), A (base y acciones, todo lo automático), B (editor táctil),
    C (versiones y descarga).
