# T-012 · Nota clínica — borrador, firma y versión sellada · Diseño

**Fecha**: 15-09-2026 · **Actualizado**: 01-10-2026, con el código de `main` después de T-012c, T-033
y T-034, y con T-014 a punto de integrarse; y el mismo 01-10-2026, con las tres respuestas del
propietario a las preguntas abiertas (§D) · **Enmendado**: 02-10-2026, con la cuarta frase del
sello (§E) · **Riesgo**: alto (`modelo: opus`) · **Arquitecto**: fábrica (Opus 5.5)

Leído para escribir esto: el contrato entero; `docs/architecture.md` §Invariantes 1-3 y
§Reserva de anotaciones subjetivas; ADR 026, 027, 030, 035, 036, 043, 044, 046, 056, 057, 058,
059, 071, 072 y 073; `docs/state.md` (80 líneas); `docs/interfaz.md` §Pacientes, §Anchos y choque 11;
y los ficheros de código citados en §0. De la rama `T-014-correcciones`, que todavía no está en
`main`, solo lo que toca a este ticket (`git show`).

> **Qué cambió respecto al diseño del 29-09.** El sobre de la era 4 ya existe, así que T-012 solo
> lo consume. `fn_vaciar_borrador_al_firmar()` también existe: no se crea. El margen se lee
> directamente, sin la función `margen_sesion_de_cita`. Entran un índice único por cita y autor y
> la resolución de la alerta al firmar. El cuerpo es `{texto}` a secas. El banco 18 pasa a
> llamarse guion de aplicación, `scripts/t012-nota.ts`. Se activa `RUTA_NOTAS_DISPONIBLE` de
> T-014. El §7 tiene ahora una ficha por pieza delegable. Cada cambio está marcado en su sección.

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

## D · Preguntas abiertas: DECIDIDAS por el propietario el 01-10-2026

El diseño del 01-10 dejó tres preguntas abiertas (§4.4, §4.5 y §2.16). El propietario las contestó
el 01-10-2026:

| # | Pregunta | Decisión | Dónde queda |
|---|---|---|---|
| **D1** | El sello es falsificable: el `cita_id` del sobre no se coteja con la cabecera (H27), y el autor puede insertar por PostgREST una versión con `abierta_en` o `redactada_en_sesion` inventados. ¿Se cierra en T-012? | **No. Lo arregla T-036**, que va inmediatamente después de T-012. T-012 sale con el riesgo declarado. | §4.4, §5, §8, «Lo que no entra» |
| **D2** | ¿Entra en T-012 el disparador que da por resuelta la alerta `nota_sin_firmar` al firmar? | **Sí, entra en T-012.** | Hecho 18, §1.2 paso 9, §2.16, §2.18, criterio A y banco 20 §A de §3, §5 |
| **D3** | Doble firma de una modificación (v2 y v3 idénticas por doble pulsación). ¿Se arregla en la base en T-012? | **No. En T-012 basta con desactivar el botón** mientras la firma está en vuelo. El arreglo en la base («exigir borrador vivo» en `fn_sellar_version_nota`) llega con el mismo cambio de T-036. Queda como **hallazgo abierto**. | §1.6, §2.19, §4.5, criterio B de §3, §5 |

**Lo que el contrato escrito de T-036 no cubre hoy.** `tickets/T-036-cita-id-cotejado-con-la-cabecera.md`
(leído el 01-10-2026) solo coteja el `cita_id` del sobre con `notas_clinicas.cita_id`, con una
negativa en el banco 14 y una línea en el verificador. **No incluye**:
- cotejar el `abierta_en` del sobre con `notas_clinicas.borrador_abierta_en`, la columna que crea
  T-012 (resto de D1);
- recalcular `redactada_en_sesion` con la ventana de la cita y el margen sellado (resto de D1);
- exigir un borrador vivo al insertar una versión, que es lo que cierra D3.

Para que D1 y D3 queden cerrados donde ha decidido el propietario, el contrato de T-036 tiene que
ampliarse con esos tres puntos antes de diseñarlo. T-012 no edita T-036 (no es su territorio): lo
eleva en el informe del diseño, y la bitácora de T-012 lo deja en `docs/state.md` §Hallazgos junto
con D3.

---

## E · Enmienda del 02-10-2026: la cuarta frase del sello (R2-H12)

**Decisión del propietario, 02-10-2026**, sobre el hallazgo R2-H12 de `tickets/T-012/revision.md`
(ronda 2, TypeScript): una nota **sin cita** abierta un día y firmada otro decía «Escrita el 01/09 ·
01/09 10:00–15/09 18:00», que se lee como escrita el 01/09. Lo que prueba el sobre es un intervalo.

| Caso | Clave | Frase |
|---|---|---|
| Sin cita, `abierta_en` y `firmada_en` en el **mismo** día local | `notas.sello.sinCita` (sin cambio) | «Escrita el {fecha} · {desde}–{hasta}» |
| Sin cita, `abierta_en` y `firmada_en` en días locales **distintos** | `notas.sello.sinCitaVariosDias` (**nueva**) | «Escrita entre el {desde} y el {hasta}» |
| Con cita (en sesión o fuera) | `enSesion` / `fueraDeSesion` (sin cambio) | sin cambio |

En la frase nueva, `{desde}` y `{hasta}` llevan **fecha y hora** cada uno (`dd/MM HH:mm`), y las
dos fechas llevan año (`dd/MM/yyyy`) si cruzan de año. «Día local» se mide en la zona que recibe
`fraseDelSello(s, zona)` (§1.3), la misma de las otras frases. Las notas con cita no cambian: allí «la sesión del {fecha}» nombra la
sesión, no el día en que se escribió.

Queda marcada en §2.13, en la ficha P2 de §7 y en el corte B de §8. El corte A ya la implementa
(rama `T-012-corte-a`: `lib/notas/sello.ts` y `lib/i18n/es.ts`, revisión ronda 3, R2-H12
cerrado con los mutantes M1-M3). Lo de arriba de este bloque queda como estaba.

---

## 0 · Hechos verificados contra el código

*(Reescrito el 01-10-2026. Sustituye entera la lista del 15-09, que describía el sobre de once
claves.)* Todo lo de abajo está leído en `main` (`c7bb544`), no recordado.

### El sobre y la cadena (era 4, T-012c)

1. `lib/huella/sobre.ts`: `ESQUEMA_VERSION = 4` y `ALGORITMO_VERSION = 1`. `esquemaSobre` es
   estricto, con **diecisiete** claves: `abierta_en, alcance, anotaciones_reservadas, autor_id,
   cita_id, coprofesional_id, creada_en, cuerpo, episodio_id, esquema_version, fecha_sesion,
   firmada_en, margen_sesion_minutos, motivo_cambio, nota_id, paciente_id, redactada_en_sesion`.
   - `EntradaFirma` (`sobre.ts:~90-105`) exige: `notaId, pacienteId, episodioId, fechaSesion
     (string AAAA-MM-DD), coprofesionalId (string|null), autorId, cuerpo (Record<string,
     ValorJson>), anotacionesReservadas (string|null), motivoCambio (string|null), alcance,
     citaId (string|null), ventanaCita ({inicio:Date; fin:Date}|null), margenMinutos, abiertaEn:
     Date` y un `ahora?: Date` opcional.
   - `construirSobre()` normaliza a NFC, fuerza `firmada_en === creada_en` y, cuando
     `citaId === null`, anula el margen y la ventana.
2. `lib/huella/sesion.ts`: `calcularRedactadaEnSesion()` es una función pura. Da verdadero solo
   si `abiertaEn >= inicio − margen` y `firmadaEn <= fin + margen`.
3. `lib/huella/firmar.ts`: `firmarVersionNota(cliente, entrada)` hace un único `insert` con
   `nota_id, cuerpo, anotaciones_reservadas, contenido_canonico, motivo_cambio, alcance,
   esquema_version, autor_id, creada_en`. Si falla, lanza (línea 70)
   `new Error(\`No se pudo firmar la versión de la nota: ${error.message}\`)`. **Al hacerlo
   pierde el SQLSTATE**, y la acción no puede distinguir un 42501 de un 23514 ni de un 23505.
4. `supabase/migrations/20261001120000_nota_id_en_el_sobre.sql` contiene la última definición de
   `fn_sellar_version_nota()`:
   - **Paso 0** (solo para `authenticated`/`anon`): exige candado abierto, `autor_id = auth.uid()`
     y que la nota exista con ese autor. Si no, lanza 42501 «No puedes firmar una versión de esta
     nota…».
   - Guardas 1 y 1.bis (42501).
   - Bloqueo `for no key update` de la cabecera, cerrojo consultivo por paciente y
     `numero_version = max+1`.
   - Comprobaciones **6.1 a 6.16**, todas con 23514. Las 6.11 a 6.16 cotejan `nota_id`,
     `paciente_id`, `episodio_id`, el autor de la cabecera, `fecha_sesion` con la era y
     `coprofesional_id`.
   - **No coteja**:
     - `cita_id`: es H27, va a T-036;
     - `abierta_en` contra nada de la cabecera;
     - `redactada_en_sesion` contra la ventana de la cita.
5. `20260829210000_cadena_de_huellas.sql:~480-501`: **`fn_vaciar_borrador_al_firmar()` ya
   existe**. Es `security definer` y su disparador `vaciar_borrador_al_firmar` es `after insert`
   sobre `notas_clinicas_versiones`. Hace `update notas_clinicas set borrador_contenido = null
   where id = new.nota_id and borrador_contenido is not null`, y `fn_tocar_borrador` limpia el
   resto de columnas del borrador. *El diseño del 15-09 lo creaba de nuevo: ese paso se cae.*
6. `notas_clinicas_versiones.cuerpo` es **`text`** (en `lib/supabase/tipos-bd.ts:1259` aparece
   como `cuerpo: string`) y guarda un objeto JSON. La siembra (`supabase/seed-completo.sql:384-395`)
   y los vectores del banco 14 usan **`{"texto":"…"}`** sin discriminante.
7. Lo que ya prueban T-005 y T-012c:
   - `lib/huella/sobre.test.ts`: NFC en `:166`, `anotaciones_reservadas` en `:218` y
     `redactada_en_sesion` en `:242`;
   - `lib/huella/nfc.test.ts` y `vectores*.test.ts`;
   - `scripts/rls/14-cadena-huellas.sql`: sellado, encadenado, negativas 6.x y C.perm;
   - `scripts/rls/10-solo-adicion.sql`: tres capas.

### Las dos tablas (T-001, T-034)

8. `notas_clinicas` tiene estas columnas: `id, paciente_id, episodio_id` (**not null** desde
   T-034), `autor_id, fecha_sesion date not null default current_date` (la fecha UTC de la base,
   **no** la del centro), `borrador_contenido jsonb, borrador_actualizado_en, borrador_autor_id,
   creada_en`, `cita_id` (`20260906120000`, con índice **no único** `notas_clinicas_cita_idx`) y
   `coprofesional_id` (T-034, `check (coprofesional_id is distinct from autor_id)`).
   - Tiene `check num_nonnulls(borrador_contenido, borrador_actualizado_en, borrador_autor_id)
     in (0,3)`.
   - **No hay columna `estado`**, ni columna donde viva `abierta_en`, ni columna de margen en
     ninguna tabla.
9. `notas_clinicas_versiones` tiene
   `check (numero_version = 1 or (motivo_cambio is not null and length(trim(motivo_cambio)) > 0))`
   e índices únicos en `(nota_id, numero_version)` y en `huella`.
10. La única definición de `fn_tocar_borrador()` está en `20260822094547`, `before insert or
    update`, invoker. Si el borrador pasa a nulo, limpia las otras dos columnas. Si el contenido
    cambia, `borrador_actualizado_en := now()`. **Hueco**: cuando el contenido no cambia, el
    `borrador_actualizado_en` que mande el cliente **sobrevive**.
11. `20260929120000_nota_siempre_en_episodio.sql` (T-034) define tres cosas:
    - **`fn_exigir_episodio_coherente_en_nota`**. Es un disparador `before insert or update of
      paciente_id, episodio_id, autor_id, coprofesional_id`. El coprofesional tiene que tener rol
      `profesional_sanitario` y una fila en `perfiles_centros` con `centro_id` igual al del
      episodio y `hasta is null`. Si no, lanza 23514 «El coprofesional tiene que ser…» o «…no
      tiene alta en el centro del episodio».
    - **`fn_congelar_cabecera_sellada`**. Con una versión ya existente, congela `paciente_id,
      fecha_sesion, autor_id, episodio_id, cita_id, coprofesional_id` (42501).
    - **`episodio_para_nota(p_paciente_id, p_episodio_id?, p_cita_id?, p_centro_id?) returns
      uuid`** (invoker). Lanza 42501 sin candado o si no hay profesional asignado, y 22023 con un
      episodio cerrado. Con `p_cita_id`, la cita tiene que ser del paciente y del profesional.
      Con más de un episodio propio abierto lanza **`EP001`**. Con ninguno, abre uno individual
      en el centro de la cita.
12. Solo adición en tres capas para `notas_clinicas_versiones`: revoke, disparador por fila y
    disparador `before truncate`.

### RLS, candado, accesos

13. Políticas (`20260822160000:1117-1180`):
    - `notas_clinicas_alta` exige candado, `autor_id = uid` y `es_profesional_asignado`.
    - `notas_clinicas_modificacion` exige candado y `autor_id = uid`.
    - `notas_clinicas_lectura` y `notas_clinicas_versiones_lectura` dejan leer al autor, al
      asignado y, si la nota es conjunta, al profesional del episodio.
    - `authenticated` tiene `grant select, insert, update` de **tabla entera** sobre
      `notas_clinicas`.
14. `registrar_acceso_historia(...)` (`20260915120000`) lo pueden usar el administrador y el
    profesional asignado, siempre con desbloqueo vigente. La primera vez escribe la apertura y las
    siguientes suman una vista. `lib/cuentas/accesos.ts` la envuelve: `{ok, accesoId, vistas,
    apertura}`, y nunca lanza. **Llamarla en cada autoguardado inflaría las vistas.**
15. `accesos_historia_alta` (`20260822160000:1269`) admite `desbloqueo_id is null` y **no mira el
    candado**. `authenticated` tiene `grant select, insert`. El enum `tipo_acceso_historia`
    incluye `exportacion`. `desbloqueo_vigente()` devuelve `timestamptz`, no un id.
16. `prolongar_desbloqueo()` prolonga un desbloqueo vigente y nunca resucita uno caducado.
    `lib/cuentas/candado.ts` exporta `prolongarDesbloqueo(sesion): Promise<string|null>` y
    `estadoDeCuenta`.
17. Lectura para cualquier `authenticated` con rol: `organizacion` (incluye `zona_horaria not
    null` y `minutos_desbloqueo_historia`), `centros` (`zona_horaria` nulable), `perfiles_centros`
    y la vista `directorio_perfiles(id, nombre_completo, rol, estado, centro_id)`.
    `citas_lectura` admite al administrador o a `profesional_id = uid`. `citas` tiene `inicio, fin,
    estado, centro_id, profesional_id, paciente_id, zona_horaria not null`.
18. Alertas *(ampliado el 01-10-2026 para D2; todo leído en `supabase/migrations/`)*:
    - Tabla `alertas_documentacion` (`20260822094547:863-885`): `paciente_id, profesional_id,
      centro_id`, `tipo public.tipo_alerta_documentacion` (el enum, en `:95`, incluye
      `'nota_sin_firmar'`), `origen_tabla text` (su check admite `'citas'` desde
      `20260906120000:449`), `origen_id uuid` sin clave ajena, `fecha_referencia date`,
      `estado text not null default 'abierta' check (estado in ('abierta','resuelta'))`,
      `resuelta_en timestamptz` y `check ((estado = 'resuelta') = (resuelta_en is not null))`.
      Índice único parcial `alertas_documentacion_origen_abierta_idx (origen_tabla, origen_id, tipo)
      where estado = 'abierta'`. **No hay columna `resuelta_por`**: esa es de `propuestas_cita`.
    - `authenticated` tiene `grant select, update` (`20260822094547:1578`). La política
      `alertas_documentacion_modificacion` (`20260822160000:1328`) exige `rol_actual() is not null`
      y además ser administrador, `profesional_id = uid` o profesional asignado. La tabla la audita
      el bucle genérico de `20260829150000:313-365` (`auditar_alertas_documentacion`, después de
      insert, update y delete).
    - `fn_alertar_nota_sin_firmar()` (`20260906120000:453-499`) es `security definer`, con
      `search_path = ''` y `revoke execute … from public`. Su disparador `alertar_nota_sin_firmar`
      es **`after update of estado on public.citas`**. Abre la alerta solo cuando la cita **pasa** a
      `realizada` con `fin <= now()`, y solo si no hay ninguna versión de ninguna nota con
      `n.cita_id = cita`. Inserta `(paciente_id, profesional_id, centro_id, 'nota_sin_firmar',
      'citas', cita.id, (fin at time zone 'UTC')::date)` con `on conflict do nothing`. El
      `profesional_id` de la alerta es el de la cita.
    - **Nada la resuelve al firmar.** La función `agenda_citas_rango()` de T-014 calcula
      `nota_pendiente` a partir de esa alerta abierta, así que, sin resolverla, la agenda seguiría
      avisando «nota pendiente» con la nota ya firmada.
    - **`notas_clinicas.cita_id` no está atado a su cita** (`20260906120000:396`): solo tiene la
      clave ajena a `citas(id)` y la congelación tras la primera versión. Ninguna regla exige que la
      cita sea del mismo paciente ni que su profesional sea el autor. Un profesional asignado puede
      crear por PostgREST una nota suya con el `cita_id` de una cita ajena.
    - El banco 15 (`scripts/rls/15-agenda.sql:283-345`, §H) ya abre la alerta así: `insert` como
      `postgres` de una cita de anteayer y `update … set estado = 'realizada'`.
    - `pg_temp.sobre_prueba(p_nota_id, p_autor_id, p_creada_en, p_cuerpo, …, p_cita_id,
      p_margen_sesion_minutos, …)` (`scripts/rls/00-ayudantes.sql:203`) lee de la cabecera
      paciente, episodio, fecha y coprofesional. Se llama como `postgres`.
19. La siembra no tiene ninguna nota con `cita_id` (`seed-completo.sql:362-376`), ni la tiene
    ningún banco de `scripts/rls/`. Un índice único parcial por `(cita_id, autor_id)` entra sin
    conflicto. El borrador sembrado es `{"texto":"…"}`.

### Interfaz y framework

20. `app/(app)/pacientes/[id]/acciones.ts`:
    - `abrirPestanaDeHistoria` sigue el orden Zod → registro → lectura solo si `ok`.
    - `ResultadoDeApertura.historial` solo trae datos para `historial_clinico`.
    - `ipDeLaPeticion` es **privada** y, al estar en un fichero `'use server'`, no se puede
      exportar porque no es asíncrona.
21. `panel-historia.tsx:223` pinta `<EnPreparacion explicacion={t('ficha.notasEnPreparacion')}/>`
    para `notas_clinicas`. `FormularioPinHistoria({ alAbrirse })` está en
    `formulario-pin-historia.tsx:27`.
22. `components/ui/area-texto.tsx` existe: `AreaTexto(props: ComponentProps<'textarea'> &
    {etiqueta; errores?})`. *El diseño del 15-09 decía que no había primitiva.* `Button` ya mide
    `min-h-11`, desde el commit `5fe8400`, así que el `min-h-11` local deja de hacer falta.
23. `components/ui/piezas.tsx`:
    - `Pildora({tono:'success'|'info'|'warning', children})`;
    - `EstadoVacio({icono?, frase, explicacion?, accion?})`;
    - `Cargando({filas?})`, con `role="status"`;
    - `Tarjeta({className?, children})`;
    - `EncabezadoDeModulo` y `AvisoDeError({mensaje, accion?})`.
24. `lib/i18n`:
    - `t(clave)` y `tCon(clave, valores)` con huecos `{nombre}`;
    - `es.ts` usa **CRLF**;
    - `sin-literales.test.ts` rechaza texto visible fuera del catálogo en `app/` y `components/`,
      incluidos los atributos `aria-label, title, placeholder, alt, etiqueta`.
25. Next 16:
    - `app/layout.tsx` exporta `viewport` y, desde T-033, envuelve el aviso de modo local en
      `<Suspense>`.
    - `generate-viewport.md:135` documenta `interactiveWidget`.
    - En `page.md:75`, `searchParams` es una `Promise`.
26. `lib/fechas/formato.ts` exporta `formatearHora`, `formatearFechaCorta` y `formatearRango`, que
    reciben `(Date, zona)`. `lib/fechas/zona.ts` exporta `resolverZona(centro, organización)`. No
    hay helper para obtener la fecha local en formato `AAAA-MM-DD`.
27. **T-033** dejó `lib/cuentas/modo-desarrollo.ts`, con `superarSegundoFactorSembrado(supabase)`.
    Un guion por el camino de la aplicación puede llegar a `aal2` igual que el inicio de sesión
    local, sin TOTP a mano. `scripts/t032-alta.ts` es el precedente de un guion así: `tsx`, parche
    de `server-only` y `signInWithPassword` con `ana@psicogestion.test`.
28. **T-014** (rama `T-014-correcciones`, todavía no en `main`):
    - `app/(app)/agenda/notas.ts` tiene `RUTA_NOTAS_DISPONIBLE = false` y
      `rutaNotas(pacienteId, citaId)`, que devuelve `/pacientes/${p}/historia/notas?cita=${c}`.
    - `notas.test.ts` **afirma que vale `false`**.
    - `vista.test.ts` la enciende con un `vi.mock` de getter.
    - En `vista.ts:263`, `mostrar` exige la ruta encendida, que la cita sea propia y que no esté
      ni cancelada ni sin asistencia.
    - Trae la migración `20260926120000_agenda_citas_rango.sql` y el banco
      `scripts/rls/18-agenda-rango.sql`, y toca `lib/i18n/es.ts` y `tipos-bd.ts`.

---

## 1 · Piezas y contratos

### 1.1 · El sobre (era 4): T-012 lo consume, no lo toca

*(Actualizado el 01-10-2026: T-012a y T-012c ya están en `main`.)* La forma, el disparador y las
negativas están hechos (hechos 1-4). T-012 **no cambia** la forma del sobre, ni la migración del
sello, ni los generadores del banco. De `lib/huella/**` solo cambia el lanzamiento de error de
`firmar.ts` (§1.3.b), y lo cambia allí porque el contrato dice «se corrige allí, no se parchea
aquí».

De dónde sale cada campo de `EntradaFirma` en `firmarNota`. **Nada sale del formulario salvo
`alcance` y `motivo`:**

| Campo | Origen |
|---|---|
| `notaId, pacienteId, episodioId, autorId, coprofesionalId` | la cabecera releída (`autorId` además tiene que ser `usuario.id`) |
| `fechaSesion` | `cabecera.fecha_sesion`, cadena tal cual la da PostgREST, **nunca** `new Date()` |
| `cuerpo` | `{ texto }` de `borrador_contenido`, validado con `esquemaCuerpo` |
| `anotacionesReservadas` | `reservadas` del borrador; `''` se convierte en `null` |
| `motivoCambio` | entrada del formulario; `null` en v1 |
| `alcance` | entrada del formulario, solo si `puedeSerConjunta`; si no, `'individual'` |
| `citaId` | `cabecera.cita_id` |
| `ventanaCita` | `citas.inicio/fin` de esa cita |
| `margenMinutos` | `centros.margen_sesion_minutos ?? organizacion.margen_sesion_minutos` |
| `abiertaEn` | `new Date(cabecera.borrador_abierta_en)`; truncar a milisegundos es inocuo porque queda ≤ el original |
| `ahora` | no se pasa; lo pone `construirSobre` |

### 1.2 · Migración de T-012

*(Actualizado el 01-10-2026.)* Fichero único:
`supabase/migrations/20261002120000_nota_clinica_borrador_firma.sql`. La marca tiene que ser
**posterior a `20261001120000` (T-012c) y a `20260926120000` (T-014)**. Si al integrar ya hay en
`main` una migración con marca mayor (T-035 o T-036), se renombra con una marca posterior a todas.
El orden de los pasos es parte del diseño:

1. **`alter table public.notas_clinicas add column borrador_abierta_en timestamptz;`**
   *Por qué columna propia y no clave del JSON*: `authenticated` tiene `update` de tabla entera.
   Dentro de `borrador_contenido`, el cliente la escribiría por PostgREST. Escrita **solo** por
   disparador, no la elige nadie (ADR-046).
