No hay ALTA. T-043 · revisión combinada, ronda 1: 0 ALTA, 4 MEDIA, 7 BAJA (A: 0/3/2; B: 0/1/5).

<!-- REVISOR-A -->
**Revisor A (SQL, permisos y datos): 0 ALTA, 3 MEDIA, 2 BAJA.** No hay ALTA.

# T-043 · Revisión A, ronda 1

Diff: `git diff main...worktree-agent-a84f11f89963e2cc9` (HEAD c8759df). Alcance: la migración
`20261012120000_hueco_raro.sql`, `scripts/rls/29-hueco-raro.sql`, la enmienda de `21-alta-de-cita.sql`,
`lib/citas/alta.ts` y `lib/supabase/tipos-bd.ts`.

## Cómo se midió

- Base compartida `supabase_db_Psicogestion`, con `max(version) = 20261012120000`. El contenedor se
  fijó por nombre porque hay dos stacks levantados (`cinfa-e2e`).
- Cada ejecución fue `begin; <migración de HEAD entera>; 00; 01; 29; [sondas]; rollback;`, por
  `docker exec -i … psql -v ON_ERROR_STOP=1 -f -`, el mismo mecanismo que `scripts/test-rls.mjs`.
  La migración va dentro de la transacción para que un `db reset` ajeno no cambie lo que se mide.
  Los mutantes se aplican por sustitución de texto sobre esa copia, con una comprobación de que el
  patrón aparece una sola vez. No se hizo ningún `db reset` ni se escribió en el worktree.
- El runner real (`node scripts/test-rls.mjs` desde el worktree) cae en `15-agenda`, por las fechas
  fijas ya anotadas en `state.md`. No se cuenta aquí. Con 00-28 sin 15 ni 18, `21-alta-de-cita` corre
  completo con la enmienda; la ejecución cae después, en 26.M, porque usa `C18TEC` de 18, y eso es un
  efecto de mi recorte. 29 sobre 00+01 da OK.

## Diseño §5, punto por punto

| Punto | Resultado |
|---|---|
| `diff` de cuerpos 20261005120000:850-1009 contra 20261012120000 | Solo aparecen la sexta columna, `v_tras` y `v_sig`, el bloque §1.1 dentro de `if v_cursor > v_ahora` y la frase del comentario. Ninguna otra línea cambia. Ninguna migración intermedia redefine la función (`grep -l`): la copia parte de la última versión. |
| Puerta de permisos antes que los parámetros, `security definer`, `search_path=''`, grants | Iguales. `proacl = {postgres=X/postgres,authenticated=X/postgres}`, sin `public` ni `anon`. 29.A lo fija. |
| Entradas | Las mismas cinco. La salida es un `integer` que no identifica la cita. |
| `null` en ocupado (M9), `?? null` y la guarda de entero en TS | Bien. `alta.test.ts` cubre `null`, 0, 12.5, un ocupado con número y una fila sin la columna. |
| Cita con inicio exactamente en `F_fin` | **No probado**: I la pone a las 14:10 (H3). |
| Bordes `g = d`, `g = d+1`, `g = 69`, `g = 70` | Las cuatro pruebas existen y matan M1, M2 y M3. |
| Descanso en los dos sitios | F y C matan M3. Quitarlo solo del umbral superior lo mata E1. |
| Mínimo con dos candidatas | B1 mata M5. |
| Tipos | `supabase gen types typescript --local` contra la base con la migración da un fichero idéntico a `tipos-bd.ts`. |
| Territorio en 21 | Solo cambian las l. 149-152. |
| CA6 (`grep`) | `acciones.ts` y `lib/citas/` solo tienen el mapeo de `leerBloques`. |
| `lint:migraciones` | 33 migraciones limpias. |

Mutantes del diseño, medidos: **M1 a M9 mueren**, cada uno en la aserción que nombra el diseño (M1 en
E2, M2 y M3 en C, M4 en I, M5, M8 y M9 en B1, M6 en H y M7 en J). También muere quitar el
`hueco_raro_minutos := null` (en B1).

Mutantes nuevos que **sobreviven** a 29 y que mis sondas matan (función de HEAD → mutante):

| Mutante | Sonda (martes de la misma franja, PRO1 en CA salvo indicación) | HEAD | Mutante |
|---|---|---|---|
| N1 `c.inicio >= v_tras` → `>` | X1: citas 10:00-10:20 y 10:30-11:20 | `09:00/libre/-` | `09:00/libre/40` |
| N2b `c.inicio >= v_tras` → `>= v_f_ini` | X2: citas 09:00-09:50 y 11:30-12:20 | `10:00/libre/40` | `10:00/libre/-` |
| N3 sin `c.profesional_id = p_profesional_id` | X4: solo una cita de **PRO2** en CB, 10:30-11:20 | `09:00/libre/-` | `09:00/libre/40` |
| N4 `c.inicio < v_f_fin` → `<=` | X3: cita 09:00-09:20 en CA y otra de PRO1 en CB a las **14:00** | `12:30/libre/-` | `12:30/libre/40` |
| N5 ausencia sin `desde/hasta` | X5: cita 10:30 otro día que la ausencia de H | `09:00/libre/40` | `09:00/libre/-` (también X7) |
| N6 ausencia sin el filtro de centro | X5: ausencia de PRO1 **en CB** 10:00-10:20 | `09:00/libre/40` | `09:00/libre/-` |
| N7 ausencia sin `d.perfil_id` | X5: ausencia de **PRO2** 10:00-10:20 | `09:00/libre/40` | `09:00/libre/-` |
| N10 ausencia desde `v_tras` y no desde `c+D` | X6: ausencia 09:52-09:58 (en el descanso) y cita 10:30 | `09:00/libre/-` | `09:00/libre/40` |
| N8 `ceil` → `floor` | X7: cita a las 10:30:30 | `09:00/libre/41` | `09:00/libre/40` |

## Hallazgos

### MEDIA

**H1 · `supabase/migrations/20261012120000_hueco_raro.sql:152` (banco `29-hueco-raro.sql`, sin
distractor).** Quitar el filtro `c.profesional_id = p_profesional_id` de la consulta nueva deja 29 en
verde, porque ningún día del banco tiene una cita de otro profesional dentro de la franja.
- *Escenario*: un refactor quita o tuerce ese predicado (por ejemplo, copia `= auth.uid()` o
  elimina la línea). `test:rls` sigue verde. En producción, TEC1 pide la agenda de PRO1 en CA y recibe
  `09:00/libre/40`, calculado con la cita de PRO2 en CB a las 10:30 (medido en X4 con N3).
- *Efecto*: un aviso falso, y la hora de inicio de las citas de **otro** profesional llega a quien
  solo puede ver la de PRO1. Es la única condición de la consulta nueva que separa los datos de un
  profesional de los de otro, y la función es `security definer`.
- *Arreglo*: en un día con el resultado esperado `null`, sembrar una cita de PRO2 (con P2) dentro de
  la ventana del tramo.

**H2 · `supabase/migrations/20261012120000_hueco_raro.sql:154` (banco 29, la cota inferior de la
búsqueda de S).** Ni `>= v_tras` → `> v_tras` (N1) ni `>= v_tras` → `>= v_f_ini` (N2b) hacen caer
29. El único caso con `S = T` es C, que tiene una sola cita, y ningún día tiene una cita **antes** del
tramo libre que se mide.
- *Escenario N2b*: es el caso más común de la agenda, una cita a primera hora. Con citas
  09:00-09:50 y 11:30-12:20, el tramo de las 10:00 debe dar 40 (X2). Con el mutante, `min` toma la de
  las 09:00, `v_sig > v_tras` es falso y da `null`: el aviso desaparece en cualquier día con una cita
  anterior en la franja, y el banco sigue verde.