2. **Relleno**:
   `update public.notas_clinicas set borrador_abierta_en = borrador_actualizado_en where borrador_contenido is not null;`
   Es seguro por tres motivos:
   - el `update of` de `congelar_cabecera_sellada` y de `exigir_episodio_coherente` no incluye
     esta columna;
   - `fn_tocar_borrador` no mueve el testigo si el contenido no cambia;
   - va **antes** del paso 4.
3. `alter table public.notas_clinicas add constraint notas_clinicas_borrador_abierta_ck check ((borrador_abierta_en is null) = (borrador_contenido is null));`
4. **`create or replace function public.fn_tocar_borrador()`**. Misma firma, mismo disparador y
   sigue siendo invoker. Cuerpo:

```sql
  if new.borrador_contenido is null then
    new.borrador_actualizado_en := null;
    new.borrador_autor_id := null;
    new.borrador_abierta_en := null;               -- firmar o descartar cierra la ventana
  else
    -- abierta_en: la primera vez now(), después la que ya había. Lo que mande el llamante
    -- se ignora SIEMPRE (ADR-046: no es una casilla).
    new.borrador_abierta_en := coalesce(
      case when TG_OP = 'UPDATE' then old.borrador_abierta_en end, now());
    if TG_OP = 'INSERT' or new.borrador_contenido is distinct from old.borrador_contenido then
      new.borrador_actualizado_en := now();
    else
      -- NUEVO: sin cambio de contenido, el testigo tampoco cambia. Antes sobrevivía el que
      -- mandara el cliente (hecho 10) y el bloqueo optimista se podía falsear.
      new.borrador_actualizado_en := old.borrador_actualizado_en;
    end if;
  end if;
  return new;
```

5. *(Retirado el 01-10-2026.)* `fn_vaciar_borrador_al_firmar()` **no se crea**: ya existe (hecho
   5). Con el paso 4, al vaciar `borrador_contenido` también se vacía `borrador_abierta_en`, en la
   misma transacción que la firma.
6. **Margen**. `alter table public.organizacion add column margen_sesion_minutos smallint not null default 15 check (margen_sesion_minutos between 0 and 120);`
   y `alter table public.centros add column margen_sesion_minutos smallint check (margen_sesion_minutos between 0 and 120);`
   El valor nulo significa que hereda, igual que `zona_horaria`. Cada columna lleva su `comment on
   column` citando el ADR-046. Los 15 minutos los confirmó el propietario el 15-09-2026 (commit
   `5fe8400`): es el mismo número que la ventana del candado.
7. *(Retirado el 01-10-2026.)* No hay función `margen_sesion_de_cita`. `centros` y `organizacion`
   se pueden leer con la RLS (hecho 17), así que la acción los lee directamente. Una función
   `definer` menos.
8. **NUEVO**:
   `create unique index notas_clinicas_cita_autor_uidx on public.notas_clinicas (cita_id, autor_id) where cita_id is not null;`
   Así dos aperturas simultáneas de la misma cita (StrictMode, dos dispositivos) no crean dos
   cabeceras con dos `abierta_en`. La segunda recibe 23505 y relee. Es seguro con los datos
   existentes (hecho 19).
9. **`fn_resolver_alerta_nota_sin_firmar()`** *(D2: entra en T-012 por decisión del propietario
   del 01-10-2026. Reescrito ese día: ahora ata la cita a la nota)*. Lleva `language plpgsql`,
   `security definer`, `set search_path = ''`, `revoke execute … from public` y un `comment on
   function` que diga que no lee ni escribe nada clínico. Su disparador es
   `resolver_alerta_nota_sin_firmar`, **`after insert on public.notas_clinicas_versiones for each
   row`**:

```sql
declare
  v_cita uuid;
begin
  -- La cita cuenta solo si es DE ESTA NOTA: mismo paciente y su profesional es el autor.
  -- notas_clinicas.cita_id no está atado a la cita por ninguna otra regla (hecho 18) y esta
  -- función es definer: sin estas dos condiciones, firmar una nota propia con el cita_id de
  -- una cita ajena cerraría una alerta que quien firma no puede ni ver.
  select c.id into v_cita
    from public.notas_clinicas n
    join public.citas c on c.id = n.cita_id
   where n.id = new.nota_id
     and c.paciente_id    = n.paciente_id
     and c.profesional_id = n.autor_id;

  if v_cita is null then             -- nota sin cita, o cita que no es de esta nota
    return null;
  end if;

  update public.alertas_documentacion
     set estado = 'resuelta', resuelta_en = now()
   where origen_tabla = 'citas'
     and origen_id    = v_cita
     and tipo         = 'nota_sin_firmar'
     and estado       = 'abierta';     -- la v2 no mueve el resuelta_en que dejó la v1
  return null;
end;
```

   - **Solo escribe las columnas del hecho 18**: `estado` y `resuelta_en`, las dos a la vez porque
     lo exige el check. No hay `resuelta_por`. Quién firmó ya consta en la versión y en `auditoria`.
   - **Por qué `definer`.** Es la gemela de `fn_alertar_nota_sin_firmar`, que también lo es, y
     resolver no puede depender de que `alertas_documentacion_modificacion` deje ver la fila a quien
     firma: el `profesional_id` de la alerta se copió de la cita al abrirla, y una firma como
     `postgres` (siembra, bancos) no tiene `auth.uid()`. *(El diseño anterior lo justificaba por el
     traspaso. Con la cita atada al autor, esa justificación ya no basta por sí sola.)*
   - **Por qué el `join` con `citas`.** Es lo que impide que un `definer` sea una puerta. Solo toca
     la alerta de una cita del mismo paciente cuyo profesional es quien firma, que en el caso normal
     es justo la que esa persona podría resolver por RLS (`profesional_id = uid`).
   - **Nunca lanza.** Cero filas es el caso normal: nota sin cita, cita ajena o alerta ya resuelta o
     inexistente. Un error en un disparador `after insert` tumbaría la firma, y una alerta no puede
     impedir firmar.
   - **Es más estricta que la función que abre la alerta, y a propósito.**
     `fn_alertar_nota_sin_firmar` no abre la alerta si existe *cualquier* versión con
     `n.cita_id = cita`, sin mirar ni paciente ni autor. Esa holgura es anterior a T-012 y este
     ticket no la toca (ver «Lo que no entra»).
   - *Por qué entra*: sin este paso, la nueva entrada de T-014 miente justo después de firmar
     (hecho 18).
10. Después: `npm run lint:migraciones`, `npx supabase db reset` y `npm run tipos`, siempre juntos.
    `tipos-bd.ts` se regenera, no se edita a mano.

### 1.3 · Código de apoyo

**a) `lib/notas/`** (nuevo). Puro salvo `servidor.ts`.

| Fichero | Contrato |
|---|---|
| `cuerpo.ts` | `esquemaCuerpo = z.object({ texto: z.string() }).strict()`, que es la forma de la siembra y de los vectores (hecho 6). `esquemaBorrador = z.object({ texto: z.string(), reservadas: z.string().default('') })` es tolerante al leer, porque el borrador sembrado no lleva `reservadas`; al escribir se mandan siempre las dos claves. `SIN_NULO = /^[^\u0000]*$/`. *Cambio del 01-10: sin `formato`* (§2.7). |
| `estado.ts` | `EstadoNota = 'borrador' \| 'firmada' \| 'modificada' \| 'firmada_con_cambios'`; `estadoDeNota({versiones, hayBorrador})` (§2.6). Sin «pendiente»: una nota sin cabecera no es una nota. |
| `comparar.ts` | `Segmento = {tipo:'igual'\|'anadido'\|'retirado'; texto}`; `compararTextos(antes, despues): Segmento[]`, LCS por palabras que conserva los espacios. |
| `sello.ts` | `leerSello(contenidoCanonico: string): SelloLeido \| null`, con `SelloLeido = {citaId: string\|null; abiertaEn: Date; firmadaEn: Date; redactadaEnSesion: boolean; margenMinutos: number\|null; fechaSesion: string}`. Parsea con `esquemaSobre`; devuelve `null` si falla o si `esquema_version !== 4`. `fraseDelSello(s: SelloLeido \| null, zona: string): string` produce la frase de §2.13 con `tCon`. |
| `fecha.ts` | `fechaDeSesion(inicio: Date, zona: string): string` en formato `AAAA-MM-DD`, con `format(…, 'yyyy-MM-dd', {in: tz(zona)})` de `@date-fns/tz` (ya es dependencia). |
| `coprofesional.ts` | `ROLES_COPROFESIONAL = ['profesional_sanitario'] as const`. **T-035 añade `'administrador'`** (ADR-073.2) en esta línea y en ningún otro sitio. |
| `exportar.ts` | `componerExportacion(n: NotaExportable): string`, pura (§2.11). |
| `servidor.ts` | `import 'server-only'`. Las seis operaciones de §1.4 escritas como funciones `(sesion: Sesion, entrada, contexto: {ip, agente})`. **Las Server Actions solo las envuelven.** Es lo que deja al guion de §3 llamar «a lo que llamaría la Server Action» (lección de T-013a) sin cookies. |

**b) `lib/huella/firmar.ts`** (modificar, una pieza). Exporta
`class ErrorFirmaVersion extends Error { codigo: string | null }` y lanza
`new ErrorFirmaVersion(mensaje, error.code ?? null)` en lugar del `Error` de la línea 70. Mantiene
el prefijo del mensaje. Su prueba nueva comprueba que un fallo de `insert` con
`code: '42501'` llega como `ErrorFirmaVersion` con `codigo === '42501'`.

**c) `app/(app)/pacientes/[id]/peticion.ts`** (nuevo, sin `'use server'`). Recibe
`ipDeLaPeticion` movida tal cual desde `acciones.ts` de la ficha (hecho 20), para que la importen
las dos acciones.

### 1.4 · Las Server Actions

`app/(app)/pacientes/[id]/historia/notas/acciones.ts` (`'use server'`). Cada acción sigue este
orden: `exigirSesion()` → Zod → `lib/notas/servidor.ts`. Los esquemas viven en
`app/(app)/pacientes/[id]/historia/notas/esquemas.ts`, sin `'use server'`, para que el formulario
de cliente importe **el mismo** esquema. No se usa `.omit()/.pick()` sobre esquemas con `refine`
(TS-H7): cada esquema se escribe entero.

```ts
const texto      = z.string().max(60_000).regex(SIN_NULO);
const reservadas = z.string().max(20_000).regex(SIN_NULO);
export const esquemaApertura = z.object({ pacienteId: z.uuid(), citaId: z.uuid().nullable(),
  notaId: z.uuid().nullable(), episodioId: z.uuid().nullable() });   // cita XOR nota
export const esquemaBorrador = z.object({ pacienteId: z.uuid(), notaId: z.uuid(),
  testigo: z.string().min(1), texto, reservadas });                 // testigo: CADENA opaca
export const esquemaCoprofesional = z.object({ pacienteId: z.uuid(), notaId: z.uuid(),
  coprofesionalId: z.uuid().nullable() });
export const esquemaModificar = z.object({ pacienteId: z.uuid(), notaId: z.uuid() });
export const esquemaFirma = z.object({ pacienteId: z.uuid(), notaId: z.uuid(),
  testigo: z.string().min(1), alcance: z.enum(['individual','conjunta']),
  motivo: z.string().trim().min(1).max(500).regex(SIN_NULO).nullable() });
```

| Acción | Qué hace, en orden |
|---|---|
| `abrirEditorDeNota(entrada)` | 1. `registrarAccesoHistoria(sesion, pacienteId, 'notas_clinicas', …)`. Si `!ok`, devuelve `{estado:'bloqueada'}` **sin tocar ninguna tabla clínica** (ADR-058.2). 2. Con `notaId`: lee esa cabecera. Si RLS no la devuelve o es de otro paciente, `{estado:'no_disponible'}`. 3. Con `citaId`: lee la cita (`select id, paciente_id, profesional_id, inicio, fin, zona_horaria`). Si `paciente_id ≠ pacienteId` o `profesional_id ≠ usuario.id`, `{estado:'no_disponible'}`. Busca la cabecera por `cita_id` y `autor_id = usuario.id`. 4. Sin cabecera: `rpc('episodio_para_nota', {p_paciente_id, p_cita_id, p_episodio_id?})`. Si el código es **`EP001`**, devuelve `{estado:'elegir_episodio', episodios}` con los episodios propios abiertos del paciente (`episodios_asistenciales` donde `profesional_id = uid` y `cerrado_en is null`; etiqueta = modalidad + fecha de apertura en la zona). Si no, inserta la cabecera `{paciente_id, episodio_id, autor_id: uid, cita_id, fecha_sesion: fechaDeSesion(cita.inicio, cita.zona_horaria), borrador_contenido: {texto:'', reservadas:''}, borrador_autor_id: uid}`. **Con eso queda fijada `abierta_en`.** Si devuelve 23505 (índice del paso 8), relee. 5. `prolongarDesbloqueo`. 6. Devuelve `{estado:'abierta', caducaEn, nota: ModeloDeNota}`. |
| `guardarBorrador(entrada)` | `update notas_clinicas set borrador_contenido = {texto, reservadas}, borrador_autor_id = uid where id = notaId and borrador_actualizado_en = testigo`, con `.select('borrador_actualizado_en')`. Si devuelve 0 filas, desambigua con la tabla de §1.5. Después `prolongarDesbloqueo` y `{ok:true, testigo, caducaEn}`. **No registra acceso** (hecho 14). |
| `fijarCoprofesional(entrada)` | Solo sin versiones: `update … set coprofesional_id` donde `id = notaId`. Traduce el 23514 de T-034 a «Esa persona no puede figurar como coprofesional en este centro». Si ya hay versiones, 42501 de la congelación, que se traduce a «Ya firmada: no se cambia». Prolonga. |
| `empezarModificacion(entrada)` | Solo el autor (ADR-059). `update … set borrador_contenido = {texto y reservadas de la versión vigente}, borrador_autor_id = uid where id = notaId and borrador_contenido is null`. **Con eso se fija la `abierta_en` de la versión siguiente.** Si devuelve 0 filas y ya hay borrador, devuelve el modelo tal cual: no se pisa. Prolonga. |
| `firmarNota(entrada)` | §1.5. |
| `descargarNotaCompleta({pacienteId, notaId})` | 1. Si `rpc('desbloqueo_vigente')` es nulo, `{ok:false, bloqueada}`. 2. `insert accesos_historia {perfil_id: uid, paciente_id, tipo:'exportacion', pestana:'notas_clinicas', agente, ip}` **antes** de leer. Si falla, no se lee. 3. Lee la cabecera y todas las versiones por `numero_version` (con `contenido_canonico` y `huella`), más los nombres de `directorio_perfiles`. 4. `{ok:true, nombre: 'nota-<notaId>.txt', texto: componerExportacion(…)}`. El cliente lo descarga como `Blob`. |

`ModeloDeNota`. Un modelo de vista **estrecho**: nada de filas crudas ni del `contenido_canonico`
en la pantalla.

```ts
type VersionDeVista = { numero: number; autor: string; firmadaEn: string /* formateada en servidor */;
  motivo: string | null; alcance: 'individual'|'conjunta'; texto: string; reservadas: string | null;
  sello: string /* fraseDelSello */; huellaCorta: string /* 12 hex */ };
type ModeloDeNota = { notaId: string; soyAutor: boolean; estado: EstadoNota;
  cabecera: { fechaSesion: string; horario: string | null; episodio: string;
              coprofesional: { id: string; nombre: string } | null };
  borrador: { texto: string; reservadas: string; testigo: string } | null;
  versiones: VersionDeVista[];                          // de la 1 a la vigente
  candidatosCoprofesional: { id: string; nombre: string }[];   // vacío si hay versiones o !soyAutor
  puedeSerConjunta: boolean };
```

- La zona de formato es `cita.zona_horaria` si hay cita y, si no, `organizacion.zona_horaria`
  (ADR-034). Las horas se formatean en el servidor.
- Candidatos a coprofesional: las filas de `perfiles_centros` con `centro_id` igual al del
  episodio y `hasta is null`, cruzadas con `directorio_perfiles` donde
  `rol ∈ ROLES_COPROFESIONAL`, `estado = 'activo'` e `id ≠ uid`. Es la misma regla que el
  disparador (hecho 11), y el disparador es quien manda.
- `puedeSerConjunta` es verdadero si la modalidad del episodio no es `individual` **y** hay más de
  un participante con `baja_en is null` en `episodio_participantes`.

### 1.5 · Firmar, paso a paso (la pieza cara)

```
firmarNota(entrada):
  1  sesion = exigirSesion(); esquemaFirma.parse
  2  cabecera = select id, paciente_id, episodio_id, autor_id, fecha_sesion, cita_id,
                       coprofesional_id, borrador_contenido, borrador_actualizado_en,
                       borrador_abierta_en from notas_clinicas where id = notaId
     · sin fila                    → {ok:false, motivo:'bloqueada'}   (RLS: candado o sin acceso)
     · autor_id ≠ uid              → {ok:false, motivo:'no_autor'}    (ADR-059, con palabras)
     · paciente_id ≠ pacienteId    → {ok:false, motivo:'no_disponible'}
     · borrador nulo               → {ok:false, motivo:'sin_borrador'} (doble pulsación tras firmar)
     · actualizado_en ≠ testigo    → {ok:false, motivo:'conflicto'}
  3  {texto, reservadas} = esquemaBorrador.parse(borrador_contenido)   // se firma LO GUARDADO
     · texto.trim() vacío          → {ok:false, motivo:'vacia'}
  4  si cita_id: cita = select inicio, fin, centro_id from citas where id = cita_id
        · sin fila → ABORTA {motivo:'cita_ilegible'}                   (§2.4)
        margen = centros.margen_sesion_minutos ?? organizacion.margen_sesion_minutos
        · nulo → ABORTA
  5  versiones = count where nota_id
     · > 0 y motivo nulo → {motivo:'falta_motivo'} SIN insertar; = 0 → motivo := null
  6  alcance := puedeSerConjunta ? entrada.alcance : 'individual'
  7  firmarVersionNota(supabase, EntradaFirma de §1.1)
     · ErrorFirmaVersion.codigo:
         42501 → releer: sin fila → 'bloqueada'; si no → 'no_disponible'
         23514 → 'conflicto' (la cabecera cambió entre 2 y 7) — no se reintenta en silencio
         23505 → 'conflicto' (otra firma entró antes)
         otro  → 'error'
  8  el disparador sella y encadena; vaciar_borrador_al_firmar y resolver_alerta… en la misma
     transacción
  9  prolongarDesbloqueo; releer y devolver el ModeloDeNota nuevo
```

**El paso 3 es contrato**: `firmarNota` **no recibe el texto**. El editor guarda primero y firma
después, con el testigo que le devolvió el guardado.

**Desambiguar las cero filas** de un `update` condicionado (en `guardarBorrador`,
`fijarCoprofesional` y `empezarModificacion`). Se relee
`select id, autor_id, borrador_actualizado_en`:

| Relectura | Diagnóstico | Qué se dice |
|---|---|---|
| sin fila | candado cerrado o sin acceso | pantalla de bloqueo con PIN |
| `autor_id ≠ uid` | no soy el autor | «Esta nota solo la corrige quien la escribió (ADR-059). Si llevas el caso, escribe una nota nueva.» |
| testigo distinto | conflicto real | «Se guardó desde otro sitio» y la opción de cargar lo guardado; **no se pisa** |

### 1.6 · Interfaz

| Fichero | Qué es |
|---|---|
| `app/(app)/pacientes/[id]/historia/notas/page.tsx` | **Servidor, armazón** (ADR-058). Hace `await params` y `await searchParams`, y valida `cita` y `nota` como UUID; si llegan las dos, o una no es UUID, `notFound()`. Con `cargarPaciente(id)` (de `../../datos`) obtiene el nombre; si es nulo, `notFound()`. Con `cita` lee `citas(inicio, fin, zona_horaria, paciente_id)` (no es clínico) y pinta «Sesión del {fecha} · {rango}». Si la cita no es de ese paciente, `notFound()`. **No lee `notas_clinicas` ni `_versiones`.** Exporta `viewport: Viewport = { interactiveWidget: 'resizes-content' }`. Sin `use cache`. Monta `<EditorDeNota pacienteId citaId notaId/>`. |
| `.../editor-de-nota.tsx` | `'use client'`. Máquina de estados: `inicial` (botón «Abrir el editor») → `bloqueada` (pantalla de bloqueo + `FormularioPinHistoria alAbrirse={reintentar}`) → `elegir_episodio` → `abierta`. Lleva el reloj del candado copiado de `panel-historia.tsx`, el autoguardado (§2.9), los dos cuerpos con `AreaTexto`, el selector de coprofesional (`Desplegable`) y el diálogo de firma (`Dialogo`) con motivo y alcance. **D3**: firmar va dentro de `startTransition`; el botón «Firmar» del diálogo y el de la barra que lo abre llevan `disabled={pendiente}` (el `isPending` de `useTransition`), y el manejador sale sin llamar a la acción si ya hay una firma en vuelo. Esto es mitigación de interfaz, no la defensa de fondo (§4.5). |
| `.../barra-de-acciones.tsx` | `'use client'`. Barra táctil abajo (§2.8): Guardar, Firmar/Modificar, Comparar, Descargar. |
| `.../comparador.tsx` | `'use client'`. Selector de dos versiones y pinta los `Segmento` (§2.5). |
| Piezas de pintura de §7 (P1-P8) | `estado-de-nota.tsx`, `sello-de-nota.tsx`, `fila-de-version.tsx`, `modificada-por.tsx`, `aviso-reservadas.tsx`, `esqueleto-editor.tsx`, `cabecera-de-nota.tsx`; `lista-de-notas.tsx` en `app/(app)/pacientes/[id]/`. |
| `app/(app)/pacientes/[id]/acciones.ts` | `ResultadoDeApertura` gana `notas: ResumenDeNota[] \| null`, que se rellena con `pestana === 'notas_clinicas'`. `ResumenDeNota = {id, fechaSesion (formateada), estado: EstadoNota, versiones: number, autor: string, conjunta: boolean, href}`. **No lleva texto.** `href` = `?cita=` si la nota tiene cita, `?nota=` si no. |
| `app/(app)/pacientes/[id]/panel-historia.tsx` | El `EnPreparacion` de `notas_clinicas` se sustituye por `<ListaDeNotas notas={…}/>`. |
| `app/(app)/agenda/notas.ts` y `notas.test.ts` | **Activación de T-014**: `RUTA_NOTAS_DISPONIBLE = true`, y el comentario pasa a «T-012 creó la ruta». La prueba pasa a `toBe(true)`. Si el `vi.mock` de `vista.test.ts` queda redundante, **se deja** (no es territorio). Se hace en el mismo commit que crea `page.tsx`, para que nunca exista un enlace a un 404. |
| `lib/i18n/es.ts` | Namespace nuevo `notas` (§7 lista las claves de pintura; el implementador añade las de comportamiento). Se borra `ficha.notasEnPreparacion`. **CRLF.** |

---

## 2 · Decisiones y alternativas descartadas

**2.1 · El sobre ya no es de este ticket.** *(01-10: el corte previo se hizo como T-012a y
T-012c.)* T-012 no abre era nueva ni toca la forma del sobre. Descartado: «aprovechar» para
cotejar `cita_id` o `abierta_en` en el disparador, porque T-036 redefine esa misma función y
dos tickets redefiniéndola a la vez es justo lo que prohíbe la regla de un solo dueño de
`supabase/`.

**2.2 · `abierta_en` en una columna propia, escrita solo por disparador.** Descartados: dentro de
`borrador_contenido` (por el `grant update` de tabla entera), en una cookie (no sobrevive a un
cambio de dispositivo) y escrita por la acción (mismo agujero que la primera).

**2.3 · Abrir el editor escribe un borrador vacío.** Así `abierta_en` es «se abrió» y no «se
tecleó». Precio: un borrador vacío abandonado, que el ADR-036 ya prevé.

**2.4 · Si la cita no se puede leer, la firma se aborta.** Sellar `false` por no haber podido leer
la ventana guardaría para siempre una afirmación falsa.

**2.5 · La comparación no usa el color como único canal.** `<ins>`/`<del>`, subrayado y tachado,
prefijo `+`/`−` visible y `sr-only` («Añadido:» / «Retirado:»).

**2.6 · El estado se deriva.** Sin versiones y con borrador, `borrador`. Con una versión y sin
borrador, `firmada`. Con más de una y sin borrador, `modificada`. Con al menos una y con
borrador, `firmada_con_cambios`. *(01-10: se cae `pendiente`; una cita sin nota es un dato de la
agenda, no una nota.)*

**2.7 · El cuerpo es `{texto}` sin discriminante.** *(Cambia el 01-10.)* La siembra y los vectores
congelados del banco 14 ya son `{"texto":…}`. Un `formato` obligatorio partiría las notas en dos
formas desde el primer día. Si mañana llega texto enriquecido, una clave nueva (`formato`
ausente = texto plano) entra sin subir `esquema_version`, porque `cuerpo` es opaco para el sobre.
Sin TipTap: el contrato no nombra ninguna dependencia.

**2.8 · Diseño táctil (ADR-044).**
- (a) La barra va **abajo**, `sticky bottom-0`, con `pb-[env(safe-area-inset-bottom)]`. Usa
  `Button`, que ya mide 44 px (hecho 22).
- (b) `interactiveWidget: 'resizes-content'` en el `viewport` de la ruta. Contenedor
  `min-h-[100dvh] flex flex-col`, área con `flex-1` y `scroll-mb-24`.
- (c) Ningún atajo de teclado es la única forma de hacer algo.
- (d) Por debajo de `md`, los dos cuerpos van en un conmutador de dos `Pestanas` («Nota» /
  «Anotaciones reservadas»), con el aviso del art. 18.3 siempre visible sobre la zona reservada.
  En `md` y más ancho, apilados y visibles a la vez.

**2.9 · El autoguardado prolonga el candado; el reloj, no.** Espera de 3 s tras la última tecla y
al perder el foco. Una escritura en vuelo como máximo; la última pendiente se encola.

**2.10 · Nota conjunta (ADR-030).** El alcance solo se elige al firmar, y solo si
`puedeSerConjunta`. Si no, no se pinta ningún control. El diálogo dice tres cosas: la leerán los
profesionales del episodio, es un solo eslabón y no se entregará entera en un acceso individual.

**2.11 · La descarga es texto plano.** Por cada versión: número, autor, fecha, motivo, alcance,
sello, los dos cuerpos, `huella` y `huella_anterior` en hex, y el `contenido_canonico` literal.
Encabezado: copia íntegra para uso profesional o judicial; **incluye anotaciones reservadas**; no
es la salida del derecho de acceso.

**2.12 · U+0000 se rechaza en Zod**, antes de que la base devuelva 22P05.

**2.13 · La frase del sello sale entera del sobre sellado.** *(Nueva el 01-10.)* Se usan
`abierta_en–firmada_en` y no el horario de la cita: «Escrita durante la sesión del 26/08 ·
17:05–17:52» describe **cuándo se escribió**, y eso es lo que prueba la huella. El horario de la
cita es un dato mutable de otra tabla. Las tres formas son:
- en sesión: «Escrita durante la sesión del {fecha} · {abierta}–{firmada}»;
- fuera de sesión: «Escrita fuera de la sesión del {fecha} · {abierta}–{firmada}»;
- sin cita: «Escrita el {fecha} · {abierta}–{firmada}».

Si `abierta` y `firmada` caen en días locales distintos, cada hora va con su `dd/MM`. Un sobre
ilegible se pinta como «Sello no legible», nunca como `false`.

*(Enmienda del 02-10-2026, decisión del propietario sobre R2-H12; ver §E.)* Hay una **cuarta
forma**, y la tercera se acota al mismo día:
- sin cita y el mismo día local: «Escrita el {fecha} · {abierta}–{firmada}» (`notas.sello.sinCita`);
- sin cita y días locales distintos: «Escrita entre el {abierta} y el {firmada}»
  (`notas.sello.sinCitaVariosDias`), con fecha y hora en cada extremo, y año en los dos si cruzan
  de año.

Las dos formas con cita no cambian.

**2.14 · El margen se lee directamente.** *(Nueva el 01-10.)* Descartada la función `definer`
`margen_sesion_de_cita`: `centros` y `organizacion` ya se pueden leer, y una función con
privilegios que no hace falta es superficie de ataque sin uso.

**2.15 · Un índice único por cita y autor**, en lugar de un `select`-y-luego-`insert` en la
acción. La carrera de dos aperturas solo la cierra la base.

**2.16 · Se resuelve la alerta al firmar** *(D2, decidido por el propietario el 01-10-2026)*, en
lugar de dejarla para «otro ticket». La agenda de T-014 la convierte en un aviso visible, y T-012 es
quien hace verdad «ya está firmada». Descartado: resolverla desde `firmarNota` con un `update` de la
aplicación. Una versión que entre por otra puerta (PostgREST, un guion) dejaría la alerta abierta,
mientras que el disparador la resuelve venga de donde venga la versión.

**2.17 · Entrada desde la ficha.** La sub-pestaña lista las notas y enlaza a la misma ruta: con
`?cita=` si la nota la tiene y con `?nota=` si no (las notas sembradas no tienen cita). Desde la
ficha **no se crea** una nota sin cita (ver «Lo que no entra»).

**2.18 · El resolutor ata la cita a la nota.** *(Nueva el 01-10, con D2.)* Descartado: copiar el
criterio de la función que abre la alerta (`n.cita_id = cita` a secas). En un `definer`, ese
criterio permite a cualquier profesional asignado cerrar la alerta de una cita ajena firmando una
nota propia con ese `cita_id` (hecho 18). También descartado: atar `notas_clinicas.cita_id` a su
cita con un disparador en la cabecera. Cerraría además la holgura de la función que abre la alerta,
pero es otro cambio de esquema que ningún criterio pide (ver «Lo que no entra»).

**2.19 · Doble firma de una modificación: se desactiva el botón y la base no cambia.** *(D3,
decidido por el propietario el 01-10-2026.)* Descartado aquí: «exigir borrador vivo» en
`fn_sellar_version_nota`. Redefinir esa función es de T-036 (§2.1), y el propietario ha decidido
que el arreglo llegue con ese mismo cambio.

---

## 3 · Cómo se cierra cada criterio de aceptación

*(Cambia el 01-10.)* Las negativas de la base ya las prueban los bancos 10 y 14. Lo nuevo de
T-012 es **el camino de la aplicación**, y eso lo cierra un guion,
`scripts/t012-nota.ts` (`npx tsx scripts/t012-nota.ts`), con el mismo patrón que
`scripts/t032-alta.ts`:
- preparación como `postgres` vía `scripts/psql.mjs`: PIN de Ana con `crypt('123456')` en
  `pines_historia`, y dos citas de Ana con un paciente suyo de la siembra, una de `now()−10 min` a
  `now()+40 min` y otra de ayer;
- sesión real con `signInWithPassword`, más `superarSegundoFactorSembrado` si el RPC lo exige;
- `desbloquearHistoria`, y después **las funciones de `lib/notas/servidor.ts`**;
- comprobación con `psql`.

Es idempotente: crea citas nuevas en cada ejecución. Las migraciones nuevas tienen además su banco
**`scripts/rls/20-nota-borrador.sql`** (el 18 es de T-014 y el 19 de T-034).

| # | Criterio | Cómo se demuestra |
|---|---|---|
| 1 | v1: `numero_version = 1`, `huella` no nula, `huella_anterior` de 32 ceros | Guion: paciente sin cadena previa (uno nuevo, dado de alta con `alta_paciente` como en t032). Abrir, guardar y firmar. `psql` comprueba las tres columnas y `posicion_cadena = 1`. |
| 2 | SHA-256 del `contenido_canonico` releído da la `huella` | Guion: `select digest(convert_to(contenido_canonico,'UTF8') \|\| huella_anterior,'sha256') = huella` leyendo la columna. Después, `npm run verificar:huellas` íntegra. |
| 3 | `redactada_en_sesion` true dentro de la ventana y false al día siguiente; tocarlo rompe la huella | Guion: firmar contra la cita en curso da `true`; firmar contra la cita de ayer da `false` (`contenido_canonico::jsonb->'redactada_en_sesion'`). Rotura: recalcular el `digest` sobre el canónico con el booleano invertido da `<> huella`. Además ya existe `sobre.test.ts:242`. |
| 4 | `update`, `delete` y `truncate` como `postgres` fallan | Guion: las tres sentencias por `psql` como `postgres` **sobre la fila que acaba de firmar el guion**. Fallan con el error de la capa de disparador. |
| 5 | Sin motivo falla; con motivo, v2 encadenada | Guion: `empezarModificacion` → `guardarBorrador` → `firmarNota` sin motivo devuelve `falta_motivo` y la cuenta de filas no cambia. Con motivo, `numero_version = 2` y `huella_anterior` = `huella` de v1. Vitest de `servidor.ts`: sin motivo **no llama** a `firmarVersionNota`. |
| 6 | NFC: misma huella | Ya cubierto por `sobre.test.ts:166` y `nfc.test.ts`. Se añade en `lib/notas/servidor.test.ts`: el mismo borrador en NFD y en NFC produce **el mismo `contenido_canonico`** (cliente simulado que captura el `insert`). |
| 7 | `anotaciones_reservadas` entra en la huella | Ya está en `sobre.test.ts:218`. Guion: v2 que solo cambia las reservadas tiene una `huella` distinta y su canónico contiene el texto. |
| 8 | **Manual** · candado cerrado: bloqueo y el HTML no contiene el borrador | `curl -s -b <cookie> http://localhost:3000/pacientes/<p>/historia/notas?cita=<c> \| grep -c "<texto sembrado>"` → `0`. Además, prueba de render del armazón: el `page.tsx` no importa nada de `notas_clinicas`. |
| 9 | **Manual** · comparación distinguible sin color | Captura en escala de grises más `comparar.test.ts`. |
| 10 | **Manual** · 360 px con teclado virtual | Guion del contrato, en un teléfono real o en emulación con teclado. |
| 11 | `disponible: true` no aplica | `git diff --stat main` no toca `components/armazon/**`. |
| 12 | `npm run lint && npm run build` | `> log 2>&1; echo "exit=$?"`. |
| M4 de T-014 | «Notas» lleva al editor y pide PIN | Manual, en `/agenda` con una cita propia: el botón aparece y lleva al armazón; «Abrir el editor» pide el PIN. |
| **A** (D2, 01-10) | Firmar resuelve la alerta `nota_sin_firmar` de su cita, y solo esa | Banco 20 §A (abajo): negativas 20.A1 y 20.A2 con su gemela 20.A3. Guion, por el camino de la aplicación: antes de firmar contra la cita de ayer, `psql` como `postgres` la pasa a `realizada` y comprueba que hay **una** alerta `nota_sin_firmar` `abierta` con `origen_id` = la cita. Después de `firmarNota`, esa misma fila tiene `estado = 'resuelta'` y `resuelta_en` no nulo. Una v2 posterior de esa nota (`empezarModificacion` → `guardarBorrador` → `firmarNota` con motivo) deja `resuelta_en` igual. Manual, en la agenda de T-014: esa cita deja de avisar «nota pendiente». |
| **B** (D3, 01-10) | El botón de firmar no admite una segunda pulsación en vuelo | `editor-de-nota.test.tsx`: con la acción de firma simulada como una promesa sin resolver, el botón «Firmar» tiene `disabled`, y dos `click` seguidos llaman a la acción **una sola vez**. No prueba la base: la base no lo impide hasta T-036 (§4.5). |

El banco 20 comprueba:
- que la base pisa `borrador_abierta_en` mandado por el cliente, en insert y en update;
- que se conserva entre guardados;
- que se vacía al firmar;
- que `borrador_actualizado_en` mandado sin cambiar el contenido no se mueve;
- el check `notas_clinicas_borrador_abierta_ck`;
- el 23505 del índice;
- la resolución de la alerta (§A, abajo);
- los `check` del margen (`-1` y `121` dan 23514).

Las pruebas del banco 20 hacen como `authenticated` lo que haría la acción, salvo las de §A.

**Banco 20 §A · La alerta `nota_sin_firmar` se resuelve al firmar** *(D2, 01-10-2026)*. Se hace
como `postgres`: el paso 0 no se aplica a `postgres` y lo que se prueba es el disparador, no la RLS.
La apertura de las alertas sigue el patrón del banco 15 §H y el sellado, el de las positivas con
cita del banco 14.
- **Preparación.**
  - Un paciente P de la fijación, con un episodio abierto E del profesional A, y otro paciente Q.
  - Cuatro citas de anteayer: C1 (P, A), C2 (Q, A), C3 (P, B, con B ≠ A) y C4 (P, A). Las tres
    de A van en horas que no se solapen: `citas_sin_solape_profesional` (`20260906120000:300`)
    cuenta también las `realizada`.
  - Las cuatro pasan a `realizada`, así que hay cuatro alertas `abiertas`. **Se asevera que lo
    están antes de firmar**: si se firmara primero, `fn_alertar_nota_sin_firmar` no las abriría y
    las negativas pasarían sin probar nada.
  - Tres cabeceras en P/E con autor A y `borrador_contenido = '{"texto":"x","reservadas":""}'`
    más `borrador_autor_id = A`, para que sigan valiendo cuando T-036 exija borrador vivo: N1 con
    `cita_id = C1`, N2 con `cita_id = C2` y N3 con `cita_id = C3`. Una cuarta, N0, sin cita.
  - Cada versión se inserta con `pg_temp.sobre_prueba(nota, A, now(), '{"texto":"x"}', …,
    p_cita_id => <cita de la cabecera>, p_margen_sesion_minutos => 15)` (`null` y `null` en N0).
- **20.A1 · NEGATIVA, cita de otro paciente.** Se firma la v1 de N2. Se asevera primero que la
  versión **entró** (`contar` = 1) y después que la alerta de C2 sigue `abierta`. Mata al mutante
  sin `c.paciente_id = n.paciente_id`.
- **20.A2 · NEGATIVA, cita de otro profesional.** Se firma la v1 de N3. Se asevera que entró y que
  la alerta de C3 sigue `abierta`. Mata al mutante sin `c.profesional_id = n.autor_id`.
- **20.A3 · GEMELA POSITIVA.** Se firma la v1 de N1. La alerta de C1 queda `resuelta` con
  `resuelta_en` no nulo y, **en la misma aserción**, las de C2, C3 y C4 siguen `abiertas`. Sin esta
  gemela, un resolutor que no hiciera nada pasaría A1 y A2. La comprobación de C4 mata además al
  mutante sin `origen_id = v_cita`.
- **20.A4 · Idempotencia.** Se firma la v2 de N1 con motivo. `assert_no_lanza`, y el `resuelta_en`
  de C1 es el mismo que había tras 20.A3. Mata al mutante sin `estado = 'abierta'`.
- **20.A5 · Nota sin cita.** Se firma la v1 de N0. No lanza, y el número de alertas `abiertas` no
  cambia.

`tickets/T-012/evidencia.json` recoge la salida real de: `db reset`, `npm run tipos`, `npm test`,
`npm run test:rls`, `npx tsx scripts/t012-nota.ts`, `verificar:huellas`, `lint:migraciones`,
`lint` y `build`.

---

## 4 · Riesgos, por probabilidad

1. **Alta · El testigo pierde precisión al pasar por `Date`.** PostgREST lo da con microsegundos.
   Va como `string` en toda la cadena, con una prueba que usa seis decimales.
2. **Alta · Las cero filas se leen como conflicto.** Se aplica la tabla de §1.5, con una prueba
   por rama.
3. **Alta · Conflicto al integrar con T-014**, en `lib/i18n/es.ts` (CRLF, los dos añaden un
   namespace), `tipos-bd.ts` (se regenera, no se resuelve a mano) y `notas.ts` (no existe en
   `main` hasta que entre T-014). **T-012 empieza desde un `main` que ya tenga T-014.**
4. **Media · Falsificar el sello por PostgREST.** *(D1: riesgo residual declarado. Lo cierra
   T-036, por decisión del propietario del 01-10-2026.)* El autor puede insertar a mano una versión
   con `cita_id`, `abierta_en`, `firmada_en` o `redactada_en_sesion` inventados: el disparador
   comprueba los tipos, no el origen (hecho 4). Ya pasaba antes de T-012, y T-012 no lo agranda.
   **T-012 sale con este riesgo**, y T-036 va inmediatamente después. Su contrato escrito hoy solo
   cubre el `cita_id` (H27). Para cerrar el resto le faltan dos comprobaciones que T-012 hace
   posibles: cotejar `abierta_en` con `borrador_abierta_en`, y recalcular `redactada_en_sesion` con
   la ventana de la cita y el margen sellado (§D). La bitácora de T-012 lo anota en `docs/state.md`.
5. **Media · Doble firma de una modificación.** *(D3: hallazgo abierto. Lo cierra T-036, por
   decisión del propietario del 01-10-2026.)* Dos pulsaciones concurrentes de «Firmar v2» con motivo
   pueden dar una v2 y una v3 idénticas, porque la segunda leyó el borrador antes de que la primera
   lo vaciara. La v1 doble ya la para el `check` del motivo. **Mitigación en T-012, y solo esta**:
   - el botón desactivado mientras la firma está en vuelo (§1.6, criterio B);
   - el paso 2 de §1.5, que devuelve `sin_borrador` si el borrador ya se vació.

   No cubre dos pestañas, dos dispositivos ni una llamada directa a la acción o a PostgREST. El
   cierre de verdad es «exigir borrador vivo» en `fn_sellar_version_nota`, en el mismo cambio de
   T-036, cuyo contrato **hoy no lo incluye** (§D). Queda como hallazgo abierto en `docs/state.md`.
6. **Media · Reloj de Node frente al de la base.** `abierta_en` sale de `now()` en la base y
   `firmada_en` del reloj de Node. Si Node va atrasado y se firma segundos después de abrir, la
   6.8 lanza 23514 (`abierta_en <= firmada_en`). Exige teclear y guardar antes, así que es
   improbable. Se traduce a «Vuelve a intentarlo» y no se ajusta ninguna fecha.
7. **Baja · `fecha_sesion` en UTC** si alguien deja el valor por defecto. La acción la escribe
   siempre con `fechaDeSesion(cita.inicio, cita.zona_horaria)`.
8. **Baja · Lista de coprofesionales distinta de la regla de la base.** La base manda y el 23514
   se traduce. T-035 cambia una sola constante.
9. **Baja · Carrera entre abrir y resolver la alerta.** *(Nueva el 01-10, con D2.)* Si la cita
   pasa a `realizada` mientras se firma la v1, `fn_alertar_nota_sin_firmar` no ve la versión todavía
   sin confirmar y abre una alerta que el resolutor ya no volverá a mirar. Hace falta que las dos
   cosas ocurran en el mismo instante. Cerrarlo exige tocar la función que abre la alerta, y eso no
   entra (ver «Lo que no entra»). Si pasa, la alerta se resuelve a mano desde la bandeja.

---

## 5 · Qué revisar

**Lo que el llamante puede elegir, y qué efecto tiene**

- Tabla entera en `notas_clinicas`: el llamante puede mandar `borrador_abierta_en`,
  `borrador_actualizado_en`, `borrador_autor_id`, `coprofesional_id`, `cita_id` y
  `fecha_sesion`.
  - Las dos primeras las pisa el disparador: es el banco 20, y la prueba tiene que ser un
    `update` crudo como `authenticated`.
  - `coprofesional_id` lo valida T-034.
  - `cita_id` y `fecha_sesion` antes de firmar **no están atados por la base** a la cita: es H27,
    va a T-036.
  - Comprobar que la acción **nunca** los toma del cliente.
- `?cita=` y `?nota=` son entrada pública. El paciente sale del segmento de ruta. La acción exige
  `cita.paciente_id = pacienteId` y `cita.profesional_id = uid`, y que la cabecera pertenezca a
  ese paciente.
- `firmarNota` no recibe cuerpo, ni `abiertaEn`, ni `citaId`, ni `episodioId`. Si alguno aparece
  en `esquemaFirma`, es un hallazgo.
- `alcance` del formulario solo se usa si `puedeSerConjunta`.
- *(D2.)* Lo único que mueve el resolutor es el `nota_id` de la versión. Quien llama elige la nota
  (suya, por el paso 0) y, a través de su `cita_id`, una cita. El `join` con `citas`, con sus dos
  condiciones, es lo que impide que esa elección llegue a una alerta ajena (§2.18).

**Qué prueba debe fallar, y por qué motivo exacto**

- La negativa del índice único da **23505** con `assert_lanza_codigo`. No vale `assert_lanza`
  sin código.
- La negativa de conflicto de borrador tiene que fallar **porque el testigo es distinto**, con la
  sesión del autor. Con otra sesión daría cero filas por RLS y pasaría por el motivo equivocado.
- `falta_motivo` se devuelve **sin `insert`**: la prueba cuenta las llamadas al cliente simulado.
- El guion firma por `lib/notas/servidor.ts`. Una versión insertada con `psql` no prueba nada de
  T-012.
- Con un mutante, el banco 20 tiene que caer:
  - un `fn_tocar_borrador` que respete el `borrador_abierta_en` del cliente → la aserción de
    «pisado» cae;
  - resolutor sin `origen_id = v_cita` → cae 20.A3 (C4 deja de estar abierta);
  - resolutor sin `c.paciente_id = n.paciente_id` → cae 20.A1;
  - resolutor sin `c.profesional_id = n.autor_id` → cae 20.A2;
  - resolutor sin `estado = 'abierta'` → cae 20.A4 (`resuelta_en` se mueve);
  - resolutor vacío (`return null`) → cae 20.A3. La gemela es la que lo caza: A1 y A2 seguirían
    en verde.
- Las negativas 20.A1 y 20.A2 tienen que fallar **porque la cita no es de la nota**, no porque la
  versión no entrara. Cada una asevera primero que la versión existe y después que la alerta sigue
  abierta. Una firma rechazada dejaría la alerta abierta por el motivo equivocado.
- En todo el §A, la alerta se asevera `abierta` **antes** de firmar.
- *(D3.)* La prueba del botón cuenta las llamadas a la acción (una). Comprobar solo el atributo
  `disabled` no basta.

**Invariantes que se pueden saltar por otra puerta**

- **Nulos**: el check nuevo usa `(a is null) = (b is null)`, no `num_nonnulls` mezclado con el
  viejo.
- **Duplicados**: el índice parcial es `where cita_id is not null`. Una nota sin cita no queda
  limitada, y así tiene que ser.
- **Concurrencia**: apertura doble → 23505 → releer (prueba con dos llamadas en
  `Promise.all`). Firma doble → §4.5: por D3, en T-012 solo se desactiva el botón y la base no lo
  impide hasta T-036. Encontrarlo no es un hallazgo nuevo de la revisión: ya está declarado. Lo que
  sí hay que comprobar es el criterio B. Resolver la alerta dos veces es inocuo por el filtro
  `estado = 'abierta'` (20.A4).
- **`security definer`**: solo `fn_resolver_alerta_nota_sin_firmar`. Revisar:
  - que lleva `search_path = ''`, con todos los nombres calificados con `public.`, y `revoke
    execute … from public`;
  - el `join` con `citas` y sus dos condiciones (paciente y autor);
  - que solo escribe `estado` y `resuelta_en`, y solo en `origen_tabla = 'citas'`,
    `tipo = 'nota_sin_firmar'` y `estado = 'abierta'`;
  - que no lanza;
  - que de `notas_clinicas` solo lee `cita_id, paciente_id, autor_id`, y nada clínico.
- **Sello falsificable (D1)**: declarado y diferido a T-036. La revisión de T-012 comprueba solo que
  la acción toma `citaId`, `abiertaEn` y la ventana de la base y nunca del cliente (arriba). Que el
  disparador no los coteje no es un fallo de T-012.
- **TRUNCATE y tabla entera**: las tres capas se comprueban sobre la fila del guion.
- **Candado**: ninguna lectura clínica antes de `registrarAccesoHistoria` en `abrirEditorDeNota`.
  `descargarNotaCompleta` mira `desbloqueo_vigente()` antes de escribir el acceso.
  `prolongarDesbloqueo` aparece solo en acciones (`grep` en `page.tsx` y componentes: 0).
- **`use cache`**: ninguna aparición bajo `historia/notas/` (ADR-043).
- **HTML**: el `page.tsx` no tiene ningún `from('notas_clinicas…')`.
- **i18n**: `sin-literales.test.ts` en verde. Ninguna cadena visible en las piezas de §7 fuera
  de `es.ts`.

---

## 6 · Territorio

*(Actualizado el 01-10.)* El contrato no declara `territorio:`. Se declara aquí:

```
supabase/migrations/2026100*_nota_clinica_borrador_firma.sql
scripts/rls/20-nota-borrador.sql          scripts/rls/README.md (una fila)
scripts/t012-nota.ts
lib/notas/**                              lib/huella/firmar.ts   lib/huella/firmar.test.ts
lib/supabase/tipos-bd.ts (generado)       lib/i18n/es.ts
app/(app)/pacientes/[id]/**               app/(app)/agenda/notas.ts   app/(app)/agenda/notas.test.ts
tickets/T-012/**                          docs/bitacora/T-012.md       docs/state.md
```