- *Escenario N1*: con citas de duración distinta, 10:00-10:20 adyacente y 10:30-11:20, el 09:00 debe
  dar `null` porque el hueco real es el descanso. El mutante salta la adyacente y avisa de «40
  minutos» (X1).
- *Arreglo*: añadir a 29 un día con una cita antes del tramo raro y otro con una cita adyacente más
  una segunda dentro del umbral.

**H3 · `supabase/migrations/20261012120000_hueco_raro.sql:155` y `scripts/rls/29-hueco-raro.sql:282`
(la cota superior en `F_fin` exacto).** El diseño §5 dice: «Una cita con `inicio` exactamente en
`F_fin` no cuenta, porque `<` es estricto (I/M4)». Pero I pone la cita a las 14:10, así que `<` → `<=`
(N4) sobrevive. Con D = 50 y la franja en punto, el último tramo acaba en `T = 14:00`, y una cita a
las 14:00 da `g = d` también con `<=`: la prueba no puede ver el borde.
- *Escenario*: con una cita corta 09:00-09:20, los tramos se desplazan a :30. La última es 12:30, con
  `T = 13:30`. Una cita de PRO1 en CB a las 14:00 debe dar `null` (P3) y con el mutante da
  `12:30/libre/40` (X3). El aviso saltaría en el último hueco de la mañana por una cita que está fuera
  de la franja.
- *Arreglo*: llevar I, o una I2, a una cita en `F_fin` exacto con el último tramo desplazado.

### BAJA

**H4 · `supabase/migrations/20261012120000_hueco_raro.sql:159-171` (el `not exists` de la ausencia,
con una sola fijación).** H usa una única ausencia, de PRO1, sin centro, en el mismo día y en medio
del hueco. Así, cuatro de sus predicados se pueden quitar o cambiar sin que 29 caiga: la fecha (N5),
el centro (N6), el perfil (N7) y el inicio del rango en `c+D` (N10).
- *Escenario N5*: sin `desde/hasta`, `v_dia + d.hora_inicio` aplica la ausencia de las 10:00-10:20
  del día de H a **todos** los días. Todo hueco raro que cruce las 10:00 pasa a `null` (X5 y X7: 40 →
  `-`).
- *Escenario N7*: la ausencia de PRO2 apaga el aviso de PRO1, y el `null` frente a 40 delata a quien
  ve la agenda de PRO1 que PRO2 está ausente.
- Hoy es una copia literal de `v_limite2`, así que el riesgo es una deriva futura. Las sondas X5 y X6
  lo cubren con tres ausencias que no deben contar (otro centro, otro profesional, otro día) y una en
  el descanso que sí cuenta.

**H5 · `supabase/migrations/20261012120000_hueco_raro.sql:173` (`ceil` sin prueba).** El diseño
(§1.1, notas) elige `ceil` para que «una cita con segundos no convierta un hueco de 30 s en "0
minutos"», y `citas` no tiene ningún check que impida segundos. `floor` (N8) sobrevive.
- *Escenario*: con una cita a las 10:30:30, el aviso dice 40 en vez de 41 (X7).
- *Escenario con `d = 0`*: un hueco de 30 s da `0`, `leerBloques` lo descarta (`minutos > 0`) y no
  hay aviso para un hueco que el SQL ha declarado raro.
- *Arreglo*: una aserción con una cita con segundos.

## Lo que no es hallazgo

- **Exposición al técnico (P4)**: decidida por el propietario. Con la gemela de 29.G medida, el
  técnico no obtiene nada que no pudiera sondear ya con duración 5.
- **Fechas fijas de 15 y 18**: ya anotadas en `state.md`.
- **Sello y cola**: `20261012120000` es mayor que `20261011140000` (T-021, ya en `main`), y R2 quedó
  resuelto por el orden que decidió el propietario.