**Fuera**:
- el resto de `lib/huella/**`, `scripts/rls/14-*.sql` y `scripts/rls/19-*.sql` (los tocará T-036);
- el resto de `app/(app)/agenda/**` (`vista.test.ts` se queda como está);
- `components/ui/**` (no se reescribe ninguna primitiva) y `components/armazon/**`;
- `supabase/seed*.sql`, `next.config.ts`, `proxy.ts` y `package.json` (ninguna dependencia
  nueva).

---

## 7 · Delegable

*(Reescrito el 01-10-2026, con el detalle por pieza para encargos autocontenidos al carril
MiniMax, que trabaja por API y sin repo.)*

**Lo que es común a todos los encargos.** Hay que pegar en cada uno:
- Componentes de servidor (sin `'use client'`), TypeScript, React 19, Tailwind 4 y `cn` de
  `@/lib/utils`.
- Iconos de `lucide-react`.
- Texto **solo** con `t('clave')` o `tCon('clave', {…})` de `@/lib/i18n`, y **ningún literal
  visible** (hay una prueba que lo rompe). Las claves nuevas se entregan como bloque para pegar
  en el namespace `notas` de `lib/i18n/es.ts` (CRLF; lo pega la fábrica).
- Primitivas disponibles, con la firma exacta del hecho 23: `Pildora`, `EstadoVacio`, `Cargando`
  y `Tarjeta` de `@/components/ui/piezas`.
- Tokens de color: `text-muted-foreground`, `bg-muted`, `border-border`, `text-foreground`.
  **Nunca el color como único canal.**
- Pruebas con Vitest y `@testing-library/react` (`render`, `screen`), en un fichero hermano
  `*.test.tsx`.
- Sin estado, sin efectos, sin manejadores de eventos, sin foco y sin ARIA más allá de lo
  indicado.
- Todo vive en `app/(app)/pacientes/[id]/historia/notas/` salvo `lista-de-notas.tsx`, que va en
  `app/(app)/pacientes/[id]/`.

**P1 · `estado-de-nota.tsx`**
- Firma: `export function PildoraDeEstado({ estado }: { estado: 'borrador' | 'firmada' | 'modificada' | 'firmada_con_cambios' })`.
- Pinta una `Pildora`:
  - `borrador` → `tono="warning"`, `t('notas.estado.borrador')`;
  - `firmada` → `success`, `notas.estado.firmada`;
  - `modificada` → `success`, `notas.estado.modificada`;
  - `firmada_con_cambios` → `info`, `notas.estado.firmadaConCambios`.
- Claves:
  `notas.estado.{borrador:'Borrador', firmada:'Firmada', modificada:'Modificada', firmadaConCambios:'Firmada · con cambios sin firmar'}`.
- Pruebas: los cuatro estados pintan su texto; el texto distingue los cuatro sin depender del
  tono (cuatro cadenas distintas).

**P2 · `sello-de-nota.tsx`**
- Firma: `export function SelloDeNota({ frase, enSesion }: { frase: string; enSesion: boolean | null })`.
- Pinta un `<p className="text-sm text-muted-foreground">` con un icono decorativo
  (`aria-hidden`): `Clock` si `enSesion === true`, `CalendarClock` si `false` y `HelpCircle` si
  `null`. Después, la `frase` tal cual, que llega ya compuesta. Sin insignias ni color de
  reproche: es un hecho (contrato).
- Claves: ninguna (la frase la compone `fraseDelSello`). Para que la fábrica las pegue en
  `sello.ts`, entregar:
  - `notas.sello.enSesion:'Escrita durante la sesión del {fecha} · {desde}–{hasta}'`
  - `notas.sello.fueraDeSesion:'Escrita fuera de la sesión del {fecha} · {desde}–{hasta}'`
  - `notas.sello.sinCita:'Escrita el {fecha} · {desde}–{hasta}'`
  - `notas.sello.ilegible:'Sello no legible'`
  - `notas.sello.margen:'Margen aplicado: {minutos} min'`
- *(Enmienda del 02-10-2026, R2-H12; ver §E.)* Hay una sexta clave, que **no** está en el encargo
  de MiniMax y no se le pide: `notas.sello.sinCitaVariosDias:'Escrita entre el {desde} y el {hasta}'`.
  La pone la fábrica; ya está en `lib/i18n/es.ts` de la rama `T-012-corte-a`. A P2 no le cambia
  nada: la frase le llega compuesta.
- Pruebas: pinta la frase; el icono tiene `aria-hidden="true"` en los tres casos; no hay ningún
  `role` añadido.

**P3 · `fila-de-version.tsx`**
- Firma: `export function FilaDeVersion({ numero, autor, firmadaEn, motivo, conjunta, sello, huellaCorta, vigente }: { numero: number; autor: string; firmadaEn: string; motivo: string | null; conjunta: boolean; sello: string; huellaCorta: string; vigente: boolean })`.
- Pinta un `<li>`:
  - primera línea: `tCon('notas.version.titulo', {numero})`, más `t('notas.version.vigente')`
    entre paréntesis si `vigente`;
  - segunda: `tCon('notas.version.firmadaPor', {fecha: firmadaEn, autor})`;
  - si hay `motivo`: `tCon('notas.version.motivo', {motivo})`;
  - si `conjunta`: `t('notas.version.conjunta')`;
  - el `sello` en texto pequeño;
  - `tCon('notas.version.huella', {huella: huellaCorta})` en `font-mono text-xs`.
- Claves:
  `notas.version.{titulo:'Versión {numero}', vigente:'vigente', firmadaPor:'Firmada el {fecha} por {autor}', motivo:'Motivo del cambio: {motivo}', conjunta:'Nota conjunta del episodio', huella:'Huella {huella}…'}`.
- Pruebas: v1 sin motivo no pinta la línea de motivo; con motivo sí; con `vigente` aparece
  «vigente»; la huella va en un elemento con clase `font-mono`.

**P4 · `modificada-por.tsx`**
- Firma: `export function ModificadaPor({ fecha, autor }: { fecha: string; autor: string })`.
- Pinta `tCon('notas.modificadaPor', {fecha, autor})` en `text-sm text-muted-foreground`, con el
  icono `History` decorativo.
- Clave: `notas.modificadaPor:'Modificada el {fecha} · por {autor}'`.
- Prueba: pinta la frase con los dos valores.

**P5 · `aviso-reservadas.tsx`**
- Firma: `export function AvisoReservadas()`, sin props.
- Pinta un bloque `rounded-lg border border-border bg-muted p-3 text-sm` con un icono `ShieldAlert`
  decorativo, un título `t('notas.reservadas.titulo')` en `font-medium` y una lista `<ul>` de
  tres `<li>`: `notas.reservadas.excluye`, `notas.reservadas.noOculta`, `notas.reservadas.noOpone`.
- Claves:
  - `titulo`: 'Anotaciones reservadas (art. 18.3, Ley 41/2002)'
  - `excluye`: 'Se excluyen de las copias que se entregan al paciente.'
  - `noOculta`: 'No se ocultan al profesional que herede el caso.'
  - `noOpone`: 'No se pueden oponer a un requerimiento judicial.'
- Pruebas: los tres puntos están, en ese orden; hay exactamente un `<ul>` con tres `<li>`.

**P6 · `lista-de-notas.tsx`** (en `app/(app)/pacientes/[id]/`)
- Firma: `export function ListaDeNotas({ notas }: { notas: { id: string; fechaSesion: string; estado: 'borrador' | 'firmada' | 'modificada' | 'firmada_con_cambios'; versiones: number; autor: string; conjunta: boolean; href: string }[] })`.
- Con la lista vacía, pinta `EstadoVacio` con el icono `NotebookPen`, `frase=t('notas.lista.vacia')`
  y `explicacion=t('notas.lista.vaciaExplicacion')`.
- Con notas, pinta un `<ul>` y en cada `<li>` un `<Link href={href}>` de `next/link`,
  `min-h-11`, con:
  - la fecha en `font-medium`;
  - `PildoraDeEstado` (P1);
  - `tCon('notas.lista.versiones', {n: versiones})` si `versiones > 1`;
  - el autor;
  - `t('notas.version.conjunta')` si `conjunta`.
- Claves:
  `notas.lista.{vacia:'Todavía no hay notas', vaciaExplicacion:'Las notas se escriben desde la cita en la agenda.', versiones:'{n} versiones'}`.
- Pruebas: lista vacía → frase vacía y ningún enlace; dos notas → dos enlaces con su `href`
  exacto; `versiones: 1` no pinta el contador; `versiones: 3` pinta «3 versiones».

**P7 · `esqueleto-editor.tsx`**
- Firma: `export function EsqueletoEditor()`.
- Pinta una columna `flex flex-col gap-4` con:
  - un bloque `h-6 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none` (título);
  - un `Cargando` con `filas={6}`;
  - una barra inferior falsa `h-11 rounded bg-muted`.
- Claves: ninguna (`Cargando` trae las suyas).
- Pruebas: hay un `role="status"`; ningún elemento interactivo (`queryAllByRole('button')` vacío).

**P8 · `cabecera-de-nota.tsx`** (armazón, no clínica)
- Firma: `export function CabeceraDeNota({ paciente, sesion, volverHref }: { paciente: string; sesion: string | null; volverHref: string })`.
- Pinta:
  - un `<Link href={volverHref}>` con `ChevronLeft` y `t('notas.cabecera.volver')`, `min-h-11`;
  - un `<h1 className="font-serif text-2xl">` con `tCon('notas.cabecera.titulo', {paciente})`;
  - si hay `sesion`, `<p className="text-sm text-muted-foreground">{sesion}</p>`.
- Claves:
  `notas.cabecera.{volver:'Volver a la ficha', titulo:'Nota de {paciente}'}`.
- Pruebas: con `sesion` nula no hay `<p>` de sesión; el enlace apunta a `volverHref`; hay un
  único `h1`.

**No delegable** (la fábrica):
- `editor-de-nota.tsx` (estado, autoguardado, candado y foco);
- `barra-de-acciones.tsx` (objetivos táctiles con comportamiento);
- `comparador.tsx` (selector y `<ins>`/`<del>` con su `sr-only`; la regla de no depender del
  color es un criterio);
- el diálogo de firma y el selector de coprofesional;
- todo `lib/notas/**` (funciones puras: de la fábrica desde el 30-09);
- la migración, los bancos y el guion.

---

## 8 · Cortes propuestos

*(Actualizado el 01-10: el corte previo está hecho como T-012a y T-012c.)*

| Corte | Qué entra | Cierra |
|---|---|---|
| **A** `riesgo: alto` | Migración de §1.2, `lib/huella/firmar.ts`, `lib/notas/{cuerpo,estado,fecha,coprofesional,sello,servidor}.ts`, banco 20 y guion `t012-nota.ts`. Sin pantalla. | 1-7, 12 y A |
| **B** `riesgo: medio` | Ruta y armazón, editor, barra táctil, firma desde la pantalla, lista en la ficha, activación de `RUTA_NOTAS_DISPONIBLE`, piezas P1-P8. | 8, 10, 11, B, M4 de T-014 |
| **C** `riesgo: medio` | `comparar.ts` y el comparador, «modificada el · por», `exportar.ts` y la descarga. | 9 y la tarea de descarga |

**Nota para el corte B** *(enmienda del 02-10-2026, R2-H12; ver §E).* La pieza P2 de MiniMax
(`minimax/encargos/T-012b1.md`, línea ~205) entrega `notas.sello` con cinco claves (`enSesion`,
`fueraDeSesion`, `sinCita`, `ilegible`, `margen`) y **sin `sinCitaVariosDias`**. El encargo no se
edita. Al integrar la rama de MiniMax en `lib/i18n/es.ts`, el bloque `notas.sello` resultante es
la **unión** de las dos ramas: se conserva `sinCitaVariosDias` del corte A y se añade `margen` de P2.
Si la integración toma el bloque de P2 tal cual, `fraseDelSello` deja de compilar (la clave es
literal en `lib/notas/sello.ts`). Comprobación del revisor del corte B:
`git grep -n "sinCitaVariosDias" -- lib/i18n/es.ts lib/notas/sello.ts` da una línea en cada fichero, y
`npx tsc --noEmit` sale 0.

Orden de integración: **T-014 → T-012 → T-035/T-036**, en serie, porque los cuatro tocan
`supabase/`. T-035 cambia `ROLES_COPROFESIONAL`. T-036 recoge §4.4 y §4.5 por decisión del
propietario (D1 y D3), pero su contrato escrito solo cubre el `cita_id`: hay que ampliarlo antes de
diseñarlo (§D).

---

## Lo que no entra, y por qué

- **Cotejar en la base `cita_id`, `abierta_en`, `redactada_en_sesion` y «hay borrador vivo»**
  (§4.4 y §4.5). *Lo decidió el propietario el 01-10-2026 (D1 y D3): va en T-036, inmediatamente
  después de T-012.* Exige redefinir `fn_sellar_version_nota`, que es lo que hace T-036. Su contrato
  hay que ampliarlo (§D).
- **Atar `notas_clinicas.cita_id` al paciente y al profesional de su cita** en la cabecera. El
  resolutor se protege solo (§2.18), pero la función que abre la alerta sigue dándose por
  satisfecha con cualquier versión que lleve ese `cita_id`. Es anterior a T-012, ningún criterio lo
  pide y tampoco está en el contrato de T-036. La bitácora lo anota como hallazgo.
- **La carrera entre abrir y resolver la alerta** (§4.9). Cerrarla exige tocar
  `fn_alertar_nota_sin_firmar`.
- **Nota nueva sin cita desde la ficha.** Exige elegir centro (`episodio_para_nota` con
  `p_centro_id`) y ninguna tarea lo pide: el contrato entra por la cita. Las notas sin cita que ya
  existen se abren con `?nota=`.
- **Editor de texto enriquecido**: ninguna dependencia nueva (§2.7).
- **Pantalla de Ajustes para el margen**: las columnas existen; la pantalla es de Ajustes.
- **Aviso de borrador abandonado** (ADR-036): hay que decidir N y ningún criterio lo pide.
- **Que quien hereda el caso corrija una nota ajena**: el ADR-059 lo prohíbe a propósito, y la
  pantalla lo dice con palabras.
- **Proyección para el derecho de acceso** (sin reservadas): tiene su propio ticket. La descarga
  dice que no es esa salida.
- **Coprofesional `administrador`**: T-035 (ADR-073.2).
- **`verificar:huellas` nocturno**: T-009 y `.github/**`.

---

## Resumen

1. Se construye la nota clínica de punta a punta sobre el sobre de la era 4, que ya está en
   `main`: borrador con autoguardado y bloqueo optimista, firma que sella lo guardado, versiones
   con motivo, sello como frase, comparación y descarga íntegra.
2. **Decisión 1**: `abierta_en` vive en `notas_clinicas.borrador_abierta_en` y la escribe **solo**
   el disparador. Abrir el editor crea el borrador y la fija; firmar la vacía en la misma
   transacción, con el `fn_vaciar_borrador_al_firmar` que ya existe.
3. **Decisión 2**: firmar **no recibe el texto**. Lee la cabecera, la cita y el margen en el
   servidor, y traduce los errores por SQLSTATE gracias a `ErrorFirmaVersion` en `firmar.ts`.
4. **Decisión 3**: se demuestra **por el camino de la aplicación**, con `lib/notas/servidor.ts` +
   `scripts/t012-nota.ts`. Lo nuevo de la base va en el banco 20.
5. Migración `20261002120000_…`: `borrador_abierta_en` con su check, `fn_tocar_borrador`
   endurecido, margen en organización (15) y en centro (hereda), índice único `(cita_id,
   autor_id)` y resolución de la alerta `nota_sin_firmar` al firmar (D2), atada a la cita de la
   propia nota.
6. T-014 entra antes. T-012 pone `RUTA_NOTAS_DISPONIBLE = true` en el mismo commit que crea la
   ruta.
7. Revisar con más cuidado: el testigo como cadena; las cero filas desambiguadas; que el
   disparador pise `borrador_abierta_en` y el testigo sin cambio de contenido; y el único
   `definer` nuevo, cuyo `join` con `citas` ata paciente y autor. Sus negativas 20.A1 y 20.A2
   tienen que fallar por eso, no porque la versión no entrara.
8. Riesgo declarado, por decisión del propietario del 01-10 (D1 y D3): el sello se puede
   falsificar por PostgREST, y una modificación con doble pulsación puede duplicar la versión. En
   T-012 solo se desactiva el botón. Los cierra T-036, cuyo contrato hoy solo cubre `cita_id` y hay
   que ampliar.
9. Delegables a MiniMax: ocho piezas de pintura (P1-P8), con firma, claves y pruebas. El editor,
   la barra, el comparador, la firma y el candado se quedan en la fábrica.
10. Tres cortes: A (base, acciones y guion), B (editor y entradas) y C (comparación y descarga).

---

## Corte B · Enmienda del 02-10-2026: la pantalla

> Arquitecto, 02-10-2026, con el corte A en `main` (`44d6d67`) y T-036 en implementación (diseño
> E.0-E.15, `e02a4fd`). **Esta enmienda manda sobre §1.4 (fila `abrirEditorDeNota`, paso 1), §1.5
> (fila «sin fila» de la tabla), §1.6, §2.17 y §7 donde choquen.** Lo demás sigue en pie. El
> corte B es `riesgo: medio` (§8) y se diseña sin la base de datos local, que está ocupada por
> T-036: todo lo de §B.0 está leído en el árbol.

### B.0 · Hechos verificados contra el código

| Id | Hecho | Ruta | Efecto |
|---|---|---|---|
| B0.1 | `abrirEditorDeNota` devuelve `{estado:'bloqueada'}` ante **cualquier** `!acceso.ok`. Sin embargo, `registrarAccesoHistoria` distingue `motivo:'denegado'` (42501: sin desbloqueo o paciente ajeno, indistinguibles a propósito) de `motivo:'error'` (otro código, o la función no devuelve fila). Nunca lanza. | `lib/notas/servidor.ts:417`, `lib/cuentas/accesos.ts` | R4-H1 (B.2.1). |
| B0.2 | `diagnosticarCeroFilas` traduce `'sin_causa'` a `'error'`. La tabla `it.each` de cero filas de `guardarBorrador` cubre cinco causas con nombre y no cubre «fila propia, mismo paciente, testigo igual». El mutante C4 (`'sin_causa' → 'bloqueada'`) sobrevive. | `servidor.ts:370-401`, `servidor.test.ts:395-409`, `tickets/T-012/revision.md` (R4-H2) | R4-H2 (B.2.2). |
| B0.3 | `prolongarDesbloqueo` devuelve `null` tanto si hay error como si el RPC da nulo («sin desbloqueo vigente»). Lo llaman `servidor.ts:429,599,631,688,823`, `app/(app)/candado/acciones.ts` y `ampliarLaVentana` (`app/(app)/pacientes/[id]/acciones.ts`). El arnés de `servidor.test.ts` no simula `rpc:prolongar_desbloqueo`: hoy cualquier apertura feliz devuelve `caducaEn: null`. | `lib/cuentas/candado.ts:89`, `lib/notas/servidor.test.ts` (arnés `clienteSimulado`) | B.2.3. |
| B0.4 | En `panel-historia.tsx:99-100`, si `caducaEn` es nulo no se arma ningún temporizador. Y `ampliar` (`:128-129`) **sobrescribe** el plazo con el `null` de `ampliarLaVentana`: un fallo pasajero deja la historia abierta en pantalla sin cierre automático. | `app/(app)/pacientes/[id]/panel-historia.tsx` | El editor no copia ese defecto (B.1.4). En la ficha es un hallazgo (Preguntas, P-2). |
| B0.5 | Traducción de la firma: con 23514, un mensaje que contiene `abierta_en` da `'error'` (`:813`); el resto del 23514 y el 23505 dan `'conflicto'`. T-036 (E.2) reescribe 6.18 sin `abierta_en` y garantiza en el banco 14 (T036.T) que solo los tres mensajes de 6.8 lo llevan. El fragmento de 6.24 es `no es el borrador vigente`. T-036 no toca `lib/` ni `app/` (E.9 R-g). | `servidor.ts:806-818`, `tickets/T-036/diseno.md` E.1, E.2 y E.10.5 | B.2.5: hace falta una prueba que fije ese contrato desde este lado. |
| B0.6 | `firmarNota` no recibe texto: firma el borrador releído (§1.5, paso 3). Con éxito devuelve `nota: refrescarModelo(…)`, que da `null` si la relectura falla. | `servidor.ts:692-825`, `:354-357` | B.1.4: aviso «Firmada; no se pudo recargar». |
| B0.7 | `VersionDeVista` no tiene `enSesion`, que P2 necesita. `SelloLeido` sí trae `redactadaEnSesion`, `citaId` y `margenMinutos`. | `servidor.ts:36-49`, `lib/notas/sello.ts` | B.1.1. |
| B0.8 | La ruta `?cita=` exige que `cita.profesional_id = uid` y busca la cabecera con `autor_id = uid`. Con una nota visible de otro autor, o con una cita reasignada, da `no_disponible`. Si quien mira es el profesional de la cita y no el autor, **crea una cabecera nueva** para esa cita: el índice único es `notas_clinicas_cita_autor_uidx`, por `(cita_id, autor_id)`, no por cita. La ruta `?nota=` abre cualquier nota visible del paciente y nunca crea. | `servidor.ts:442-560`, `supabase/migrations/20261002120000_nota_clinica_borrador_firma.sql:83` | Corrige §1.6 y §2.17: la lista enlaza siempre con `?nota=` (B.2.7). |
| B0.9 | `notas_clinicas_versiones` lleva `paciente_id`. El check `notas_clinicas_borrador_abierta_ck` es `(borrador_abierta_en is null) = (borrador_contenido is null)`. | `lib/supabase/tipos-bd.ts` (`notas_clinicas_versiones`), migración `20261002120000:33` | La lista se lee con dos consultas por `paciente_id`, sin `.in(ids)`, y sabe si hay borrador sin traer su texto (B.1.1). |
| B0.10 | `lib/i18n/es.ts` está en LF en el índice y en CRLF en la copia de trabajo (`git ls-files --eol`: `i/lf w/crlf`). El bloque `notas` (`:505-521`) tiene `sello{enSesion, fueraDeSesion, sinCita, sinCitaVariosDias, ilegible}`, `episodio` y `modalidad{…}`. `ficha.notasEnPreparacion` solo lo usa `panel-historia.tsx:224`. `comunes.cancelar` existe. | `lib/i18n/es.ts`, `:361-363` | B.1.9. |
| B0.11 | El `catalogo.diff` de MiniMax está hecho sobre un índice viejo (`a6b0cd4`) y crea un bloque `notas` **nuevo**. Si se aplica como parche, deja dos claves `notas` en el objeto: la segunda pisa a la primera y desaparecen `episodio`, `modalidad` y `sinCitaVariosDias`. | `minimax/correcciones/T-012/t012b/catalogo.diff` | Se funde a mano (B.1.9). |
| B0.12 | Las ocho piezas corregidas están en `minimax/correcciones/T-012/t012b/app/(app)/pacientes/[id]/…`, cada una con su prueba. Además: <br>· `estado-de-nota.tsx` declara su propio `export type EstadoDeNota` y `lista-de-notas.tsx` lo importa; <br>· la prueba de P6 usa `href` arbitrarios, que es inocuo porque comprueba que el `href` se pinta tal cual. | ese árbol | B.1.6. |
| B0.13 | `panel-historia.test.tsx` (hacia `:120-131`) espera «Esta sección todavía no está» al abrir Notas clínicas. `RUTA_NOTAS_DISPONIBLE = false` (`app/(app)/agenda/notas.ts`) y `notas.test.ts:11` espera `false`. `rutaNotas` produce `?cita=`. | esos ficheros | B.1.7 y B.1.8. |
| B0.14 | Primitivas: <br>· `Dialogo({abierto, alCerrar, titulo, focoInicial?, children})`; <br>· `Desplegable({opciones:{valor,etiqueta}[], valor, alElegir, etiqueta, marcador?})`; <br>· `Pestanas({pestanas, activa, alCambiar, etiqueta, prefijo})` y `PanelDePestana({id, prefijo, children})`; <br>· `AreaTexto({id, etiqueta, errores?, …textarea})`; <br>· `AvisoDeError({mensaje, accion?})` (`role="alert"`). <br>El patrón de diálogo con `zodResolver` está en `app/(app)/agenda/dialogo-reprogramar.tsx`. | `components/ui/*`, `app/(app)/agenda/` | B.1.4. |
| B0.15 | La ficha (`page.tsx`) pone el trabajo asíncrono dentro de componentes `async` bajo `<Suspense>` (`cacheComponents`). `viewport` está documentado en `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`. | `app/(app)/pacientes/[id]/page.tsx` | B.1.3. |
| B0.16 | El territorio del contrato ya cubre todo lo del corte B: `lib/notas/**`, `lib/i18n/es.ts`, `app/(app)/pacientes/[id]/**`, `app/(app)/agenda/notas.ts` y `notas.test.ts`. | frontmatter de `tickets/T-012-nota-clinica-firma.md` | El frontmatter **no** cambia (B.6). |

### B.1 · Piezas y contratos

#### B.1.1 · `lib/notas/servidor.ts` (modificar) y su prueba

1. **R4-H1**, en la línea 417:
   ```ts
   if (!acceso.ok) return acceso.motivo === 'denegado' ? { estado: 'bloqueada' } : { estado: 'error' };
   ```
   En los dos casos, cero consultas más.
2. **La apertura exige plazo.** En `devolver` (`:429`): `const caducaEn = await prolongarDesbloqueo(sesion); if (caducaEn === null) return { estado: 'error' };`. El tipo pasa a `| { estado: 'abierta'; caducaEn: string; nota: ModeloDeNota }`.
3. **`ResultadoGuardado` y `ResultadoDeNota`** conservan `caducaEn: string | null`, con este comentario de contrato encima de cada uno: «`null` = no se sabe (fallo o carrera con un cierre). La operación ya se hizo bajo RLS, así que la ventana estaba abierta: la pantalla conserva el plazo que tenía y **nunca lo amplía sin confirmación**».
4. **`VersionDeVista`** gana dos campos, calculados en `cargarModelo` con el mismo `leerSello(v.contenido_canonico)`, que se lee una sola vez por versión:
   ```ts
   /** `null` si el sello no se puede leer: ni «en sesión» ni «fuera» (P2 pinta HelpCircle). */
   enSesion: boolean | null;        // s === null ? null : s.redactadaEnSesion
   /** «Margen aplicado: N min». Solo si el sello es legible, lleva cita y el margen no es nulo. */
   margen: string | null;           // s?.citaId && s.margenMinutos !== null ? tCon('notas.sello.margen', { minutos: s.margenMinutos }) : null
   ```
5. **El borrador ajeno no sale del servidor.** En `cargarModelo`, `borrador` es `null` si `!soyAutor`. `estado` se sigue derivando de `hayBorrador`, así que la píldora dice la verdad. Está pendiente de la pregunta P-1 al propietario; si responde que el borrador ajeno se ve, este punto se cae y el editor lo pinta en solo lectura.
6. **Función nueva**, exportada junto con el tipo `Leida<T>`:
   ```ts
   export type ResumenDeNota = { id: string; fechaSesion: string; estado: EstadoNota; versiones: number;
     autor: string; conjunta: boolean; href: string };
   export async function listarNotasDelPaciente(sesion: Sesion, pacienteId: string): Promise<Leida<ResumenDeNota[]>>
   ```
   Hace dos consultas en `Promise.all`:
   - `notas_clinicas.select('id, autor_id, fecha_sesion, borrador_abierta_en').eq('paciente_id', p).order('fecha_sesion', {ascending:false})`;
   - `notas_clinicas_versiones.select('nota_id, numero_version, alcance').eq('paciente_id', p)`.

   **No selecciona `borrador_contenido`, `cuerpo` ni `anotaciones_reservadas`.** Después llama a `nombresDe` con los `autor_id`. Si cualquiera de las tres falla, `{ok:false}`. Para cada fila:
   - `versiones` = cuántas versiones tiene;
   - `estado = estadoDeNota({versiones, hayBorrador: borrador_abierta_en !== null})` (B0.9);
   - `conjunta` = el `alcance` de la de mayor `numero_version` es `'conjunta'`;
   - `fechaSesion = fechaLegible(fecha_sesion)`;
   - `href = '/pacientes/' + p + '/historia/notas?nota=' + id`, **siempre** con `?nota=` (B.2.7).

   No registra acceso ni prolonga: la llama `abrirPestanaDeHistoria` **después** de registrar (B.1.7).
7. **Pruebas nuevas** en `lib/notas/servidor.test.ts`. El arnés aprende a guardar las columnas del `select` (`llamada.columnas = _c`) y las aperturas felices responden `rpc:prolongar_desbloqueo` con `{ data: '2026-10-02T10:00:00+00:00' }`.

   | Prueba | Debe fallar si… |
   |---|---|
   | `registrar_acceso_historia` da `{code:'57014'}` → `{estado:'error'}` y ninguna llamada más (gemela de la prueba 42501 del `describe('abrirEditorDeNota · el candado manda')`, que sigue esperando `bloqueada`) | se vuelve a `!ok → bloqueada` (R4-H1). Al revés, si todo pasa a `error`, cae la del 42501 |
   | `registrar_acceso_historia` da `{data: []}` → `{estado:'error'}` | se trata «sin fila» como denegado |
   | Fila nueva en el `it.each` de `:395`: `['la fila se ve, propia y con el testigo igual → error', {data:{id:N, paciente_id:P, autor_id:A, borrador_actualizado_en:TESTIGO}}, 'error']` | C4 (`sin_causa → bloqueada`) o cualquier otra traducción de `sin_causa` |
   | En `fijarCoprofesional`: `update → {data: []}` y relectura `{id:N, paciente_id:P, autor_id:A, borrador_actualizado_en:TESTIGO}` → `motivo:'error'` | lo mismo, por el camino sin testigo |
   | Apertura feliz con `rpc:prolongar_desbloqueo → {data:null}` → `{estado:'error'}` | se devuelve `abierta` con un plazo desconocido |
   | Lo mismo con `{error:{code:'XX000'}}` → `{estado:'error'}` | — |
   | 23514 con `'Lo que se firma no es el borrador vigente de la cabecera: otra sesión lo cambió entretanto; hay que releerlo (T-036, R2-H1, ADR-036)'` → `conflicto` | alguien amplía la regla de `abierta_en` a otra subcadena |
   | 23514 con `'El instante de apertura del sobre no es el instante en que la base abrió el borrador (columna de la cabecera, truncada a milisegundos) (T-036, ADR-046)'` → `conflicto` | ídem. **Los dos textos se copian literales de `tickets/T-036/diseno.md` E.1 y E.2**; la prueba existente del 6.8 (→ `error`) sigue igual |
   | `enSesion` y `margen`: con un sobre en sesión y cita, `true` y «Margen aplicado: 15 min»; con un sobre sin cita, `false` y `null`; con un canónico ilegible, `null` y `null` | se calcula `enSesion` a partir de la frase, o se pinta un margen sin cita |
   | `!soyAutor` con borrador → `modelo.borrador === null` y `estado === 'borrador'` (o `firmada_con_cambios` si hay versiones) | el texto ajeno viaja al navegador |
   | `listarNotasDelPaciente`: dos notas, una con v1 y v2 (la v2 conjunta) y otra solo con borrador → estados `modificada`/`borrador`, `versiones` 2 y 0, `conjunta` true y false, `href` con `?nota=` en las dos | se toma el alcance de la v1, se cuenta mal o se usa `?cita=` |
   | `listarNotasDelPaciente`: ninguna llamada pide `borrador_contenido`, `cuerpo` ni `anotaciones_reservadas` en sus columnas | la lista trae texto clínico |
   | `listarNotasDelPaciente`: si falla una de las dos lecturas o `nombresDe`, `{ok:false}`, nunca `{ok:true, valor:[]}` | «no se pudo leer» se pinta como «Todavía no hay notas» |

#### B.1.2 · `app/(app)/pacientes/[id]/peticion.ts` (nuevo), `historia/notas/esquemas.ts` (nuevo) y `historia/notas/acciones.ts` (nuevo)

- `peticion.ts`: sin `'use server'`. Recibe `ipDeLaPeticion` **movida tal cual** (§1.3.c). `acciones.ts` de la ficha la importa de allí.
- `esquemas.ts`: los cinco esquemas de §1.4, literales. `SIN_NULO` sale de `@/lib/notas/cuerpo`.
- `acciones.ts` (`'use server'`): importa `* as servidor from '@/lib/notas/servidor'` para que los nombres no choquen. Cinco acciones, cada una con `exigirSesion()` → `esquema.safeParse` → `servidor.X`:

  | Acción | Si Zod falla | Notas |
  |---|---|---|
  | `abrirEditorDeNota(entrada)` | `{estado:'no_disponible'}` | contexto `{ip: ipDeLaPeticion(await headers()), agente: cabeceras.get('user-agent')}` |
  | `guardarBorrador(entrada)` | `{ok:false, motivo:'error'}` | — |
  | `fijarCoprofesional(entrada)` | ídem | — |
  | `empezarModificacion(entrada)` | ídem | — |
  | `firmarNota(entrada)` | ídem | — |

  No se escribe `ampliarVentana` nueva: el editor usa `ampliarLaVentana` y `cerrarHistoriaDelPaciente` de `../../acciones` (B.2.3).

#### B.1.3 · `app/(app)/pacientes/[id]/historia/notas/page.tsx` (nuevo, servidor, armazón)

- Lo de §1.6 sigue en pie, con la forma de la ficha: `export default function Pagina({ params, searchParams })` monta `<Suspense fallback={<EsqueletoEditor/>}>` con un componente `async Armazon`. Dentro:
  - `await params` y `await searchParams`;
  - validación UUID con `z.uuid()`;
  - `cita` XOR `nota`, si no `notFound()`;
  - `cargarPaciente(id)`, y `notFound()` si da nulo;
  - con `cita`, `citas(inicio, fin, zona_horaria, paciente_id)` y `notFound()` si es de otro paciente.
- Pinta `<CabeceraDeNota paciente={nombre + ' ' + apellidos} sesion={…} volverHref={'/pacientes/' + id}/>` y `<EditorDeNota pacienteId citaId notaId/>`. Con `?nota=`, `sesion` es `null`: el armazón no puede leer `notas_clinicas`, y la fecha la trae el modelo al abrir.
- `export const viewport: Viewport = { interactiveWidget: 'resizes-content' }`. Antes de escribirlo, el implementador lee la guía `generate-viewport.md` (B0.15).
- Imports permitidos: `@/lib/i18n`, `@/lib/fechas`, `../../datos`, `zod`, `next/navigation`, `react` y las piezas hermanas. **Ninguno** de `@/lib/notas/servidor` ni `./acciones` en el servidor: el editor importa las acciones por su cuenta.
- `page.test.ts` (nuevo) lee el **fuente** de `page.tsx` con `readFileSync` y comprueba que no contiene `notas_clinicas`, `lib/notas/servidor` ni `from './acciones'`. Es la prueba del armazón del criterio 8.

#### B.1.4 · `historia/notas/editor-de-nota.tsx` (nuevo, `'use client'`) y su prueba

**Máquina de estados** (un `useReducer`; los nombres son contrato de la prueba):

| Estado | Qué se pinta | Sale con |
|---|---|---|
| `inicial` | botón `notas.editor.abrir` | clic → `cargando` → `abrir()` |
| `cargando` | `EsqueletoEditor` (P7) | resultado de `abrirEditorDeNota` |
| `bloqueada` | candado (copia del bloque de `panel-historia.tsx` hacia `:192-203`) con `ficha.historiaBloqueada`, el mensaje (`ficha.historiaBloqueadaExplicacion` o `ficha.seCerroSola`) y `FormularioPinHistoria alAbrirse={() => abrir({trasPin: true})}` | PIN aceptado → `cargando` |
| `sin_acceso` | `AvisoDeError` con `notas.aviso.sinAcceso`; la vuelta a la ficha ya la da `CabeceraDeNota` | — (antibucle, B.2.1) |
| `no_disponible` | `EstadoVacio` con `notas.aviso.noDisponible` | — |
| `error` | `AvisoDeError` con `notas.aviso.noSeAbrio` y el botón `notas.aviso.reintentar` | clic → `cargando` |
| `elegir_episodio` | `Desplegable` (`notas.editor.episodio`) y el botón `notas.editor.continuar`; si la lista llega vacía, `notas.editor.sinEpisodios` | continuar → `abrir({episodioId})` |
| `abierta` | B.1.4.a | timer, `bloqueada`, conflicto… |

`abrir({trasPin})`: si el resultado es `bloqueada` **y** `trasPin`, va a `sin_acceso` en lugar de a `bloqueada`. Hay deduplicación con `useRef` contra dobles pulsaciones, como en `panel-historia.tsx:65-68`, aunque aquí no hay apertura al montar: `abrir` solo cuelga de gestos (ADR-058.3).

**B.1.4.a · Abierta.** Estado local: `modelo`, `caducaEn: string`, `texto`, `reservadas`, `testigo`, `guardado: 'guardado'|'guardando'|'sin_guardar'|'fallo'`, `aviso: null | ClaveDeAviso` y `conflicto: boolean`.

- **Reloj**: copia de `panel-historia.tsx:98-117` sobre `caducaEn`, que aquí **nunca es nulo**. Lleva:
  - la franja con `ficha.historiaAbiertaMinutos`;
  - `ficha.ampliarElTiempo` cuando quedan 2 minutos o menos, y `ficha.historiaPorCerrarse` (`role="status"`, sin robar el foco, ADR-047);
  - `ficha.cerrarHistoria`.

  Las dos acciones salen de `../../acciones`. **Diferencia obligatoria con la ficha**: `ampliar` hace `setCaducaEn(r.caducaEn ?? caducaEnActual)`, y lo mismo cualquier resultado de mutación con `caducaEn: null`. Al vencer el temporizador: `dispatch({tipo:'cerrada'})`, que **vacía** modelo, texto y reservadas del estado y pasa a `bloqueada` con `ficha.seCerroSola`. Antes de `cerrarHistoriaDelPaciente` se espera la cola de escritura.
- **Cola de escritura** (`useRef<Promise<void>>`): guardar, fijar coprofesional, modificar y firmar se encadenan, y nunca hay dos en vuelo (§2.9). El autoguardado espera 3 s tras la última tecla, y también salta en `onBlur` de cada `AreaTexto`. Si ya hay uno en vuelo, se marca «pendiente» y al acabar se guarda **lo último**. No corre si `!modelo.soyAutor`, si `modelo.borrador === null` o si `conflicto`.
- **Indicador de guardado**: `<p role="status" aria-live="polite">` con `notas.editor.guardado`, `guardando`, `sinGuardar` o `noSeGuardo`.
- **Resultado de guardar**:
  - `ok`: `testigo` y `caducaEn ?? actual`;
  - `conflicto`: `conflicto = true` (B.2.5);
  - `sin_borrador`: aviso `notas.aviso.yaFirmada` con el botón `notas.aviso.cargarLoGuardado`;
  - `bloqueada`: `cerrada`;
  - `no_autor`: aviso `notas.aviso.noAutor`;
  - `error`: `guardado = 'fallo'`. Sin reintento automático: el siguiente teclazo o el siguiente `blur` lo vuelven a intentar.
- **Cuerpos** (§2.8.d). Un `useEsAncho()` local con `matchMedia('(min-width: 48rem)')` y su `change`. Es seguro porque `abierta` solo existe después de una acción en el cliente, nunca en el HTML del servidor.
  - Estrecho: `Pestanas` (`notas.editor.partes`) con «Nota» (`notas.editor.nota`) y «Anotaciones reservadas» (`notas.editor.reservadas`), y un `PanelDePestana` cada una.
  - Ancho: dos `<section aria-labelledby>` apiladas con su `<h2>`.

  `AreaTexto` lleva `maxLength={60000}` y `maxLength={20000}`, y `className="flex-1 scroll-mb-24"`. `AvisoReservadas` (P5) va **siempre** encima de la zona reservada. Con `!soyAutor` o sin borrador, los cuerpos no se pintan como `AreaTexto`: se pinta la versión vigente (abajo).
- **Vista de la versión vigente** (si `versiones.length > 0`):
  - `PildoraDeEstado` (P1);
  - `SelloDeNota frase={v.sello} enSesion={v.enSesion}` (P2) y, debajo, `v.margen` si lo hay;
  - `ModificadaPor fecha={v.firmadaEn} autor={v.autor}` (P4) si `v.numero > 1`;
  - el texto y, si no son nulas, las reservadas con `AvisoReservadas`;
  - un `<ol>` con una `FilaDeVersion` (P3) por versión, de la más nueva a la más vieja, con `vigente` en la última, `conjunta = alcance === 'conjunta'` y `sello = v.sello`.

  Con `firmada_con_cambios` y `soyAutor`, los cuerpos editables van encima y la vista de la vigente debajo, con el encabezado `notas.editor.vigente`. Con `!soyAutor`, la frase `notas.aviso.noAutor` y, si el estado lleva borrador, `notas.editor.borradorAjeno`.
- **Coprofesional**: solo con `soyAutor && versiones.length === 0`. `Desplegable` (`notas.editor.coprofesional`) con la opción `notas.editor.sinCoprofesional` (valor `''`, que se manda como `null`) y los candidatos. Resultados:
  - `ok`: `modelo = nota ?? modelo` (con `nota: null`, el aviso `notas.aviso.hechoSinRecargar`);
  - `coprofesional_invalido`: `notas.aviso.coprofesionalInvalido`; `ya_firmada`: `notas.aviso.yaFirmadaCoprofesional`.
- **Modificar** (`soyAutor`, con versiones y sin borrador): `empezarModificacion` → `modelo = nota`, y el texto y el testigo salen de `nota.borrador`.
- **Diálogo de firma** (`Dialogo`, título `notas.firma.titulo`). Es react-hook-form con `zodResolver(esquemaFirma)` y `defaultValues {pacienteId, notaId, testigo, alcance:'individual', motivo: null}`, como `dialogo-reprogramar.tsx`.
  - Lleva siempre `notas.firma.loGuardado`.
  - Con versiones, el `AreaTexto` `notas.firma.motivo` (`maxLength={500}`), que recibe el foco inicial. Sin versiones, el foco va al botón de confirmar. Un motivo vacío se convierte en el error `notas.aviso.faltaMotivo`, no en el mensaje de Zod.
  - Si `puedeSerConjunta`, dos radios nativos `notas.firma.individual` y `notas.firma.conjunta` en un `fieldset` con leyenda `notas.firma.alcance`, con las tres frases de §2.10 (`notas.firma.conjuntaLeeran`, `conjuntaEslabon`, `conjuntaAcceso`). Si no, no se pinta ningún control.
  - Botones: `comunes.cancelar` y `notas.firma.confirmar`, o `notas.firma.firmando` mientras dura.
- **Firmar** (D3, criterio B). `const [pendiente, iniciar] = useTransition()` y un `enVuelo = useRef(false)`. El manejador sale si `enVuelo.current`. Si no, `enVuelo.current = true` e `iniciar(async () => { … finally enVuelo.current = false })`. Dentro:
  1. espera la cola y, si hay cambios sin guardar, guarda. Si no sale `ok`, trata el resultado como arriba y **no firma**;
  2. `firmarNota({…valores, testigo: testigoRecienGuardado})`.

  El botón de la barra y el del diálogo llevan `disabled={pendiente}`. Resultados:

  | Resultado | Qué ve el usuario |
  |---|---|
  | `ok` con `nota` | se cierra el diálogo; `modelo = nota` y `caducaEn ?? actual`; el foco va al `<h2>` de la vista vigente (`tabIndex={-1}`) |
  | `ok` con `nota: null` | se cierra el diálogo; aviso `notas.aviso.firmadaSinRecargar` con el botón `notas.aviso.recargar` (`abrir()`); los cuerpos pasan a solo lectura |
  | `conflicto` | se cierra el diálogo; `conflicto = true` (B.2.5) |
  | `sin_borrador` | se cierra el diálogo; aviso `notas.aviso.yaFirmada` y `cargarLoGuardado` |
  | `falta_motivo` | error en el campo motivo; el diálogo sigue abierto |
  | `vacia` | `notas.aviso.vacia` dentro del diálogo |
  | `cita_ilegible`, `error` | `notas.aviso.noSeFirmo` dentro del diálogo (`role="alert"`); puede volver a pulsar |
  | `bloqueada` | `cerrada` (el modelo se vacía) |
  | `no_autor`, `no_disponible` | su aviso; se cierra el diálogo |

- **Conflicto** (B.2.5). `conflicto = true` deja los dos `AreaTexto` en `readOnly`, para que se pueda seleccionar y copiar, y para el autoguardado. Encima de los cuerpos pinta `AvisoDeError mensaje={t('notas.aviso.conflicto')} accion={<Button>{t('notas.aviso.cargarLoGuardado')}</Button>}`, y **el foco va a ese aviso** (`tabIndex={-1}`; es la respuesta a un gesto del usuario, como en T-037 R2-H1). «Cargar lo guardado» llama a `abrir()` con el `notaId` del modelo, que registra un acceso más y es un gesto; sustituye texto y testigo y quita `conflicto`. No hay reintento silencioso.

**Pruebas (`editor-de-nota.test.tsx`)**, con `vi.mock('./acciones')`, `vi.mock('../../acciones')` y `vi.mock('@/app/(app)/candado/acciones')`, como `panel-historia.test.tsx`:

| Prueba | Debe fallar si… |
|---|---|
| **B**: la firma simulada es una promesa sin resolver; el botón tiene `disabled`, y dos `click` (también con `fireEvent`, que no respeta `disabled`) llaman a `firmarNota` **una** vez | no hay `enVuelo`, o el botón no se desactiva |
| Al montar no se llama a `abrirEditorDeNota`; solo tras el clic en «Abrir el editor» | se abre al cargar (ADR-058.3) |
| `bloqueada` → formulario de PIN; `alAbrirse` → `bloqueada` otra vez → «No se puede abrir…» **sin** formulario de PIN | no hay antibucle |
| `error` → «Volver a intentarlo» y **ningún** formulario de PIN | R4-H1 se pinta como candado |
| Con `vi.useFakeTimers`: abierta con plazo `T`; un guardado devuelve `caducaEn: null`; al llegar `T`, el texto deja de estar en el documento y aparece `ficha.seCerroSola` | `null` borra el plazo (el defecto de B0.4) |
| `ampliarLaVentana → {caducaEn:null}` conserva el plazo anterior (misma prueba con `ampliar`) | ídem |
| Conflicto al firmar: el texto local sigue en el `textarea`, que es `readOnly`; no hay ninguna llamada más a `guardarBorrador` aunque se teclee; el foco está en el aviso; «Cargar lo guardado» llama a `abrirEditorDeNota` y el `textarea` pasa a tener el texto del modelo nuevo | se pisa o se reintenta en silencio |
| Firmar con cambios sin guardar llama primero a `guardarBorrador` y después a `firmarNota` con el **testigo nuevo**; si el guardado da `conflicto`, no se llama a `firmarNota` | se firma con un testigo viejo |
| Sin `puedeSerConjunta` no hay ningún radio de alcance; con él, dos | control sin dato detrás |
| Con versiones, confirmar con el motivo vacío no llama a `firmarNota` y pinta `notas.aviso.faltaMotivo` | — |
| `ok` con `nota: null` → `notas.aviso.firmadaSinRecargar` y el botón Recargar | «no se pudo releer» se pinta como «no se firmó» |

Con temporizadores falsos y promesas, `vi.advanceTimersByTimeAsync`, no la versión síncrona.

#### B.1.5 · `historia/notas/barra-de-acciones.tsx` (nuevo, `'use client'`)

`BarraDeAcciones({ puedeGuardar, puedeFirmar, puedeModificar, pendiente, alGuardar, alFirmar, alModificar })`:
- es una `<div role="toolbar" aria-label={t('notas.editor.acciones')}>` con `sticky bottom-0 pb-[env(safe-area-inset-bottom)]`;
- lleva `Button` (44 px) solo para lo que es `true`: Guardar (`notas.editor.guardar`), Firmar (`notas.editor.firmar`) y Modificar (`notas.editor.modificar`);
- **sin** Comparar ni Descargar, que llegan con el corte C (nada de controles sin acción).

Su prueba: con los tres en `false` no hay ningún botón; con `pendiente`, Firmar está `disabled`. El contenedor del editor es `min-h-[100dvh] flex flex-col` (§2.8.b).

#### B.1.6 · Integración de P1-P8