Las sondas X1-X7 y el guion de mutantes están en el scratchpad de esta sesión
(`mutantes43.mjs`, `29X.sql`). Las fijaciones de cada sonda están descritas en la tabla de arriba,
para que el implementador las convierta en aserciones de 29.
<!-- /REVISOR-A -->

<!-- REVISOR-B -->
# T-043 · Revisión B (interfaz, foco y pruebas) · ronda 1

Diff: `git diff main...worktree-agent-a84f11f89963e2cc9` (HEAD c8759df), centrado en
`app/(app)/agenda/nueva/` (formulario, aviso, alternativas, estado-alta y sus pruebas), `lib/i18n/es.ts`
y `docs/interfaz.md`. Los mutantes se midieron en una copia (`git archive c8759df` en el scratchpad, con
una unión de `node_modules`), con `npx vitest run formulario-alta aviso-hueco-raro alternativas-hueco
estado-alta`. Línea base: 69/69 en verde. El worktree no se tocó.

## Hallazgos

### MEDIA

**B-H1 · `app/(app)/agenda/nueva/formulario-alta.tsx:300` (y :123).** La intercepción lee la vista de
una clave de cálculo que ya no es la vigente. Si el recálculo en vuelo llega después y quita la rareza,
el aviso se desmonta con el foco dentro y el foco cae en `body`.
- **Escenario (medido, sonda S5):** se elige tipo A (50 min) y el hueco 17:00, que es raro. Se cambia
  a tipo B, y `recalcularAlta` queda en vuelo. Se pulsa Guardar antes de que vuelva: `enviar` usa
  `vista.huecosRaros` de la vista vieja, enseña el aviso y le da el foco. Cuando llega el recálculo
  (17:00 ya no es raro con 90 min), `avisoVisible` pasa a falso y la sección se desmonta.
  `document.activeElement` = `BODY` y `guardarAlta` = 0. El lector de pantalla no oye nada y el
  siguiente Tab empieza desde arriba del diálogo.
- Esto contradice §5 del diseño («El foco nunca va a `body`») y CA5. El efecto de foco diferido no
  lo recoge, porque solo actúa si alguien dejó `focoPendiente`. Guardar no espera al cálculo: `cargando`
  solo llega a las tarjetas. La ventana es la latencia de una Server Action, de cientos de ms a
  segundos con una red lenta.
- La misma causa produce B-H2.

### BAJA

**B-H2 · `app/(app)/agenda/nueva/formulario-alta.tsx:300`.** Con un recálculo en vuelo, un Guardar
rápido decide el aviso con la rareza de la duración anterior, así que puede guardar sin avisar.
- **Escenario (medido, sonda S6):** tipo A, 17:00 sin rareza. Se cambia a tipo B, con el recálculo en
  vuelo, y se pulsa Guardar. `guardarAlta` se llama una vez con `tipoTerapiaId = B`, y nunca sale un
  aviso. Con B el hueco sí era raro: la vista que llega después lo trae en `huecosRaros`.
- El caso inverso también ocurre: el aviso sale con los minutos de la duración vieja.
- No bloquea nada, pero el aviso del criterio se pierde justo cuando se cambia el tipo.
- Un arreglo común con B-H1: en `enviar`, con `calculo.clave !== claveCalculo`, no decidir con la vista
  vieja.

**B-H3 · `app/(app)/agenda/nueva/formulario-alta.tsx:312` y `:576`.** Las dos guardas contra un segundo
«Agendar igualmente» se tapan una a otra, y ninguna prueba del formulario las cubre juntas.
- El mutante declarado equivalente (quitar la guarda de `agendarIgualmente`) **es** equivalente por sí
  solo (69/69). Pero también lo es `ocupado={false}` (69/69), por la guarda anterior. Y quitando las dos
  (69/69 en verde), la sonda S1 cuenta **2 llamadas** a `guardarAlta`.
- **Escenario de S1:** Guardar, «Agendar igualmente», esperar a «Guardando…» y pulsar «Agendar
  igualmente» otra vez. En HEAD hay 1 llamada; con el mutante, 2.
- El «una vez» de CA5 se prueba con un solo clic (`formulario-alta.test.tsx:869`).
- El caso 7 de CA5 («Agendar igualmente» nunca `disabled` durante el guardado) solo existe en la prueba
  del componente, no en la del formulario.
- La bitácora (`docs/bitacora/T-043.md:19`) dice «`ocupado` ignorado … matado». Lo que se mató fue la
  guarda del componente (`aviso-hueco-raro.test.tsx`), no el cableado del formulario.

**B-H4 · `app/(app)/agenda/nueva/formulario-alta.tsx:132` y `:313-316`.** Dos ramas que añade el
ticket no tienen prueba.
- **(a) La condición «solo si el foco se perdió» del destino `'guardar'`.** El mutante
  `refGuardar.current?.focus()` sin mirar `body` sobrevive (69/69).
  - **Escenario (sonda S2):** «Agendar igualmente» devuelve un fallo genérico y el aviso sigue
    montado. En HEAD, el foco se queda en «Agendar igualmente». Con el mutante salta a Guardar, y un
    Intro ahí ya no guarda: lleva el foco de vuelta al aviso.
  - Es la guarda que justifica el desvío del diseño. Hace falta una prueba con un resultado que no
    desmonte el aviso.
- **(b) El reintento de la serie desde «Agendar igualmente»** (`falloSerie !== null` → `setSerieFallida(null)`).
  Quitarlo sobrevive (69/69).
  - **Escenario:** serie con la previsualización fallida mientras el aviso está visible. «Agendar
    igualmente» lanza `handleSubmit(guardar)` sin firma, en lugar de volver a pedir la serie, como
    hace `onSubmit`.

**B-H5 · `app/(app)/agenda/nueva/formulario-alta.tsx:572`.** Que las alternativas excluyan los huecos
raros solo se prueba en la función pura. El cableado del formulario no tiene prueba.
- El mutante `alternativasSinHueco(vista.calendario.huecos, {}, …)` sobrevive (69/69): la fixture `RARA`
  solo tiene raro el propio elegido.
- **Escenario (sonda S4):** 17:00 y 18:00 raros, se elige 17:00 y se pulsa Guardar.
  - En HEAD, la única alternativa es la de las 19:00.
  - Con el mutante se ofrece también la de las 18:00. El usuario la elige, pulsa Guardar y le sale
    otro aviso.
- La bitácora (`:19`) dice «alternativas con raros … matado». El mutante que se mató está en
  `alternativas-hueco.ts`.

**B-H6 · `app/(app)/agenda/nueva/formulario-alta.test.tsx:852`.** El caso 1 de CA5 falla por el
selector y no por «`guardarAlta` llamado», que es justo lo que §5 del diseño pide evitar («la aserción
de la llamada va primero»).
- **Escenario:** sin la intercepción (mutante M_H), el mensaje es `Unable to find role="region" and
  name "Esta cita deja un hueco corto"`. La aserción `not.toHaveBeenCalled` va después del
  `findByRole` y nunca llega a ejecutarse.
- El mutante muere igual (7 rojos). Lo que falla es el diagnóstico, no la detección.

## Lo que se pidió juzgar

- **La intercepción ocurre una sola vez, y bien.**
  - Cada Guardar sobre un hueco raro lo intercepta `enviar`. «Agendar igualmente» llama a
    `handleSubmit(guardar)` directamente, sin pasar por `enviar`, así que no se vuelve a interceptar.
  - Mueren tres mutantes:
    - sin intercepción (M_H): 7 rojos;
    - interceptar sin `return`, es decir, aviso y guardado a la vez (M_Q): 4 rojos;
    - segundo Guardar sin foco al aviso (M_I): 1 rojo.
  - La excepción es la carrera con el recálculo (B-H1, B-H2).