1. Se copian **desde `minimax/correcciones/T-012/t012b/`**, nunca desde `minimax/respuestas/`, que tiene la errata `firma_con_cambios`. Van a las mismas rutas relativas bajo `app/(app)/pacientes/[id]/`, con sus `*.test.tsx`.
2. **Normalización.** En `estado-de-nota.tsx` se borra `export type EstadoDeNota` y se usa `import type { EstadoNota } from '@/lib/notas/estado'`. `lista-de-notas.tsx` importa `EstadoNota` de allí mismo. No hay ningún otro cambio en las piezas.
3. Las ocho pruebas tienen que pasar **sin tocarlas**. Si alguna falla por el catálogo, se arregla el catálogo, no la prueba.

#### B.1.7 · Ficha: `app/(app)/pacientes/[id]/acciones.ts` y `panel-historia.tsx`

- `ResultadoDeApertura` (rama `abierta`) gana `notas: ResumenDeNota[] | null`. Con `pestana === 'notas_clinicas'`, después del registro: `const l = await listarNotasDelPaciente(sesion, id); notas = l.ok ? l.valor : null`. En las demás pestañas, `null`.
- En `Contenido` (`panel-historia.tsx`, hacia `:211-230`), `notas_clinicas` pinta:
  - con `notas` en `null`, `<AvisoDeError mensaje={t('notas.lista.noSePudoLeer')}/>`;
  - si no, `<ListaDeNotas notas={notas}/>`.

  `Contenido` recibe `notas` como prop. Se borra la rama `ficha.notasEnPreparacion` (`:224`) y, en el mismo commit, la clave.
- `panel-historia.test.tsx` deja de esperar «Esta sección todavía no está» y pasa a esperar el `EstadoVacio` de la lista (`notas.lista.vacia`) con `notas: []`. Hay un caso nuevo con `notas: null` que espera `notas.lista.noSePudoLeer`.

#### B.1.8 · Agenda

`RUTA_NOTAS_DISPONIBLE = true`, el comentario pasa a «T-012 creó la ruta» y `notas.test.ts:11` a `toBe(true)`, **en el mismo commit que crea `page.tsx`** (§1.6).

#### B.1.9 · `lib/i18n/es.ts`: el bloque `notas` final

Se funde **a mano** dentro del bloque existente (`:505`), conservando las terminaciones de la copia de trabajo: `git diff --stat lib/i18n/es.ts` tiene que dar decenas de líneas, no ~1000. **No se aplica `catalogo.diff`** (B0.11). Si las piezas P1-P8 corregidas usan alguna clave con otro texto distinto del de abajo, manda el texto de las piezas (sus pruebas lo fijan) y se avisa en la bitácora. Resultado, en este orden:

```ts
  notas: {
    estado: { borrador: 'Borrador', firmada: 'Firmada', modificada: 'Modificada',
      firmadaConCambios: 'Firmada · con cambios sin firmar' },
    sello: {                                    // SEIS claves: la unión
      enSesion: …, fueraDeSesion: …, sinCita: …, // las de hoy, intactas
      sinCitaVariosDias: …,                     // la de hoy, intacta
      ilegible: …,                              // la de hoy, intacta
      margen: 'Margen aplicado: {minutos} min',
    },
    episodio: …, modalidad: { … },              // intactas
    version: …, modificadaPor: …, reservadas: { … }, lista: { … }, cabecera: { … },  // las del catalogo.diff corregido
    lista: { …, noSePudoLeer: 'No se pudieron leer las notas. Vuelve a abrir la pestaña.' },  // se añade a la de P6
    editor: {
      abrir: 'Abrir el editor', acciones: 'Acciones de la nota', partes: 'Partes de la nota',
      nota: 'Nota', reservadas: 'Anotaciones reservadas', vigente: 'Versión vigente',
      guardado: 'Guardado', guardando: 'Guardando…', sinGuardar: 'Sin guardar',
      noSeGuardo: 'No se ha podido guardar. Se volverá a intentar al seguir escribiendo.',
      guardar: 'Guardar', firmar: 'Firmar', modificar: 'Modificar',
      coprofesional: 'Coprofesional', sinCoprofesional: 'Sin coprofesional',
      episodio: 'Episodio', continuar: 'Continuar',
      elegirEpisodio: 'Esta cita puede ir en más de un episodio. Elige en cuál se escribe la nota.',
      sinEpisodios: 'No tienes ningún episodio abierto con este paciente.',
      borradorAjeno: 'Su autor tiene cambios sin firmar.',
    },
    firma: {
      titulo: 'Firmar la nota', confirmar: 'Firmar', firmando: 'Firmando…',
      loGuardado: 'Se firma lo guardado. Lo firmado no se borra: cada cambio será una versión nueva.',
      motivo: 'Motivo del cambio', alcance: 'Alcance',
      individual: 'Nota individual', conjunta: 'Nota conjunta del episodio',
      conjuntaLeeran: 'La leerán los profesionales del episodio.',
      conjuntaEslabon: 'Es un solo eslabón de la cadena.',
      conjuntaAcceso: 'No se entregará entera en un acceso individual.',
    },
    aviso: {
      sinAcceso: 'No se puede abrir la historia de este paciente.',
      noDisponible: 'Esta nota no está disponible.',
      noSeAbrio: 'No se pudo abrir la nota. Vuelve a intentarlo.',
      reintentar: 'Volver a intentarlo',
      conflicto: 'La nota ha cambiado desde otro sitio y no se ha guardado ni firmado lo de esta pantalla. Tu texto sigue aquí para que lo copies; al cargar lo guardado se sustituye.',
      cargarLoGuardado: 'Cargar lo guardado',
      yaFirmada: 'Esta nota ya se ha firmado desde otro sitio.',
      noAutor: 'Esta nota solo la corrige quien la escribió. Si llevas el caso, escribe una nota nueva.',
      vacia: 'No se firma una nota vacía.',
      faltaMotivo: 'Para modificar una nota firmada hace falta un motivo.',
      noSeFirmo: 'No se pudo firmar. Vuelve a intentarlo.',
      coprofesionalInvalido: 'Esa persona no puede figurar como coprofesional en este centro.',
      yaFirmadaCoprofesional: 'Ya está firmada: el coprofesional no se cambia.',
      firmadaSinRecargar: 'Firmada. No se pudo recargar la nota.',
      hechoSinRecargar: 'Hecho. No se pudo recargar la nota.',
      recargar: 'Recargar',
    },
  },
```

(`lista` aparece dos veces en el esquema solo para decir «la de P6 más `noSePudoLeer`»: en el fichero es **un** objeto.) Y se borra `ficha.notasEnPreparacion` (`:362-363`) en el paso 7 del orden de trabajo, no antes.

### B.2 · Decisiones y alternativas descartadas

1. **R4-H1: se enmienda §1.4 y §1.3.** `denegado` da `bloqueada` y `error` da `{estado:'error'}`, los dos sin ninguna lectura clínica (se mantiene ADR-058.2). *Descartado mantener la letra*: un fallo pasajero pediría el PIN con la ventana abierta, el PIN «funcionaría» y la apertura volvería a fallar, en bucle y culpando al usuario. *Antibucle*: si tras un PIN aceptado la apertura vuelve a dar `bloqueada`, es un paciente sin acceso (los dos casos son indistinguibles a propósito en `accesos.ts`), y se dice «no se puede abrir» sin volver a pedir el PIN. *Descartado* distinguir el paciente ajeno en el servidor: rompería la indistinción que protege si el paciente existe.
2. **R4-H2: una fila más en la tabla de cero filas, y su gemela en `fijarCoprofesional`.** Mata C4 por los dos caminos (con testigo y sin él). *Descartado* probar `explicarCeroFilas` directamente: es privada, y lo que importa es el contrato público.
3. **`prolongarDesbloqueo`: no hace falta distinguirlo, y `Leida<T>` no encaja.** Toda llamada de `servidor.ts` ocurre **después** de una operación que RLS dejó pasar, así que la ventana estaba abierta. Su `null` solo puede ser un fallo o una carrera con un cierre, y en los dos casos lo correcto es lo mismo:
   - en la apertura, no enseñar lo que no se sabe cuándo esconder: `error`;
   - en una mutación, conservar el plazo anterior, que es la cota segura porque el reloj local cierra igual; si la ventana se cerró de verdad, la siguiente acción da `bloqueada`.

   *Descartado* `prolongarDesbloqueoLeido` en `lib/cuentas/candado.ts`, con un tipo `Ventana` de tres estados: amplía el territorio a un módulo compartido por tres llamantes, para producir dos ramas que la pantalla trataría igual. *Descartado* leer `null` como «cerrada», que es la trampa que señala la revisión: un fallo pasajero se pintaría como candado.
4. **P1-P8 se toman de las correcciones, en un orden en que siempre compilan:** catálogo, piezas, `lib`, acciones, editor, armazón con la bandera, ficha. El catálogo se funde a mano porque el diff es de un índice viejo y crearía un segundo `notas`. El tipo del estado es uno, `EstadoNota`, porque dos uniones literales iguales divergen en silencio la primera vez que alguien añada un estado.
5. **El `conflicto` de firma (T-036): se avisa, no se pierde nada de la base y no se reintenta.**
   - Qué ve el usuario: «La nota ha cambiado desde otro sitio…», con su texto local intacto y de solo lectura (seleccionable), y «Cargar lo guardado».
   - Qué pierde:
     - en la base, nada: no se selló nada (6.24 aborta el `insert`) y el borrador vigente es el de la otra sesión;
     - en pantalla, nada que no haya visto: lo local solo se sustituye con su gesto.

     Como solo el autor guarda (ADR-059), «la otra sesión» es el mismo profesional en otra pestaña o en otro dispositivo, y lo que se carga también es suyo.
   - *Descartado* reintentar la firma con lo vigente: firmaría un texto que el usuario no ha visto en esta pantalla, que es lo que ADR-036 prohíbe.
   - *Descartado* reenviar el texto local encima, porque pisaría en silencio.
   - *Descartado* un botón «Copiar mi texto»: `readOnly` ya permite seleccionarlo, y el portapapeles es comportamiento nuevo sin criterio.
6. **P4 «modificada el · por» entra en B, no en C.** El dato ya está en el modelo y la tarea del contrato lo pone en «la vista muestra por defecto la versión vigente», que es de B. A C le quedan la comparación y la descarga.
7. **La lista enlaza siempre con `?nota=`** (corrige §2.17). `?cita=` es la puerta de **creación** de la agenda: con una nota de otro autor, o con una cita reasignada, da `no_disponible`, y para quien es profesional de la cita sin ser el autor crearía una cabecera nueva (B0.8). *Se pierde* la línea «Sesión del…» del armazón al entrar desde la ficha, pero la fecha llega con el modelo al abrir. Cumple ADR-058: es la misma ruta.
8. **El borrador ajeno no viaja al navegador** (pendiente de P-1). Un dato que no se pinta no se manda. Es la opción más restrictiva de las dos que permite la arquitectura («mismo RLS»), y abrirlo después es quitar una línea.
9. **El margen se pinta bajo el sello de la vigente, no dentro de la frase.** El contrato lo cuenta entre lo sellado, y explica un «durante la sesión» firmado minutos después del fin. *Descartado* meterlo en `fraseDelSello`, que tiene sus pruebas, o en P3, cuya firma ya está entregada.
10. **Ancho por `matchMedia`, no por CSS.** Con CSS habría paneles `tabpanel` visibles sin su `tablist`. *Descartado* las pestañas a todos los anchos, porque §2.8.d pide los dos cuerpos a la vista en `md`.

### B.3 · Cómo se cierra cada criterio

| # | Comprobación |
|---|---|
| 8 | `npx vitest run "app/(app)/pacientes/[id]/historia/notas/page.test.ts"` en verde (el armazón no importa nada clínico). Además, manual con la BD libre: candado cerrado, `curl -s -b <cookie> "http://localhost:3000/pacientes/<p>/historia/notas?cita=<c>" \| grep -c "<texto sembrado>"` → `0`, y lo mismo con `?nota=<n>`. |
| 10 | Manual, según el guion del contrato: 360 px con el teclado virtual (dispositivo real o emulación con teclado), el cursor sigue visible y la barra queda por encima del teclado. Captura en la evidencia. |
| 11 | `git diff --stat main -- components/armazon` vacío. |
| B | `editor-de-nota.test.tsx`, prueba **B** (B.1.4), en verde. |
| M4 de T-014 | Manual: `/agenda` con una cita propia → «Notas» → armazón → «Abrir el editor» → PIN. Más `notas.test.ts` con `toBe(true)`. |
| R4-H1, R4-H2 | `npx vitest run lib/notas/servidor.test.ts` con las filas de B.1.1.7, y **mutación a mano** pegada en la evidencia: <br>· revertir la línea 417 hace caer la prueba del 57014; <br>· poner `'sin_causa' → 'bloqueada'` hace caer las dos de B0.2. <br>Las dos se restauran. |
| Contrato con T-036 | Las dos pruebas de 23514 → `conflicto` de B.1.1.7. Cuando T-036 esté en `main`, `npx tsx scripts/t012-nota.ts` sigue firmando v1, v2 y v3 (E.9 R-f). |
| General | `npm test`, `npm run lint` y `npm run build`, con `> log 2>&1; echo "exit=$?"`. `git grep -n "sinCitaVariosDias" -- lib/i18n/es.ts lib/notas/sello.ts` da al menos una línea en cada fichero. `npx tsc --noEmit` sale 0. |

### B.4 · Riesgos, por probabilidad

1. **Alta: las pruebas existentes de apertura feliz caen** cuando la apertura exige un plazo (B0.3). Es esperado: el arnés responde `rpc:prolongar_desbloqueo`. Si alguna prueba se «arregla» quitando la exigencia, es un hallazgo de revisión.
2. **Media: la BD sigue ocupada por T-036** cuando el corte B termina. Los criterios 8 (curl), 10 y M4 son manuales y necesitan BD. El corte B se integra **después** de T-036. Si el código está listo antes, espera con la evidencia automática hecha.
3. **Media: el catálogo mal fundido.** Dos `notas`, o claves perdidas. Lo detectan `tsc` (las claves de `sello.ts` y de las piezas son literales) y las pruebas de P1-P8.
4. **Media: la cola de escritura y el temporizador de 3 s en las pruebas.** `vi.useFakeTimers` con promesas: usar `vi.advanceTimersByTimeAsync`.
5. **Baja: la deriva de reloj (6.20) o un C de T-036 salen como `conflicto` repetido** (T-036 E.10.5). Se ve siempre y nunca pierde nada. No se distingue en B (Lo que no entra).
6. **Baja: el texto sin guardar cuando vence el candado.** Solo ocurre si el último guardado falló, y ya se ve «No se ha podido guardar». El candado manda: el estado se vacía.

### B.5 · Qué revisar

1. **Qué elige el llamante.**
   - En `abrirEditorDeNota`: `pacienteId`, `citaId`, `notaId` y `episodioId`, todo UUID por Zod. `cita` XOR `nota` se comprueba en el servidor.
   - En la lista no elige nada: `paciente_id` llega del servidor, ya validado por el esquema de la ficha.
   - En `firmarNota`: `alcance`, que se rebaja si `!puedeSerConjunta`, y `motivo`. **Nunca texto** (B0.6).
2. **R4-H1**:
   - `denegado` → `bloqueada` y cualquier otro motivo → `error`;
   - **ninguna** llamada tras el registro fallido en las dos pruebas;
   - el antibucle solo se activa con `trasPin`.
3. **R4-H2**: la fila nueva espera `'error'` y comprueba `toEqual`, no `toBeTruthy`.
4. **`caducaEn`**:
   - en `abierta` es `string`, y su `null` da `error`;
   - ningún `setCaducaEn(null)` en el editor: con `grep -n "setCaducaEn\|caducaEn:" editor-de-nota.tsx`, cada asignación lleva `?? actual`;
   - al vencer se vacía el estado clínico: la prueba busca el texto con `queryByText` y espera `null`.
5. **T-036**: las dos cadenas de las pruebas 23514 son **literales** de su diseño (E.1 y E.2), y la del 6.8 sigue dando `error`.
6. **Conflicto**:
   - `readOnly` y autoguardado parado;
   - el foco en el aviso;
   - «Cargar lo guardado» es la única salida y pasa por `abrirEditorDeNota` (registra acceso).
7. **Doble pulsación**: `enVuelo` como `ref`, no como estado (un `setState` no frena dos clics en el mismo tic), y `disabled={pendiente}` en los **dos** botones.
8. **Lista**:
   - `href` con `?nota=` siempre;
   - las columnas del `select` sin texto clínico;
   - `null` no es `[]`.
9. **Borrador ajeno** (si P-1 se confirma): `cargarModelo` lo deja en `null` antes de devolver el modelo, no en el cliente.
10. **Armazón**: `page.tsx` sin `notas_clinicas`, sin `lib/notas/servidor` y sin `use cache`. Recargar con F5 tras abrir vuelve al botón (manual).
11. **Catálogo**:
    - un solo `notas:` (`grep -c "^  notas: {" lib/i18n/es.ts` → `1`);
    - las seis de `sello`;
    - `episodio` y `modalidad` intactas;
    - sin `notasEnPreparacion`;
    - `git diff --stat` pequeño.
12. **P1-P8**: el diff de cada pieza contra su copia en `minimax/correcciones/` solo cambia el tipo del estado (`diff -r`).
13. **Territorio**: `node ~/.claude/pipeline/territorio.mjs T-012` limpio. Ningún cambio en `lib/cuentas/**`, `components/**` ni `supabase/**`.

### B.6 · Territorio del corte B

Todo cabe en el `territorio:` actual del contrato, que **no se toca**:
- `lib/notas/servidor.ts` y `lib/notas/servidor.test.ts`;
- `lib/i18n/es.ts`;
- `app/(app)/pacientes/[id]/{acciones.ts, peticion.ts, panel-historia.tsx, panel-historia.test.tsx, lista-de-notas.tsx, lista-de-notas.test.tsx}`;
- `app/(app)/pacientes/[id]/historia/notas/**`;
- `app/(app)/agenda/notas.ts` y `notas.test.ts`.

Fuera: `lib/cuentas/**`, `components/**`, `supabase/**`, `scripts/**` y `lib/huella/**`.

### B.7 · Delegable

**Nada nuevo es `delegable: volumen`.** Las piezas sin comportamiento (P1-P8) ya están hechas y corregidas, y copiarlas e integrarlas es de la fábrica, porque un CLI no integra. `BarraDeAcciones` tiene `disabled` y rol de barra, y el resto (editor, diálogo, reloj, cola y `lib`) es comportamiento.

### Preguntas para el propietario

- **P-1 · ¿Quien no es el autor ve el borrador sin firmar?** RLS ya se lo deja leer a quien vea la nota (un coprofesional, quien hereda el caso). *Recomendación: no.* El borrador es el trabajo en curso del autor, solo él lo corrige (ADR-059) y no se pinta lo que no se puede usar. Se ve que existe por la píldora «Borrador» / «Firmada · con cambios sin firmar» y la frase «Su autor tiene cambios sin firmar». Si la respuesta es sí, se quita B.1.1.5 y el editor lo pinta en solo lectura.
- **P-2 · ¿Entra en el corte B el arreglo de la ficha de B0.4?** El arreglo es `caducaEn ?? previa.caducaEn` en `ampliar`, y un plazo nulo de `abrirPestanaDeHistoria` tratado como «no se pudo abrir». Hoy un fallo pasajero deja la historia en pantalla sin cierre automático (ADR-026). Está en el territorio y en un fichero que B ya toca, pero ningún criterio lo pide. *Recomendación: sí*, con una prueba gemela de la del editor. Si no, se anota en `docs/state.md`.

### Lo que no entra, y por qué

- **Distinguir en `firmarNota` la deriva de reloj (6.20) o C (6.18) de 6.24**: los tres salen `conflicto`. Habría que interpretar más mensajes, y en el peor caso se ve un aviso repetido, sin pérdida (B.4.5).
- **El comparador, «Comparar» y «Descargar»**: son del corte C.
- **Copiar al portapapeles en el conflicto**: comportamiento nuevo sin criterio (B.2.5).
- **Un tipo de tres estados para la ventana en `lib/cuentas/candado.ts`**: B.2.3.
- **Crear desde la ficha una nota sin cita**: §2.17. La lista no crea.
- **El aviso de borrador abandonado**: ADR-036, sin criterio.

### Lo que el implementador lee, en este orden

1. `tickets/T-012-nota-clinica-firma.md`, hasta `## Anexos`.
2. De este diseño: §1.4, §1.5, §1.6, §2.8-§2.10, §2.13 y §7. Después, **esta enmienda entera**, que manda donde choque.
3. `tickets/T-036/diseno.md`, solo E.1 y E.2, para los literales de los mensajes.
4. `.claude/rules/pipeline.md` y `.claude/rules/nextjs.md`; `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`.
5. `lib/notas/servidor.ts` (`:30-140`, `:218-440`, `:567-633` y `:692-825`) y `lib/notas/servidor.test.ts` (arnés, tablas de cero filas, `abrirEditorDeNota · el candado manda` y SQLSTATE de la firma).
6. `lib/cuentas/accesos.ts` y `lib/cuentas/candado.ts:85-96`, solo lectura.
7. `app/(app)/pacientes/[id]/acciones.ts`, `panel-historia.tsx`, `panel-historia.test.tsx`, `formulario-pin-historia.tsx`, `page.tsx` y `datos.ts`.
8. `app/(app)/agenda/dialogo-reprogramar.tsx`, como patrón de diálogo con Zod.
9. Las primitivas de `components/ui/` (diálogo, desplegable, pestañas, área de texto, piezas, botón).
10. `minimax/correcciones/T-012/t012b/` entero y `lib/i18n/es.ts:320-365,495-525`.
11. `docs/decisions/ADR-058.md`, `ADR-047.md`, `ADR-059.md` y `ADR-044.md`.

**Orden de trabajo** (cada paso compila y pasa `npm test`):
1. el catálogo (B.1.9), sin borrar todavía `notasEnPreparacion`;
2. P1-P8 (B.1.6);
3. `servidor.ts` y sus pruebas (B.1.1);
4. `peticion.ts`, `esquemas.ts` y `acciones.ts`;
5. `barra-de-acciones` y `editor-de-nota`, con sus pruebas;
6. `page.tsx`, su prueba y `RUTA_NOTAS_DISPONIBLE` en **un** commit;
7. la ficha (B.1.7), con el borrado de `notasEnPreparacion` en el mismo commit;
8. lint, build y la evidencia manual cuando la BD esté libre.

### Resumen del corte B

1. Se construye la pantalla de la nota:
   - un armazón en `/pacientes/<id>/historia/notas` que no lee nada clínico;
   - un editor con candado, autoguardado, coprofesional, modificación y firma;
   - la barra táctil;
   - la lista de notas en la ficha;
   - la integración de P1-P8 y la activación del botón «Notas» de la agenda.
2. **R4-H1**: un registro de acceso fallido que no es «denegado» da `error` («vuelve a intentarlo»), no el PIN. Hay un antibucle: si tras un PIN aceptado vuelve a dar `bloqueada`, se dice «no se puede abrir».
3. **`prolongarDesbloqueo`**: no se distingue, porque toda llamada sigue a una operación que RLS dejó pasar. En la apertura, `null` da `error`; en las mutaciones, la pantalla conserva el plazo anterior y nunca lo borra. `lib/cuentas` no se toca.
4. **Conflicto de firma (T-036)**: aviso con foco, texto local intacto en solo lectura y «Cargar lo guardado». No se reintenta, y en la base no se pierde nada. Dos pruebas fijan los literales de 6.24 y del nuevo 6.18 como `conflicto`.
5. **R4-H2**: una fila más en la tabla de cero filas y su gemela en `fijarCoprofesional`. Las dos matan C4.
6. Correcciones al diseño:
   - la lista enlaza siempre con `?nota=`, porque `?cita=` puede crear una cabecera ajena;
   - P4 entra en B;
   - el catálogo se funde a mano, con seis claves en `sello`.
7. Para el propietario: P-1 (el borrador ajeno no viaja; recomendación «no se ve») y P-2 (arreglar el plazo nulo de la ficha; recomendación «sí»).
8. El territorio no cambia y no hay nada delegable.
9. Revisar con más cuidado:
   - ningún `caducaEn` nulo en el editor sin `?? actual`;
   - el `enVuelo` como `ref`;
   - las columnas sin texto clínico de la lista;
   - el bloque `notas` único en `es.ts`.
10. Se integra después de T-036, porque los criterios manuales 8, 10 y M4 necesitan la BD.

### Decisiones del propietario sobre el corte B (02-10-2026)

Mandan sobre B.1-B.7 donde choquen.