- **El foco.**
  - Aviso: M_N y M_P mueren.
  - Alternativa a «Hueco elegido»: M_J muere.
  - Segundo Guardar: M_I muere.
  - `hueco_ocupado` a Guardar: M_C muere.
  - Los cuatro destinos son correctos en estado estable. Falla en B-H1.
  - La línea «Hueco elegido» enfocada sale con rol `null` y nombre vacío en `dom-accessibility-api`.
    No lo cuento como hallazgo, porque NVDA y VoiceOver leen el texto de un párrafo enfocado y el
    diseño lo prescribe así. Pero CA7 debería anotar qué se oye en Chromium.
- **`disabled` y ARIA.**
  - Ningún `disabled=` en los dos ficheros (grep); solo `aria-disabled`.
  - La sección es una `region` con nombre (el título) y descripción (el texto con los minutos), con
    `tabIndex=-1`.
  - No hay `role=status`, `alert`, `aria-live` ni `dialog`.
  - La lista se etiqueta por su rótulo.
  - Los botones son `type="button"` por defecto, así que Intro dentro del aviso no envía.
  - El contraste `muted-foreground` sobre `muted` ya está en `lib/contraste/tokens.ts:51`.
- **Las alternativas no incluyen huecos raros.**
  - En la función pura, sí: M_K muere.
  - En el formulario no hay prueba (B-H5).
- **El desvío del foco de «Agendar igualmente»: correcto y necesario.**
  - La versión del diseño, que mira `document.activeElement` en el `then` (M_D), hace caer la prueba
    de `hueco_ocupado`.
  - Las actualizaciones que siguen al `await` de la Server Action van por el carril por defecto, que
    se confirma en una tarea del Scheduler. La cadena de microtareas del `then` corre antes, con el
    aviso todavía montado y el foco aún sin caer a `body`. Chromium sigue el mismo orden.
  - Dejar `focoPendiente = 'guardar'` para el efecto del commit siguiente lo resuelve, y la
    comprobación de `body` evita robar el foco cuando el aviso sigue montado. Esa comprobación no
    tiene prueba (B-H4a).
- **Los dos mutantes «equivalentes».**
  - Quitar `huecoRaroElegido !== null` de `avisoVisible` (M_A) **es equivalente**, porque el JSX
    repite la conjunción y `avisoVisible` no se usa en otro sitio. Quitar las dos (M_AB) hace caer
    «un recálculo que quita la rareza».
  - Quitar la guarda de `agendarIgualmente` (M_B) **es equivalente por sí solo**, pero forma pareja con
    el `ocupado` del formulario, y la pareja sobrevive (B-H3).

## Tabla de mutantes (copia, 69 pruebas de base)

| Mutante | Resultado |
|---|---|
| M_A `avisoVisible` sin rareza | 69/69 (equivalente) |
| M_B `agendarIgualmente` sin guarda | 69/69 (equivalente solo) |
| M_AB ambas rarezas | 1 rojo |
| M_C sin `then` | 1 rojo (hueco_ocupado) |
| M_D el `then` del diseño | 1 rojo (hueco_ocupado) |
| M_E `'guardar'` sin mirar `body` | **69/69** (B-H4a) |
| M_F sin reintento de serie | **69/69** (B-H4b) |
| M_G `elegirHueco` sin reset | 1 rojo |
| M_H sin intercepción | 7 rojos |
| M_I segundo Guardar sin foco | 1 rojo |
| M_J alternativa sin foco | 1 rojo |
| M_K pura sin filtro de raros | 1 rojo |
| M_L formulario con mapa `{}` | **69/69** (B-H5) |
| M_M `ocupado={false}` | 69/69 |
| M_BM sin ninguna guarda de ocupado | **69/69** (B-H3, S1 = 2 llamadas) |
| M_N efecto sin aviso/resumen | 2 rojos |
| M_O componente sin `if (!ocupado)` | 1 rojo |
| M_P efecto con `[]` | 3 rojos |
| M_Q intercepta sin `return` | 4 rojos |
<!-- /REVISOR-B -->