- **P-1 → el borrador ajeno se ve, en solo lectura** (el propietario se aparta de la recomendación).
  - Se cae B.1.1.5: `cargarModelo` devuelve el borrador vigente también cuando `!soyAutor`.
  - El editor lo pinta sin poder editarlo, guardarlo ni firmarlo. Ningún control de escritura aparece; no basta con deshabilitarlo.
  - Va marcado como no firmado («Su autor tiene cambios sin firmar», más la píldora) y separado de la última versión firmada, que sigue siendo lo primero que se ve.
  - La fila de la tabla de B.1 (`!soyAutor` con borrador) se invierte: ahora se espera el borrador en el modelo. Sus gemelas:
    - el autor sigue pudiendo editar;
    - quien no ve la nota por RLS no recibe ni la cabecera ni el borrador.
  - El punto 9 de B.5 pasa a ser: «el borrador ajeno llega en solo lectura y sin acciones de escritura; nada en la pantalla permite a quien no es el autor modificarlo».
  - Solo lo leen quienes RLS ya deja leer la nota. La pantalla no abre más puertas.
- **P-2 → sí, entra en el corte B.** Es el arreglo de B0.4 en la ficha (`panel-historia.tsx`):
  - `caducaEn ?? previa.caducaEn` al ampliar;
  - un plazo nulo de `abrirPestanaDeHistoria` se trata como «no se pudo abrir»;
  - lleva una prueba gemela de la del editor.

### Decisión del propietario sobre B0-H3 (02-10-2026)

- **El borrador ajeno se recorta por alcance** (era la recomendación).
- Quien no es el autor ve el texto del borrador solo si podría leer esa nota una vez firmada con el mismo alcance. Es decir: el borrador es `conjunta` y el lector es coprofesional del episodio, o el lector tiene ya lectura por la RLS de las versiones firmadas.
- En cualquier otro caso ve «Hay un borrador en curso», sin texto ni campos clínicos. El recorte se hace en servidor (`cargarModelo`): el texto no viaja al cliente.
- Prueba y gemela:
  - coprofesional con borrador individual → sin texto;
  - coprofesional con borrador conjunto → texto en solo lectura.

### Regla aplicada para B0-H3 (ronda de arreglos 1, 02-10-2026)

- Un borrador no guarda su alcance, porque el alcance se elige al firmar. El sustituto es el `coprofesional_id` de la cabecera: es la señal de que el autor quiere la nota conjunta.
- Leen el texto del borrador ajeno:
  - el profesional asignado, que ya lee todas las versiones por RLS;
  - quien figura como `coprofesional_id` de esa nota.
- Cualquier otro coprofesional del episodio ve solo «Hay un borrador en curso».
- La fábrica lo da por bueno: es la lectura más estrecha de la decisión del propietario.

### B1-H1: el borrador ajeno, solo el autor y el asignado (ronda de revisión B-1, 02-10-2026)

- La regla anterior (`coprofesional_id` de la cabecera) no sirve. `fn_congelar_cabecera_sellada` congela ese campo desde la v1, así que no expresa lo que el autor quiere para la versión en curso.
- Como el alcance del borrador no se conoce hasta la firma, la fábrica aplica la decisión del propietario («recortar por alcance») por el lado seguro. El texto del borrador lo leen solo:
  - el autor;
  - el profesional asignado, que ya lee todas las versiones firmadas.
- Cualquier otro lector ve «Hay un borrador en curso».
- La prueba gemela que daba por buena la lectura del coprofesional nombrado se invierte.
- La puerta por `select` directo a PostgREST sobre la cabecera es de `supabase/**`. Va a `docs/state.md` §Hallazgos, para el día en que el coprofesional pueda abrir la historia.

---

## Ronda B-2 (02-10-2026): las tres BAJA nuevas pasan al corte C

La ronda B-2 cierra todo lo de la ronda 1 con mutantes y deja 0 ALTA · 0 MEDIA · 4 BAJA. No se
abre una ronda 3 del corte B. Las tres nuevas entran en el contrato del corte C, que vuelve a
tocar la lista de versiones y el editor:

- **B2-H3 (regla de la fábrica).** En lectura conjunta, la primera versión visible **no muestra
  `motivo_cambio`**. Se numera por posición (B1-H4), y un motivo en la «Versión 1» delataría
  una v1 individual oculta (la tabla exige motivo a toda versión > 1). Gemela: el asignado sigue
  viendo el motivo de su v2. Prueba con la primera fila visible con `numero_version > 1`.
- **B2-H1.** Cuando falla la recarga en el camino del aviso (`firmadaSinRecargar` o
  `ya_firmada`), el aviso que la sustituye conserva una acción de reintento y el foco va a ella,
  no a `body`.
- **B2-H2.** Si quien no es autor abre una nota sin versiones y con el borrador oculto, el foco va
  al aviso «Hay un borrador en curso» (grupo con nombre y `tabIndex=-1`), nunca a «Cerrar la
  historia».
- B1-H8 (`cargarPaciente` → 404) sigue fuera del territorio: `docs/state.md` §Hallazgos.

---

## Corte C · Comparación entre versiones, foco pendiente (B2-H1..H3) y la descarga, bloqueada (02-10-2026)

Diseñado contra la rama `worktree-agent-a569a13c061c1d353` en `3a3c564` (corte B sin integrar). **El
corte B se integra antes de implementar este.** Esta sección no cambia las anteriores; donde choca
con §1.3 (`exportar.ts`), §1.4 (`descargarNotaCompleta`) y §2.11 (descarga en texto plano), **manda
esta** y aquellas quedan en suspenso hasta que se responda C.8 · Q-C1.

### C.0 · Hechos verificados contra el código

**La descarga choca con dos decisiones vigentes**, y esto cambia el corte:
- `docs/decisions/fundacionales.md:14`, decisión 4: «Cifrado de exportaciones con clave del usuario · Argon2id + AES-256. La contraseña no se persiste jamás». El documento maestro (línea 725) lo aplica a «los documentos y copias descargables». §5.4 (líneas ~1460-1500) concreta:
  - PDF o ZIP con AES-256;
  - la interfaz avisa «si pierdes esta contraseña, este archivo no se podrá abrir nunca» y pide confirmación;
  - entrega por URL firmada de vida corta;
  - destrucción a las 24 h.
- `docs/decisions/ADR-049.md:62-65`: «Toda exportación de datos clínicos sale por una capa propia con su formato versionado —`exportaciones` ya guarda alcance, filtros, algoritmo y huella—, nunca por un `select` incrustado en la pantalla que la pidió». Lo repite `docs/architecture.md:444-445`.
- **La tabla `exportaciones` no existe.** `grep -rn exportaciones supabase/` da cero resultados. Ningún ticket ni `PLAN.md` construye esa capa.
- `docs/decisions/ADR-032.md:75` da por hecha una «exportación cifrada con su propia clave (decisión 4)» para el profesional que se va. Tampoco existe en el código.
- §2.11 de este diseño decidió un `.txt` sin cifrar servido por Server Action. **Contradice la decisión 4 y el ADR-049.** Ninguna revisión anterior lo vio.
- **El contrato no tiene ningún criterio de aceptación sobre la descarga.** Solo la tarea «La descarga incluye todas las versiones…». Sacarla del ticket no deja un criterio sin cerrar.

**La traza de la exportación** (por si se construye aquí; ver C.1.7):
- El enum del `tipo` de `accesos_historia` ya incluye `exportacion`.
- `registrar_acceso_historia()` es solo para `'apertura'`. Lo dice su comentario: exportación, informe y emergencia «tienen otro camino».
- La política `accesos_historia_alta` admite `desbloqueo_id is null` y **en ese caso no mira el candado**: solo `perfil_id = auth.uid()` y administrador o `es_profesional_asignado`.
- El índice `accesos_historia_ventana_idx`, sobre `(desbloqueo_id, paciente_id, pestana) nulls not distinct where desbloqueo_id is not null`, **no incluye `tipo`**. Una exportación con `desbloqueo_id` daría 23505 contra la apertura de la misma ventana. Por eso iría con `desbloqueo_id` nulo.
- `desbloqueo_vigente()` está expuesta (`lib/supabase/tipos-bd.ts`: `Args: never; Returns: string`).
- La huella es `digest(convert_to(contenido_canonico,'UTF8') || huella_anterior, 'sha256')` (`supabase/migrations/20260829210000_cadena_de_huellas.sql:450`). `contenido_canonico` es `text`; `huella` y `huella_anterior`, `bytea` (llegan como `\x…`).

**Next 16** (`node_modules/next/dist/docs/01-app/`):
- Las Server Functions solo se invocan por `POST` (`02-guides/server-actions.md`, `02-guides/data-security.md`).
- Su valor de retorno se serializa al cliente (`server-actions.md:91`).
- El límite de 1 MB (`bodySizeLimit`) es del **cuerpo de la petición**, no de la respuesta (`server-actions.md:83`).
- El cliente las despacha **de una en una** (`server-actions.md:26-30`).
- Un Route Handler `GET` con Cache Components corre en cada petición. Pero «Next.js uses POST requests to handle mutations. This prevents accidental side-effects from GET requests» (`data-security.md:567-601`), y registrar un acceso es una mutación. Además, el ADR-058 pide un ADR nuevo para cualquier ruta que sirva contenido clínico.

**La pantalla en la rama** (`app/(app)/pacientes/[id]/historia/notas/` y `lib/notas/`):
- **Versión vigente y «modificada el · por».** Ya los pinta el corte B: `VistaVigente` en `editor-de-nota.tsx`, y `ModificadaPor` cuando `vigente.numero > 1`. Los encabezados son «Versión vigente» y «Última versión conjunta». Debajo hay un `<ol>` del historial con `FilaDeVersion`.
- **El modelo ya trae los textos de todas las versiones.** `modelo.versiones` lleva `texto` y `reservadas` de cada versión visible (`servidor.ts:350-378`). Viajan bajo el acceso de la apertura y caen al cerrarse: el estado `cerrada` sustituye al entero.
- **Motivo en lectura conjunta.** En `servidor.ts:350-378`, con `lecturaConjunta`, se numera `posicion + 1` pero se manda `motivo: v.motivo_cambio` sin recorte. Es B2-H3.
- **B2-H1, la recarga que falla.** Con el editor abierto, una apertura en `error` deja `aviso: 'noSeAbrio'` y `no_disponible` deja `'noDisponible'`. Ninguno de los dos lleva acción: solo `yaFirmada` (cargar lo guardado) y `firmadaSinRecargar` (recargar) la tienen. El botón que tenía el foco se desmonta y el foco cae en `body`.
  - `pedirFoco` no ayuda: con `sigueLaVista` no se pide.
  - El único efecto de foco sobre el aviso depende del booleano `firmadaSinRecargar` (`editor-de-nota.tsx:484-487`).
- **B2-H2, el foco tras abrir.** Al abrir, `enfocarPrimero` busca `['textarea', 'h2[tabindex="-1"]', '[role="group"][tabindex="-1"]', 'button:not([disabled])']`. El párrafo «Hay un borrador en curso.» (`modelo.borradorOculto && !modelo.soyAutor`) no es grupo ni enfocable, así que el foco cae en «Cerrar la historia».
  - **La prueba `editor-de-nota.test.tsx:942` fija hoy ese comportamiento** («abierta sin nada que leer ni escribir: el foco va a un botón con nombre»). Se invierte.
  - **Misma clase, otra puerta:** `BorradorAjeno` tiene un `h2` sin `tabIndex`, y el `EstadoVacio` de cuando no hay nada que mostrar no tiene grupo.
- **La prueba del conflicto.** `editor-de-nota.test.tsx:1035` («un Recargar que falla (error) no roba el foco del botón que sigue montado») fija que, en el camino del conflicto, el foco **se queda** en «Cargar lo guardado». B2-H1 no debe romperla.
- **Piezas de la interfaz:**
  - `AvisoDeError({mensaje, accion})` (`components/ui/piezas.tsx`) es un `div role="alert"`.
  - `Desplegable({opciones, valor, alElegir, etiqueta, marcador})` está en `components/ui/`.
  - `Button` tiene `min-h-11`.
  - No hay `fast-check` ni librería de diff en `package.json`, y el contrato no nombra ninguna.
- **i18n.** El bloque `notas` de `lib/i18n/es.ts` (líneas 503-608) tiene `version.titulo: 'Versión {numero}'`, `editor.nota`, `editor.reservadas`, `editor.borradorOculto`, `aviso.reintentar: 'Volver a intentarlo'`, `aviso.recargar`, `aviso.noDisponible` y `aviso.noSeAbrio`. No tiene bloque `comparar`.

### C.1 · Piezas y contratos

#### C.1.1 · `lib/notas/comparar.ts` (+ `comparar.test.ts`): pura, sin dependencias

```ts
export type Segmento = { tipo: 'igual' | 'anadido' | 'retirado'; texto: string };
export type Comparacion = { segmentos: Segmento[]; /** false si se agotó el presupuesto */ completa: boolean };
export const MAX_EDICIONES = 1000;
export function compararTextos(antes: string, despues: string): Comparacion;
```

1. **Normalización.** Las dos entradas se pasan por `normalize('NFC')`, porque la huella las da por iguales (criterio NFC). Desde aquí, «antes» y «después» son las normalizadas.
2. **Fichas.** `texto.match(/\s+|[^\s]+/gu) ?? []`: una palabra o una tirada de blancos, los saltos de línea incluidos. Se comparan por igualdad exacta.
3. **Prefijo y sufijo.** Se recortan las fichas comunes del principio y del final, que salen como `igual`.
4. **El tramo central.** Se compara con **Myers O(ND)**:
   - se guarda una instantánea de `V` por cada `d`, en un `Int32Array` de `2d+1`;
   - se reconstruye el camino hacia atrás;
   - si `d` supera `MAX_EDICIONES`, el tramo central sale como **un** `retirado` seguido de **un** `anadido`, con `completa: false`.
5. **Salida:**
   - (a) sin segmentos vacíos;
   - (b) sin dos contiguos del mismo tipo (se funden);
   - (c) en cada bloque de cambio, `retirado` va antes que `anadido`;
   - (d) si las entradas son iguales: `[{igual}]`, o `[]` si las dos están vacías.
6. **Invariantes que la prueba fija:**
   - **I1:** los `igual` y `retirado`, unidos, dan exactamente `antes`;
   - **I2:** los `igual` y `anadido`, unidos, dan exactamente `despues`;
   - **I3:** con `completa: true`, el número de fichas `igual` es la LCS de fichas.

#### C.1.2 · `app/(app)/pacientes/[id]/historia/notas/comparador.tsx` (+ `comparador.test.tsx`): cliente

`'use client'`. Tiene estado y vive dentro del editor, que ya es cliente. **No importa ni llama a ninguna acción.**

```ts
export function Comparador({ versiones }: { versiones: VersionDeVista[] }): JSX.Element | null;
```

- **Cuándo existe.** Con `versiones.length < 2` devuelve `null`: sin dos versiones no hay control.
- **El disparador.** `Button` de contorno «Comparar versiones», con `aria-expanded` y `aria-controls` hacia la región. Abre y cierra; el foco se queda en el botón.
- **La región** es un `section aria-labelledby` con:
  1. un `h3` «De la versión {desde} a la {hasta}»;
  2. dos `Desplegable`, «Desde» y «Hasta», con las opciones `Versión {v.numero}`. El número es **el que da el modelo**: posicional en lectura conjunta (B1-H4). El comparador no calcula números.
  3. **Por defecto**: desde la penúltima, hasta la vigente.
  4. **El orden se normaliza**: se compara siempre la de menor `numero` con la de mayor, se elija como se elija, y el título lo dice.
  5. **La leyenda**, visible: «Lo añadido va subrayado y con «+»; lo retirado, tachado y con «−».»
  6. **El bloque «Nota»**: `compararTextos(a.texto, b.texto)`.
  7. **El bloque «Anotaciones reservadas»**, solo si alguna de las dos tiene reservadas no vacías. Lleva `AvisoReservadas` encima y usa `compararTextos(a.reservadas ?? '', b.reservadas ?? '')`.
  8. **Sin cambios**: si no hay ni `anadido` ni `retirado` en ningún bloque, un `p role="status"` «Sin cambios entre estas dos versiones.»
  9. **Comparación resumida**: con `completa: false`, la línea `notas.comparar.resumida`.
- **Cómo se pinta un segmento**, dentro de un `p` con `whitespace-pre-wrap`:
  - `igual`: texto llano.
  - `anadido`: `<ins className="underline decoration-2 underline-offset-2">`. Dentro, `<span aria-hidden="true">+</span>`, `<span className="sr-only">Añadido: </span>`, el texto y `<span className="sr-only"> Fin del cambio.</span>`.
  - `retirado`: lo mismo con `<del className="line-through decoration-2">`, «−» (U+2212) y «Retirado: ».
  - **Las clases van explícitas**: no se confía en el estilo por defecto de `ins`/`del` ni en el preflight de Tailwind.
  - Un fondo de color de los tokens del tema es opcional, **nunca la única señal**.
- **Cálculo**: `useMemo` sobre (`a`, `b`).
- **En 360 px**: los dos desplegables van en columna por debajo de `48rem` y en fila por encima.

#### C.1.3 · `editor-de-nota.tsx`: dónde va el comparador, B2-H1 y B2-H2

**El comparador:**
- En `VistaVigente`, después del `<ol>` del historial: `<Comparador key={versiones.length} versiones={versiones} />`.
- La `key` lo cierra y le recalcula los valores por defecto cuando llega una versión nueva.
- La barra de acciones no cambia. Solo cambia su comentario (C.1.6).

**B2-H1, la recarga que falla en el camino del aviso:**
1. `ClaveDeAviso` gana `'noSeRecargo'`, y `AVISOS.noSeRecargo` apunta a `'notas.aviso.noSeRecargo'`.
2. Se añade `const AVISOS_CON_RECARGA: ClaveDeAviso[] = ['yaFirmada', 'firmadaSinRecargar', 'noSeRecargo']`.
3. El tipo `Abierta` gana `enfoqueAviso: number`, con el mismo patrón que `enfoqueVigente`:
   - empieza en 0 al construir la abierta;
   - se **conserva** en la acción `modelo`, tomando `estado.enfoqueAviso`.
4. En `reducir`, caso `apertura`, con el editor abierto:
   - `error` y `!estado.conflicto && AVISOS_CON_RECARGA.includes(estado.aviso)` → `{...estado, aviso: 'noSeRecargo', enfoqueAviso: +1}`. En cualquier otro caso, `'noSeAbrio'`, como hoy.
   - `no_disponible`, con la misma condición → `{...estado, aviso: 'noDisponible', enfoqueAviso: +1}`. Si no, como hoy.
   - `soloLectura` no se toca: ya era cierto por `yaFirmada` o `firmadaSinRecargar`.
5. `sin_recargar` con `firmadaSinRecargar` también suma `enfoqueAviso: +1`.
6. **El efecto de foco.** Se quita el efecto booleano de `firmadaSinRecargar` y se pone uno sobre `enfoqueAviso`: si es mayor que 0, `(refAviso.current?.querySelector('button') ?? refAviso.current)?.focus()`.
7. **El contenedor del aviso** pasa a ser `<div ref={refAviso} role="group" tabIndex={-1} aria-label={t(AVISOS[estado.aviso])} className="outline-none">`.
8. **La acción del aviso** sale si `AVISOS_CON_RECARGA.includes(estado.aviso)`:
   - `yaFirmada` → «Cargar lo guardado»;
   - `firmadaSinRecargar` → «Recargar»;
   - `noSeRecargo` → «Volver a intentarlo».
   
   Las tres hacen la misma reapertura que hacen hoy las dos primeras.

**B2-H2, y la misma clase por las otras dos puertas:**
- **«Hay un borrador en curso.»** Su `p` se envuelve en `<div role="group" tabIndex={-1} aria-label={t('notas.editor.borradorOculto')} className="outline-none">`.
- **`EstadoVacio` sin nada que mostrar.** Se envuelve igual, con `aria-label` del propio mensaje que pinta.
- **`BorradorAjeno`.** Su `h2` gana `tabIndex={-1}` y `outline-none`.
- **El orden de `enfocarPrimero` no cambia.** Con versiones, el `h2` de `VistaVigente` va antes en el DOM y gana. Sin versiones, gana el `h2` del borrador ajeno o el grupo.

#### C.1.4 · `lib/notas/servidor.ts`: B2-H3

- En `cargarModelo` (bloque de `servidor.ts:350-378`): `motivo: lecturaConjunta && posicion === 0 ? null : v.motivo_cambio`.
- Lleva un comentario que cita B2-H3: un motivo en la «Versión 1» delataría una versión anterior individual oculta.
- Nada más cambia en el servidor.

#### C.1.5 · `lib/i18n/es.ts`: claves nuevas, en el bloque `notas` que ya existe

Sin bloque duplicado.
- `notas.comparar`:
  - `abrir`: «Comparar versiones»;
  - `titulo`: «De la versión {desde} a la {hasta}»;
  - `desde`: «Desde»;
  - `hasta`: «Hasta»;
  - `leyenda`: «Lo añadido va subrayado y con «+»; lo retirado, tachado y con «−».»;
  - `anadido`: «Añadido: »;
  - `retirado`: «Retirado: »;
  - `fin`: « Fin del cambio.»;
  - `sinCambios`: «Sin cambios entre estas dos versiones.»;
  - `resumida`: «Hay demasiados cambios para señalarlos palabra a palabra: se muestra completo lo retirado y lo añadido.»
- `notas.aviso.noSeRecargo`: «No se pudo recargar la nota.»
- Se reutilizan:
  - `notas.version.titulo` para las opciones;
  - `notas.editor.nota` y `notas.editor.reservadas` para los títulos de los bloques;
  - `notas.aviso.reintentar` para la acción.

#### C.1.6 · `barra-de-acciones.tsx`

- Solo cambia el comentario «sin Comparar ni Descargar hasta el corte C».
- Pasa a decir que la comparación vive junto al historial (C.2.2) y que la descarga espera a Q-C1.

#### C.1.7 · La descarga: **BLOQUEO** (C.8 · Q-C1)

**Lo que se puede decidir ya**, sin inventar, y vale para cualquier opción:
- **Contenido.** Solo versiones **firmadas**, todas, por `numero_version` ascendente. El borrador no es la nota.
- **Por versión:**
  - el número real;
  - el nombre del autor;
  - la fecha y hora en la zona de la cita o de la organización (ADR-034);
  - el alcance y el motivo;
  - la frase del sello;
  - los dos cuerpos;
  - `huella` y `huella_anterior` en hexadecimal;
  - `contenido_canonico` literal, con la fórmula de comprobación de C.0.
- **Sin `posicion_cadena`.** No hace falta para comprobar el eslabón.
- **Reservadas dentro.** Es la copia profesional o judicial: la reserva no «se opone a un juez» y «la exportación para uso judicial es otra salida, con su propia traza» (ADR-027).
- **No es la salida del derecho de acceso.** Esa excluye las reservadas y no entrega entera una nota conjunta (ADR-027, ADR-030).
- **Para quién.** La matriz dice «Notas clínicas — Profesional: autor o asignado; Administrador: solo las suyas (+ emergencia); Técnico: sin acceso» (`docs/architecture.md:174-186`), y de descargas no dice nada. **No hay descarga en `lecturaConjunta`**, por cuatro motivos:
  - la copia sería parcial;
  - estaría renumerada;
  - el `contenido_canonico` literal lleva `motivo_cambio` y el número real, y rompería B2-H3 y B1-H4;
  - «todas las versiones» sería falso.
  
  El servidor lo recalcula con `es_profesional_asignado` o con la autoría, y no se fía del cliente.
- **Traza.** Una fila en `accesos_historia` con:
  - `{tipo: 'exportacion', pestana: 'notas_clinicas', desbloqueo_id: null, ip, agente}`;
  - insertada **antes** de leer;
  - después de comprobar `desbloqueo_vigente()` no nulo, porque la política no mira el candado con `desbloqueo_id` nulo.

**Lo bloqueado es el transporte.** La decisión 4 y el ADR-049 exigen tres cosas que no existen ni caben en el territorio de T-012:
- cifrado con contraseña del usuario;
- la capa `exportaciones`;
- URL firmada con destrucción a las 24 h.

Además, §5.4 del maestro parece no casar consigo mismo:
- el PDF AES-256 estándar (ISO 32000-2, R6) y el ZIP AES de WinZip derivan la clave con su propio algoritmo;
- no usan Argon2id;
- un lector estándar no abriría un archivo cifrado con una clave sacada de Argon2id.

Lo tiene que resolver un ADR del ticket que construya la capa, no este corte. Queda como hecho por comprobar allí, no como cerrado.

**Si el propietario elige D-c** (texto plano en T-012 con un ADR nuevo que lo exima), el diseño de C.0 está listo sin otra ronda:
1. La Server Action `descargarNotaCompleta` en `historia/notas/acciones.ts`, con `esquemaDescarga = {pacienteId, notaId}` (uuid). No es un Route Handler `GET`, por `data-security.md` y el ADR-058.
2. `servidor.descargarNotaCompleta(sesion, entrada, contexto)` hace, por orden:
   - `rpc('desbloqueo_vigente')`: si es `null`, `bloqueada`; si falla, `error`;
   - inserta el acceso: un 42501 da `bloqueada` y cualquier otro fallo, `error`, y **no lee**;
   - lee la cabecera: tiene que ser de este paciente;
   - comprueba autor o asignado; si no, `no_disponible`;
   - lee las versiones, con `huella_anterior`, y los nombres;
   - compone con `lib/notas/exportar.ts`, que es pura.
3. Devuelve `{ok: true, nombre: 'nota-<notaId>.txt', texto, caducaEn}`. El cliente lo baja con `Blob` + `URL.createObjectURL` + `a[download]` y revoca la URL.

### C.2 · Decisiones y alternativas descartadas

1. **La comparación se hace en el cliente, sobre `modelo.versiones`, sin acción nueva ni fila de acceso.**
   - Esos textos ya están en el navegador bajo el acceso registrado al abrir y caen con el candado.
   - *Descartado* `compararVersiones` como Server Action: relee lo que ya está en el cliente, no protege nada más y suma un viaje.
   - *Descartado* registrar una «vista» por comparar: comparar no es abrir.
2. **«Comparar versiones» va junto al historial, no en la barra.**
   - Es lectura y la puede hacer quien no es autor. La barra solo se monta para quien escribe (`editable || puedeModificar`).
   - *Descartado* meterla en la barra: obligaría a montarla para lectores, y la región quedaría lejos del texto que compara.
3. **Diff por palabras con Myers O(ND), con presupuesto y salida honesta (`completa: false`).**
   - *Descartada* la LCS O(n·m) de §1.3: con una nota larga (unas 20 000 fichas) son unos 10⁸ celdas en el navegador.
   - *Descartado* el diff por caracteres: ilegible en prosa.
   - *Descartada* una dependencia: el contrato no nombra ninguna (`pipeline.md` §package.json).
4. **Tres señales sin color**: subrayado o tachado, el signo «+» o «−» visible y el texto `sr-only`, más una leyenda.
   - Cierran el criterio manual 9 para quien ve en gris y para quien no ve.
   - *Descartado* solo el color de fondo.
5. **El orden de la comparación se normaliza** (menor → mayor).
   - *Descartado* permitir «de la 3 a la 1»: invierte el sentido de «añadido» sin decirlo.
6. **B2-H1 con un aviso propio (`noSeRecargo`) y su reintento**, solo en el camino del aviso.
   - En el del conflicto, el botón «Cargar lo guardado» sigue montado y ya tiene el foco (prueba `:1035`).
   - *Descartado* mantener el aviso anterior sin decir que falló: el usuario no sabría que no se recargó.
7. **B2-H2 se cierra en las tres puertas** (borrador oculto, borrador ajeno legible y nada que leer). Son el mismo defecto.
   - *Descartado* arreglar solo la que cita la ronda: el revisor la encontraría por la de al lado.
8. **La descarga no se construye sin respuesta a Q-C1.**
   - *Descartado* seguir con §2.11: una decisión fundacional y un ADR son ley, y el `.txt` sin cifrar con las reservadas es justo el fichero que la decisión 4 existe para proteger.

### C.3 · Cómo se cierra cada criterio

**Criterio manual 9: v1 frente a v2, sin depender del color.**
- **`comparar.test.ts`:**
  - Ejemplo fijo: «El paciente refiere ansiedad leve.» → «El paciente refiere ansiedad moderada y insomnio.» da `[igual 'El paciente refiere ansiedad ', retirado 'leve.', anadido 'moderada y insomnio.']`.
  - **Propiedad** con un LCG sembrado (500 pares sobre un alfabeto de 6 palabras, espacios y `\n`): I1, I2, sin vacíos, sin contiguos iguales, `retirado` antes que `anadido`.
  - **Minimalidad**: para entradas de 30 fichas o menos, las fichas `igual` son la LCS de una programación dinámica de referencia escrita en la propia prueba.
  - **NFC**: «café» descompuesto frente a precompuesto da un solo `igual`.
  - **Vacíos**: `('', '')` da `[]`; `('', 'x')` da `[anadido]`; `('x', '')` da `[retirado]`.
  - **Presupuesto**: dos textos de 3000 palabras distintas con el prefijo común «A » dan `[igual 'A ', retirado, anadido]`, `completa: false` y menos de 1 s.
- **Mutantes** (cada uno con la prueba que lo mata):
  - quitar las fichas de blanco: I1 e I2;
  - emitir `anadido` antes que `retirado`: el orden;
  - no fundir segmentos: «sin contiguos»;
  - **devolver siempre el bloque entero**: cumple I1 e I2, y por eso existe la prueba de minimalidad, que lo mata;
  - quitar la normalización NFC: la prueba NFC.
- **`comparador.test.tsx`:**
  - **Una versión**: no hay botón «Comparar versiones». **Gemela**: con dos, sí.
  - **Al abrir**: `aria-expanded="true"` y el título «De la versión 1 a la 2».
  - **Lo añadido**: `ins` contiene «moderada», tiene la clase `underline` y el texto visible `+`, y su texto accesible empieza por «Añadido:».
  - **Lo retirado**: `del` con «leve.», `line-through`, `−` y «Retirado:».
  - **La leyenda** está presente.
  - **Orden invertido** (desde la 2, hasta la 1): el título dice «De la versión 1 a la 2» y lo añadido sigue siendo «moderada».
  - **Reservadas**: el bloque no está si las dos están vacías (gemela: está si una tiene texto).
  - **Iguales**: «Sin cambios entre estas dos versiones.»
  - **Números posicionales** (versiones con `numero` 1 y 2 aunque las reales sean 2 y 3): solo opciones «Versión 1» y «Versión 2».
  - **Mutantes**:
    - quitar el «+»: la prueba del texto visible;
    - quitar el `sr-only`: la del texto accesible;
    - `versiones.length < 1` como guarda: la de una versión;
    - no normalizar el orden: la del orden invertido.
- **`editor-de-nota.test.tsx`:**
  - Con dos versiones, «Comparar versiones» está en la sección de la vigente.
  - **Cae con el candado**: con el comparador abierto, `avanzar` hasta `caducaEn` → `queryByText('moderada')` es `null`.
  - **Mutante** que guarda los segmentos fuera del árbol, en módulo o `ref` del editor: esta prueba.
- **Manual** (guion, punto 5): DevTools → *Rendering* → *Emulate vision deficiencies: Achromatopsia*. Se distinguen el subrayado, el tachado y «+»/«−», y NVDA lee «Añadido: … Fin del cambio.»

**Tarea «la vista muestra por defecto la vigente, con "modificada el · por" y acceso a comparar».**
- La vigente y «modificada el · por» ya los cierra el corte B; sus pruebas siguen verdes.
- El acceso a comparar lo cierran las pruebas de arriba.

**B2-H3** (`lib/notas/servidor.test.ts`, junto a las de B1-H4, líneas ~1449-1492, con `clienteSimulado(firmaFeliz(...))`):
- **Prueba**:
  - Escenario: no asignado, autor de las conjuntas otro; filas v2 conjunta con motivo «Ajuste» y v3 conjunta con motivo «Corrección».
  - Resultado: `versiones[0]` tiene `{numero: 1, motivo: null}` y `versiones[1]` tiene `{numero: 2, motivo: 'Corrección'}`. `JSON.stringify(r)` no contiene «Ajuste».
- **Gemela**: el asignado, con v1 individual y v2 conjunta con «Ajuste», recibe `versiones[1].motivo === 'Ajuste'`.
- **Mutantes**:
  - quitar la condición: mata la prueba;
  - anular todos los motivos: mata la segunda aserción y la gemela.
- **Mutante equivalente, declarado**: quitar `lecturaConjunta` es equivalente con datos reales. Para quien lo ve todo, la posición 0 es la v1, cuyo motivo es nulo.

**B2-H1** (`editor-de-nota.test.tsx`, junto a las de foco de `:884` y `:1057`):
- **(a)** Firma con `nota: null` (firmadaSinRecargar) → «Recargar» → `abrirEditorDeNota` da `error`. Resultado: aviso «No se pudo recargar la nota.», `document.activeElement` es el botón «Volver a intentarlo» y `cuerpo().readOnly` sigue siendo `true`.
- **(b)** Firma rechazada con `ya_firmada` → «Cargar lo guardado» → `error`. Mismo resultado.
- **(c)** Pulsar «Volver a intentarlo» con apertura `abierta`: la nota se recarga y el foco va al encabezado de la vigente.
- **(d)** Recarga que da `no_disponible` en el camino del aviso: el foco va al grupo con el nombre del aviso de no disponible.
- **Gemela**: la prueba `:1035` (conflicto) sigue verde sin tocarla.
- **Mutantes**:
  - sin acción en `noSeRecargo`: mata (a) y (b);
  - quitar el efecto o el `tabIndex` del contenedor: mata (d);
  - aplicar `noSeRecargo` también con conflicto: rompe `:1035`.

**B2-H2:**
- **La prueba `:942` se invierte**: borrador oculto sin versiones → foco en el grupo «Hay un borrador en curso.».
- **Nuevas:**
  - asignado no autor, borrador ajeno legible sin versiones → foco en su `h2`;
  - nada que leer → foco en el grupo del estado vacío.
- **Gemela**: borrador oculto **con** versiones → `h2` «Versión vigente» (o «Última versión conjunta» si es lectura conjunta).
- **Mutantes**:
  - quitar `tabIndex` del grupo: el foco vuelve a «Cerrar la historia»;
  - poner el grupo antes que el `h2` en `enfocarPrimero`: mata la gemela.

**`npm run lint && npm run build`**: limpios.
- `npm test` completo, sin regresiones sobre `main` más el corte B.
- Sin cambios SQL, así que `test:rls` no se toca. No hace falta la base local.

### C.4 · Riesgos, por probabilidad

1. **Alta: B2-H1 rompe la prueba del conflicto (`:1035`)** si la condición olvida `!estado.conflicto`. Mitigación: la gemela es esa prueba, sin editar.
2. **Media: que el foco «funcione» por reconciliación de React.** Al cambiar de `firmadaSinRecargar` a `noSeRecargo`, el `Button` puede ser el mismo nodo y conservar el foco sin el efecto. Las pruebas (a) y (b) pasarían con el efecto roto. Mitigación: la prueba (d), que no tiene botón, solo pasa con el efecto. El revisor lo comprueba quitando el efecto.
3. **Media: rendimiento del diff en móvil** con notas largas muy cambiadas. Mitigación: el presupuesto y la prueba de 3000 palabras en menos de 1 s, más un `useMemo`.
4. **Media: que el propietario no responda Q-C1 antes de cerrar.** T-012 no puede marcar la tarea de la descarga, aunque ningún criterio dependa de ella. Mitigación: Q-C1 propone moverla.
5. **Baja: lectores de pantalla** que anuncian `ins`/`del` y, encima, el `sr-only`, repitiendo «insertado: Añadido:». Aceptable. Se comprueba con NVDA en el guion.
6. **Baja: `useMemo` con `versiones` nuevas en cada recarga del modelo.** Se recalcula, y es barato con el presupuesto.

### C.5 · Qué revisar

1. **Que el comparador no hable con el servidor.** `grep` de imports de `./acciones` en `comparador.tsx`: cero. Si algún día lo hiciera, sería una lectura sin acceso registrado.
2. **Que no quede texto clínico vivo tras `cerrada`.** Nada de segmentos en `ref`, en estado de módulo, en `sessionStorage` ni en la URL. Lo prueba el editor (C.3); el revisor mira además que no haya `useRef` con segmentos.
3. **Que los números de versión salgan del modelo.** El comparador no puede leer otra cosa que `v.numero` (B1-H4). Que no se cuele un `numero_version`.
4. **B2-H3, en lectura conjunta:**
   - el motivo de la primera visible es `null` **en el servidor**, no escondido en la pantalla;
   - `JSON.stringify` de la respuesta no lo contiene;
   - el comparador no muestra ningún motivo.
5. **Las tres señales sin color van en el marcado**, no solo en CSS: el signo visible y el `sr-only`. Las clases son explícitas.
6. **Con `completa: false`, la pantalla lo dice.** Un bloque entero tachado y añadido sin la frase haría creer que se reescribió todo.
7. **La prueba de minimalidad existe y discrimina**: sustituir el algoritmo por «todo retirado + todo añadido» la tiene que poner roja.
8. **B2-H1:**
   - `noSeRecargo` solo con `!conflicto` y un aviso de `AVISOS_CON_RECARGA`;
   - `soloLectura` sigue siendo `true`: un fallo de recarga no reabre la escritura sobre una nota ya firmada;
   - el contador `enfoqueAviso` se conserva en la acción `modelo`.
9. **B2-H2:**
   - las tres puertas;
   - la prueba `:942` invertida, no borrada;
   - el orden de `enfocarPrimero` sin tocar.
10. **Ningún control sin acción:**
    - no hay botón «Descargar» en ninguna parte;
    - no hay «Comparar» con menos de dos versiones;
    - el comentario de la barra está actualizado.
11. **El bloque `notas` sigue siendo único en `es.ts`.**
12. **Ningún fichero fuera del territorio.** `node ~/.claude/pipeline/territorio.mjs T-012`.

### C.6 · Territorio

Todo cabe en el del contrato. **No hace falta ampliarlo:**
- `lib/notas/comparar.ts` y `lib/notas/comparar.test.ts`, en `lib/notas/**`;
- `lib/notas/servidor.ts` y `servidor.test.ts`, en `lib/notas/**`;
- `app/(app)/pacientes/[id]/historia/notas/comparador.tsx` y su `.test.tsx`, `editor-de-nota.tsx` y su `.test.tsx`, y `barra-de-acciones.tsx` (comentario), en `app/(app)/pacientes/[id]/**`;
- `lib/i18n/es.ts`.

**Fuera, y no se toca**:
- `supabase/**`;
- `lib/cuentas/**`;
- `components/ui/**`;
- `accesibilidad/nota-clinica.spec.ts`. No hace falta: el criterio 9 es manual y la prueba de Playwright necesitaría la base.

Si Q-C1 sale D-b, el territorio **sí** crece, y eso lo decide un contrato nuevo.

### C.7 · Delegable

**Nada.**
- `comparar.ts` es pura, pero las funciones puras son de la fábrica desde el 30-09-2026 (`pipeline.md`), y su prueba de minimalidad es la que discrimina.
- El comparador lleva ARIA, foco y señales accesibles.
- B2-H1 y B2-H2 son foco.

### C.8 · Preguntas al propietario

**Q-C1 · BLOQUEO de la descarga.** La tarea «La descarga incluye todas las versiones…» choca con la decisión fundacional 4 (copias descargables cifradas con tu contraseña) y con el ADR-049 (toda exportación clínica sale por la capa `exportaciones`). Esa capa no existe. ¿Qué hacemos?
- **D-a (recomendada).** La descarga sale de T-012 a un ticket propio, «Capa de exportación clínica», de riesgo alto. Incluye:
  - la tabla `exportaciones`;
  - el cifrado y su ADR (que reconcilie Argon2id con lo que abre un lector estándar);
  - la URL de vida corta;
  - la traza `exportacion`;
  - dos proyecciones: la profesional o judicial (con reservadas) y la del paciente (sin reservadas, conjuntas parciales).

  T-012 cierra con comparación y vista, sin botón «Descargar». Lo decidido en C.1.7 sobre el contenido pasa a ese ticket. **Razón**: es lo único que cumple las dos decisiones sin convertir T-012 en otro ticket, y ningún criterio de aceptación depende de la descarga.
- **D-b.** T-012 construye la capa mínima. Exige ampliar el territorio (`supabase/**`, Storage, una dependencia de cifrado), un ADR de cifrado y otra ronda de diseño. Es el doble del corte.
- **D-c.** Texto plano ahora (§2.11 y la variante de C.1.7), con un ADR nuevo que exima esta salida de la decisión 4 y del ADR-049. **No recomendada**: el fichero más sensible del sistema, con reservadas, sería el único sin cifrar.

**Q-C2 · Para quién es la copia completa** (vale para D-a o para D-c).
- **Recomendación**:
  - solo el autor de la nota o el profesional asignado, que es la matriz;
  - **nunca en lectura conjunta**, por los cuatro motivos de C.1.7;
  - el administrador, solo por acceso de emergencia, cuando exista.
- **Queda abierto para el ticket de exportación**: si la cabecera de la copia identifica al paciente por nombre o solo por UUID. La matriz no lo dice; es una decisión de ese contrato.

### C.9 · Por confirmar al implementar

- **El orden:** integrar el corte B en `main` y crear el worktree de C desde ahí.
- **Que `cuerpo` se guarde ya en NFC.** Si es así, la normalización de `compararTextos` no cambia nada; si no, la justifica. No cambia el diseño.
- **El helper `version(n)`** de `editor-de-nota.test.tsx`: si acepta `texto` y `reservadas` por parámetro, y si no, ampliarlo. Es fichero del territorio.
- **Que axe no se queje** de un `role="alert"` dentro de un `role="group"` con `aria-label`. Si se quejara, `aria-labelledby` hacia el `p` del aviso.
- **`Desplegable`** con `valor` como cadena: las opciones son `String(v.numero)`, y se vuelve a número al elegir.
- **El presupuesto de Myers**: `MAX_EDICIONES` = 1000 da del orden de 10⁶ entradas `Int32` en las instantáneas. Medirlo en la prueba de 3000 palabras; si fuese lento, bajar a 500, que es una constante y no un cambio de diseño.
- **El comentario de `barra-de-acciones.tsx`**, y que su prueba no fije el texto del comentario.

### C.10 · Lo que no entra, y por qué

- **La descarga**: bloqueada por Q-C1 (C.1.7).
- **Comparar borrador con vigente**: el contrato pide comparar «entre versiones», y el borrador no lo es.
- **Diff por caracteres o con detección de movimientos**: no cambia el criterio 9 y cuesta más.
- **La salida del derecho de acceso** (sin reservadas): es otra salida, de otro ticket.
- **PDF e impresión**: dependen de Q-C1.
- **Una fila de acceso por comparar**: comparar no es abrir (C.2.1).
- **Llevar la elección de versiones a la URL**: no aporta, y nada clínico va en la URL.
- **B1-H8 (`cargarPaciente` → 404)**: fuera del territorio; sigue en `docs/state.md` §Hallazgos.

### C.11 · Lo que el implementador lee, en este orden

1. Esta sección.
2. «Ronda B-2» (justo encima).
3. Los ficheros de la rama:
   - `editor-de-nota.tsx`: `reducir`, el bloque de efectos de foco, el aviso y `VistaVigente`;
   - `servidor.ts:350-378`;
   - `editor-de-nota.test.tsx:884-1060`.
4. `components/ui/desplegable.tsx` y `AvisoDeError` en `components/ui/piezas.tsx`.
5. `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`: no se escribe ninguna acción nueva, pero el editor sigue dependiendo del despacho en serie.

### Resumen del corte C

1. **Qué se construye:**
   - `compararTextos`: diff por palabras, Myers con presupuesto, en `lib/notas/comparar.ts`;
   - el `Comparador`: cliente, junto al historial, sin acción nueva;
   - B2-H3: el motivo de la primera versión visible se oculta en lectura conjunta;
   - B2-H1 y B2-H2: el foco ya no cae en `body` ni en «Cerrar la historia», ni al fallar una recarga ni al abrir sin versiones (por sus tres puertas).
2. **Decisión 1**: la comparación trabaja sobre lo que la apertura ya trajo bajo su acceso registrado. Cae con el candado y no abre lecturas nuevas.
3. **Decisión 2**: tres señales sin color en el marcado (subrayado o tachado, «+»/«−» visibles y `sr-only`), más una leyenda. El diff es mínimo y, cuando no puede serlo, lo dice.
4. **Decisión 3**: la descarga **no se construye**. §2.11 contradice la decisión 4 y el ADR-049, y la capa `exportaciones` que el ADR da por hecha no existe. BLOQUEO Q-C1; se recomienda un ticket propio.
5. **Para quién sería la copia**: autor o asignado, con reservadas (ADR-027), nunca en lectura conjunta (Q-C2).
6. **Territorio**: dentro del contrato, sin `supabase/` ni la base. **Delegable**: nada.
7. **Qué revisar con cuidado**:
   - que el comparador no importe acciones ni guarde segmentos fuera del estado;
   - que `noSeRecargo` excluya el conflicto (prueba `:1035`);
   - que el foco de B2-H1 se pruebe también sin botón (reconciliación);
   - que la prueba `:942` se invierta;
   - que B2-H3 se recorte en servidor.
8. **Hallazgo para `state.md`**: el ADR-049 y el ADR-032 dan por existente una capa de exportación cifrada que no está en el esquema ni en el plan.

## Decisiones del propietario sobre el corte C (02-10-2026)

| Pregunta | Respuesta | Qué cambia |
|---|---|---|
| **Q-C1** | **D-a**: ticket propio, T-040 «Capa de exportación clínica» (riesgo alto). | T-012 cierra con comparación y vista, **sin botón «Descargar»**. La tarea de la descarga del contrato pasa a T-040, con lo decidido en C.1.7 sobre el contenido. |
| **Q-C2** | **Autor y asignado, libremente. El administrador, solo por motivo legal y auditado.** | Vale para T-040. No toca el corte C. |

**Q-C2, en detalle.** El propietario empezó por «el administrador, porque los datos son de la clínica», y pidió revisar la ley antes de cerrar. Lo que dice:

- **Ley 41/2002, art. 16.4**: «El personal de administración y gestión de los centros sanitarios sólo puede acceder a los datos relacionados con sus propias funciones». La AEPD (FAQ 1636) incluye expresamente en ese grupo a **los cargos de dirección del centro**.
- **Ley 41/2002, art. 17**: el centro **custodia y conserva** la historia (17.1). Custodiar no es leer.
- **Ley 41/2002, art. 16.3 y 16.5**: el acceso judicial y el de inspección están previstos, y cada uno con sus reglas.
- **Ley 41/2002, art. 18.3**: el paciente no recibe las anotaciones subjetivas reservadas por el profesional.
- **RGPD art. 9.3** y **CP art. 199.2**: el secreto lo debe quien trata los datos por su profesión.
- **AEPD, guía para el sector sanitario**: separar la documentación clínica de la administrativa, porque el personal administrativo no necesita la historia.

Con eso, el propietario eligió la opción que cumple el art. 16.4 y mantiene la **decisión fundacional 5** («acceso de emergencia con justificación, caducidad, auditoría destacada y aviso al titular»). **No hace falta ADR nuevo**: es una concreción de la decisión 5, no un cambio.

Reglas para T-040:

1. **Autor de la nota o profesional asignado**: copia profesional completa, con reservadas (ADR-027), sin motivo. Nunca en lectura conjunta (C.1.7).
2. **Administrador**: solo eligiendo un **motivo cerrado**:
   - **petición del paciente** (derecho de acceso): proyección del paciente, **sin reservadas** (art. 18.3) y con las conjuntas parciales (ADR-030);
   - **requerimiento judicial o inspección** (art. 16.3 y 16.5): copia completa;
   - **traspaso del caso** a otro profesional: copia completa.
3. Cada copia del administrador escribe su fila en `accesos_historia` con el motivo, queda en la auditoría destacada y **avisa al profesional titular**.
4. Queda abierto para el diseño de T-040 si el motivo lleva además texto libre, y si el aviso al titular sale por `notificaciones`.

Fuentes:
- [Ley 41/2002, texto consolidado (BOE)](https://www.boe.es/buscar/act.php?id=BOE-A-2002-22188)
- [AEPD, FAQ 1636: acceso del personal administrativo a la historia clínica](https://www.aepd.es/preguntas-frecuentes/16-salud/2-profesionales-sanitarios/FAQ-1636-puede-el-personal-administrativo-del-centro-sanitario-acceder-a-la-historia-clinica)
- [AEPD, guía para profesionales del sector sanitario](https://www.aepd.es/guias/guia-profesionales-sector-sanitario.pdf)
