No hay ALTA. T-043 · revisión combinada, ronda 2: 0 ALTA, 1 MEDIA, 5 BAJA (A: 0/0/2; B: 0/1/3).

<!-- REVISOR-A -->
**Revisor A, ronda 2 (SQL: migración y banco 29): 0 ALTA, 0 MEDIA, 2 BAJA.** No hay ALTA.

# T-043 · Revisión A, ronda 2

Diff de la ronda: `git diff c8759df f2670dc`. Diff del conjunto: `git diff main...f2670dc`. Worktree
`agent-aa8091620e0e92d48`, HEAD f2670dc. La migración `20261012120000_hueco_raro.sql` no cambia en la ronda
(`git diff --quiet c8759df f2670dc -- supabase/migrations`). En SQL solo cambia `scripts/rls/29-hueco-raro.sql`.
La revisión de la ronda 1 está archivada en `revision-a.ronda1.md` y `revision-a.ronda1.json`.

## Cómo se midió

- Base `supabase_db_Psicogestion`, con `max(version) = 20261012120000`. El contenedor se fijó por nombre
  porque también está levantado `supabase_db_cinfa-e2e`. Cada ejecución fue `begin; <migración de HEAD,
  mutada o no>; 00; 01; 29; [sondas]; rollback;` por `docker exec -i … psql -v ON_ERROR_STOP=1 -f -`.
  Cada mutante es una sustitución de texto sobre la copia, con una comprobación de que el patrón aparece
  una sola vez. Al terminar, `max(version)` sigue igual y no queda ninguna cita `a2900004…`. No escribí
  nada en el worktree.
- **Convivencia con 00-28**: `begin; migración; 00 … 14, 15*, 16 … 28, 29; rollback;` en orden alfabético.
  `15*` es el 15 con sus literales desplazados nueve semanas (`2026-10-06/07/08` → `2026-12-08/09/10`,
  el mismo día de la semana). Resultado: **`29-hueco-raro: OK`** tras los 28 módulos anteriores, con 16,
  21, 23 y 26 dentro, que son los que siembran agenda de PRO1.
- El orden del diseño R2.3.2 (15 al final y sin tocar) **no llega al 29**. Cae en
  `18-agenda-rango`, «R1 GEMELA: el administrador sí ve citas del centro B en el rango», porque 18 usa
  citas que siembra 15. El diseño ya prevé este caso como plan B, y es lo que medí arriba. No es un
  hallazgo del código, pero el verificador debe saber que el plan A no le servirá.

## Diseño R2.5, punto por punto (parte SQL)

| Punto | Resultado |
|---|---|
| Ancla | `anio_29 = año + 10` (l. 35). La franja llega a `lunes_29 + 140` (l. 66). El `\gset` define `l077`, `l084`, `l091`, `l098`, `l105`, `l106`, `l112`, `l119`, `l126` y `l133`. La cabecera (l. 6-12) ya no dice «21 usa año + 3», remite a R2.0 y la l. 6 termina en «P1, P2)». |
| Alcance de 00-28 | Repetí los greps de R2.0 y añadí `interval 'N years/months'`, `make_date` y `date_trunc('year')`. Las únicas anclas de año son 16 (+1), 21 (+3), 23 (+4) y 29 (+10). El mayor desplazamiento es `current_date + 1502` (26). El literal más alto es `'2033-06-30'` (26, bonos). Las filas de `disponibilidad` de 16, 21 y 23 llevan `hasta`. La ejecución alfabética completa da OK en 29. |
| Arrays completos | Las nueve K comparan con `pg_temp.dia29(...) = array[...]`, sin `like` ni `@>`. `pg_temp.assert` usa `is distinct from true`, así que un `null` (día sin filas) también falla. |
| K1 | Se llama como **TEC1**. La única cita es de PRO2 con P2 en CB (l. 325). |
| K4 | La cita de las 14:00 es de PRO1 **en CB** (l. 370). |
| K5 | La ausencia está en `l106`, el martes. |
| K8 | La ausencia es 09:52-09:58 y el 09:00 sale `libre`, así que no toca `[09:00, 09:50)`. |
| K9 | La cita es `10:30:20`, y el array trae `11:30:20` y `12:30:20`. |
| Ids | `cita29(12…23)`, consecutivos y sin repetir los de B-J (1-11). |
| Anotación final | M1-M9 y N1-N10, con la sección de caída correcta. |

## Mutantes, medidos (aislados, `00 + 01 + 29`)

| Mutante | Cae en | | Mutante | Cae en |
|---|---|---|---|---|
| M1 | E2 | | N1 | K3 |
| M2 | C | | N2b | K2 |
| M3 | C | | N3 | K1 |
| M4 | I | | N4 | K4 |
| M5 | B1 | | N5 | K5 |
| M6 (`where false and d.perfil_id…`) | H | | N6 | K6 |
| M7 | J | | N7 | K7 |
| M8 | B1 | | N8 `floor` | K9 |
| M9 | B1 | | N8 `round` | K9 |
| quitar `hueco_raro_minutos := null` | B1 | | N8 `trunc` | K9 |
| | | | N8 sin `ceil` (cast `::integer`) | K9 |
| | | | N10 | K8 |

M1-M9 siguen cayendo en la sección de la ronda 1, y cada N cae en la primera K que lo nombra, con el
mensaje del `assert` de esa K.

## Hallazgos de la ronda 1

| Id | Estado | Cómo se cerró |
|---|---|---|
| H1 · sin distractor de otro profesional | **Cerrado** | K1 (como TEC1, con una cita de PRO2 en CB). N3 cae en K1. |
| H2 · cota inferior de S | **Cerrado** | K2 mata N2b y K3 mata N1. |
| H3 · cita en `F_fin` exacto | **Cerrado** | K4, con el último tramo desplazado a 12:30. N4 cae en K4, e I sigue matando M4. |
| H4 · `not exists` de la ausencia (fecha, centro, perfil, inicio del rango) | **Cerrado** para los cuatro predicados nombrados | K5-K8. Ver H2 de esta ronda para los que no nombré. |
| H5 · `ceil` | **Cerrado** | K9. También caen `round`, `trunc` y el cast sin `ceil`. |

## Hallazgos nuevos

Los dos son de la misma familia que H4 de la ronda 1, y los dos estaban ya en c8759df. Son huecos de mi
revisión de la ronda 1, que solo enumeró cuatro predicados, no de esta ronda. Los dos son BAJA por la misma
razón que H4: HEAD es correcto, y la lista copiada es literalmente la de `v_limite` (l. 117) y la de
`v_limite2` (l. 126-130), así que el riesgo es que una de las copias derive en un refactor futuro.

### BAJA

**H1 · `supabase/migrations/20261012120000_hueco_raro.sql:153` (`c.estado in ('programada', 'confirmada',
'realizada')`, probado con un solo valor).** Todas las citas de 29 nacen `programada`, y la única que
cambia de estado pasa a `cancelada` (J). Por eso `in ('programada', 'confirmada', 'realizada')` →
`in ('programada')` deja 29 en verde (medido: `29-hueco-raro: OK`).
- *Escenario (sonda Y1)*: una cita de PRO1 a las 10:30 que el paciente ha **confirmado**
  (`programada → confirmada`, la transición normal de `lib/agenda/estados-cita.ts:43`). HEAD da
  `09:00:00/libre/40`. El mutante da `09:00:00/libre/-`, así que el aviso desaparece en cuanto la cita
  siguiente se confirma, y `test:rls` sigue verde.
- *Arreglo*: una K10 igual que G o K5, con la cita de las 10:30 pasada a `confirmada`, que espere 40.

**H2 · `supabase/migrations/20261012120000_hueco_raro.sql:162` y `:166` (el `not exists` de la ausencia:
festivo parcial y ausencia abierta).** H y K5-K8 solo siembran filas `tipo = 'ausencia'` con `hasta`. Por eso
sobreviven `d.tipo in ('festivo', 'ausencia')` → `in ('ausencia')` y `(d.hasta is null or d.hasta >= v_dia)`
→ `d.hasta >= v_dia`. Los dos dan `29-hueco-raro: OK`. El esquema admite las dos filas
(`disponibilidad_forma_ck` solo exige `desde`), y el comentario de la l. 113 nombra los «festivos
parciales».
- *Escenario Y2*: un festivo parcial de PRO1 de 10:00 a 10:20 (`centro_id null`) y una cita a las 10:30.
  HEAD da `09:00:00/libre/-`, porque el hueco lo corta el festivo, como en H. Sin `'festivo'`, da
  `09:00:00/libre/40`: el aviso dice «40 minutos» por un hueco que no existe. La gemela sin festivo
  (Y4) da 40 en HEAD.
- *Escenario Y3*: una ausencia de PRO1 de 10:00 a 10:20 con `desde` = el día y `hasta null` (recurrente
  sin fin), y una cita a las 10:30. HEAD da `-` y el mutante, 40.
- *Arreglo*: dos K más, como H: una con `tipo = 'festivo'` y otra con `hasta = null`. Si van al final y la
  abierta no cruza ningún lunes posterior del banco, no mueven nada.

## Lo que no es hallazgo

- **Fixtures del banco en la base** (bitácora, l. 47): según la bitácora, la base del implementador tenía
  los fixtures de 01 confirmados y por eso ejecutó «00 + `\set` de 01 + 29». Hoy la base no tiene usuarios
  `%rls.test`, y 01 corre entero dentro del rollback. Mi tabla de mutantes está medida con 01 completo y
  coincide con la de la bitácora en todos los N. Que el verificador no copie ese método.
- **Encabezado de K2**: dice «sin `c.inicio >= v_f_ini`», cuando N2b *sustituye* la cota por
  `>= v_f_ini`. La anotación final lo dice bien. Es cosmético y no tiene escenario de fallo.
- **Cambio de hora en año + 10**: la cita y la franja están en hora local de `Europe/Madrid`. En 2036 el
  cambio cae el 30 de marzo, entre `l049` y `l056`, y G y H dan sus arrays.

Sondas y guion en el scratchpad de esta sesión: `mut43r2.mjs` (mutantes M, N y X), `29Y.sql` (Y1-Y4) y
`15-desplazado.sql`.
<!-- /REVISOR-A -->

<!-- REVISOR-B -->
# T-043 · Revisión B (interfaz, foco y pruebas) · ronda 2

Diff de la ronda: `git diff c8759df f2670dc` en la rama `T-043-aviso-de-hueco-raro`. Lo revisado:
`app/(app)/agenda/nueva/formulario-alta.tsx`, su prueba, `docs/interfaz.md` y `docs/bitacora/T-043.md`.
La ronda 1 está archivada en `revision-b.ronda1.md` y `.json`.

Cómo se midió: en una copia, sacada con `git archive f2670dc` al scratchpad y con una unión de
`node_modules`, se ejecutó `npx vitest run formulario-alta aviso-hueco-raro alternativas-hueco estado-alta`.
La línea base da 75/75 en verde. Los mutantes se aplicaron uno a uno con un guion (`scratchpad/mut-rb2.js`):
sustitución exacta, comprobando una sola coincidencia y con CRLF, y restaurando después. El worktree no se
tocó. Al acabar, los dos ficheros de la copia coinciden con HEAD.

## Hallazgos

### MEDIA

**B2-H1 · `app/(app)/agenda/nueva/formulario-alta.tsx:123` (y `:573`).** El aviso sigue montado mientras se
recalcula. Si la vista nueva quita la rareza con el foco dentro del aviso, el foco cae en `body`. El diseño
dejó fuera el efecto genérico porque daba por hecho que el desmontaje siempre lo provoca un control de fuera
del aviso que conserva el foco. Esa premisa es falsa: el usuario puede entrar en el aviso mientras el
recálculo está en vuelo.
- **Escenario (medido, sonda S7):**
  1. Tipo A y hueco de las 17:00, que es raro. Se pulsa Guardar y sale el aviso.
  2. Se cambia a tipo B. `recalcularAlta` queda en vuelo.
  3. Se vuelve al aviso y se pulsa «Agendar igualmente». Ahora lleva `aria-disabled="true"` y no hace nada:
     `guardarAlta` = 0 y el foco sigue en el botón.
  4. Llega la vista: con 90 minutos, las 17:00 ya no son raras. `avisoVisible` pasa a falso y la sección se
     desmonta. `document.activeElement` = `BODY`.
- Es el mismo efecto que B-H1 de la ronda 1, por otra puerta. Contradice §5 («el foco nunca va a `body`»)
  y CA5.
- Ya pasaba en c8759df, con solo poner el foco en el aviso. La ronda 2 deja ese botón como una espera
  silenciosa justo durante esa ventana, y eso hace más fácil quedarse dentro.
- Lo cubriría el efecto que el diseño descartó («si el aviso se desmonta con el foco dentro, foco a
  Guardar») o un `focoPendiente = 'guardar'` cuando un recálculo retira el aviso con el foco dentro.

### BAJA

**B2-H2 · `formulario-alta.tsx:152-155` y `:171-174` (junto con `:376-377`).** Un recálculo que falla marca
la clave como vigente pero deja la vista anterior. Por eso Guardar vuelve a decidir con la rareza de la
duración anterior: B-H2 entra por la puerta del fallo.
- **Escenario (medido, sonda S8):**
  1. Tipo A y 17:00, que no es raro.
  2. Se cambia a tipo B y `recalcularAlta` devuelve `{ ok: false }`. Sale la alerta «No se pudieron
     calcular los huecos.» y Guardar vuelve a estar activo.
  3. Se pulsa Guardar: `guardarAlta` se llama una vez con `tipoTerapiaId = B` y sin aviso. La vista que
     llegaría con B trae las 17:00 como raras (40 min).
- El caso inverso también ocurre: si la vista vieja tenía raro el hueco, sale el aviso con los minutos de la
  duración anterior.
- El diseño (R2.5) pidió de forma explícita no bloquear Guardar tras un fallo. Esto no lo contradice: la
  queja es que sí se decide con la vista vieja.
- Con esta puerta abierta, dos frases quedan falsas:
  - el comentario de `:376`, «nada decide con ellos»;
  - `docs/interfaz.md:491`, «no decide con los huecos de antes».
- Arreglo mínimo: guardar aparte la clave de la vista pintada y, en `enviar`, no interceptar (o no avisar)
  cuando la vista no es de la clave vigente.

**B2-H3 · `formulario-alta.tsx:154` y `:173`.** Sacar el formulario de «recalculando» tras un fallo no tiene
prueba. Desde esta ronda, esas dos líneas son lo único que impide que Guardar se quede bloqueado.
- Mutantes medidos:
  - M_FA: quitar `setCalculo(… clave: claveCalculo)` en la rama `!resultado.ok`. **75/75**.
  - M_FC: lo mismo en el `catch`. **75/75**.
- **Escenario con cualquiera de los dos:** se cambia el tipo y el recálculo falla. `recalculando` se queda
  en `true` para siempre, porque el efecto no vuelve a correr sin otro cambio de clave. Guardar se queda con
  `aria-disabled`, y cada clic e Intro se cortan en `onSubmit` sin decir nada. El usuario solo ve la alerta
  del cálculo y no sabe que tiene que cambiar algo para poder guardar.
- R2.5 pedía «comprobar que sigue así». Con una prueba en el estilo de S8 (fallo y después Guardar activo)
  morirían los dos mutantes.

**B2-H4 · `formulario-alta.tsx:312` y `:580`.** La puerta lateral que R2.5 nombra, «Agendar igualmente» con
el aviso visible y un recálculo en vuelo, no tiene prueba.
- Mutante M_R_aviso: `recalculando` fuera de la guarda de `agendarIgualmente` y de `ocupado`, dejando
  `onSubmit` y `aria-disabled` con `bloqueado`. **75/75**.
- **Escenario con ese mutante (sonda S7):** con el recálculo de tipo B en vuelo, «Agendar igualmente» guarda
  (`guardarAlta` = 1, `tipoTerapiaId = B`). El usuario acepta un aviso de «30 minutos» que era de la duración
  de A.
- R1 y R2 solo cubren Guardar. Matan M_R (quitar `recalculando` de `bloqueado`), M_R_submit y M_R_aria, pero
  no esta puerta.

## Lo que se pidió comprobar

- **`bloqueado` va después de `catalogoVacio`** (`:375` → `:377-379`) y gobierna los cuatro sitios:
  - `agendarIgualmente` (`:312`);
  - `onSubmit` (`:387`);
  - `ocupado` (`:580`);
  - `aria-disabled` de Guardar (`:591`).
  
  Un grep confirma que no queda ninguna conjunción vieja. `enviar` no cambia (`:299` conserva su
  `if (esperandoSerie) return`). `cargando={recalculando}`. Ningún `disabled=`, solo `aria-disabled`.
- **R1 y R2 caen contra el formulario de c8759df**, con la prueba de HEAD (2 rojos de 57):
  - R1 cae en (1), `:997`: `expected <section tabindex="-1" …> to be null`.
  - R2 cae en su primera aserción, `:1036`: `expected "vi.fn()" to not be called at all, but actually been
    called 1 times`.
  - Con (1) y (3) de R1 neutralizadas, R1 cae en (4), `:1005`, con `<body>`. Es la sonda S5 de la ronda 1.
- **La `:256` reescrita** sigue matando el mutante que quita `if (!vigente) return;` tras `recalcularAlta`
  (M_V). Cae en `:288` con `Received: "Sin huecos libres… | Con esta duración el hueco elegido ya no cabe."`:
  la respuesta vieja pisa el «acaba de ocuparse», que es el motivo correcto. La carrera que protegía sigue
  medida.
- **R3-R7 matan sus mutantes** en la aserción que dice el diseño:

  | Mutante | Resultado |
  |---|---|
  | M_M `ocupado={false}` | R3 (1), `:1059`, `expected 'false' to be 'true'` (aria-disabled) |
  | M_BM sin guarda y `ocupado={false}` | R3 (1), `:1059`; con (1) neutralizada, R3 (2), `:1064`, `called 1 times, but got 2 times` |
  | M_B solo la guarda de la función | 75/75: equivalente, como declara la bitácora |
  | M_E foco a Guardar sin mirar `body` | R4 (2), `:1090`, Guardar enfocado en vez de «Agendar igualmente» |
  | M_F sin reintento de serie | R5, `:1116`, `called 3 times, but got 2 times` |
  | M_L formulario con mapa `{}` | R6 (1), `:1134`, `length of 1 but got 2` (cae también la prueba de `hueco_ocupado`) |
  | M_H sin intercepción | 12 rojos; R7 cae en `:863` con `expected "vi.fn()" to not be called at all`, no por el selector |
  | M_R sin `recalculando` en `bloqueado` | R1 (1) y R2 |
  | M_R_submit (solo `onSubmit` sin `recalculando`) | R1 (1) y R2 |
  | M_R_aria (solo `aria-disabled`) | R1 (3), `:999` |
  | M_R_aviso (guarda de la función y `ocupado`) | **75/75** (B2-H4) |
  | M_V sin `if (!vigente) return;` | `:256` reescrita, `:288` |
  | M_FA / M_FC sin la salida del fallo | **75/75** (B2-H3) |

- **Estado de B-H1..B-H6 de la ronda 1:**
  - **B-H1:** cerrado por su puerta (Guardar con el recálculo en vuelo), con R1. Sigue abierto por otra
    (B2-H1).
  - **B-H2:** cerrado con el recálculo en vuelo, con R2. Sigue abierto por el fallo (B2-H2).
  - **B-H3:** cerrado (R3; M_B declarado equivalente con su porqué).
  - **B-H4a y B-H4b:** cerrados (R4 y R5).
  - **B-H5:** cerrado (R6).
  - **B-H6:** cerrado (R7).
  - La bitácora ya no dice que el formulario «mata» lo que mataba otro fichero, y su tabla de mutantes
    coincide con lo medido.
- **El foco no cae a `body`:**
  - Con Guardar, sí se cumple (R1 (4)).
  - Al elegir una alternativa vieja durante el recálculo (sonda S9), el foco va a «Hueco elegido», que
    siempre está montado. Si después la vista dice que no cabe, el foco se queda allí.
  - Falla con el foco dentro del aviso (B2-H1).
- **H27** (`:799`) no se tocó.

## Notas sin hallazgo

- `docs/interfaz.md:491` no recoge la frase de R2.1.3 entera: nombra Guardar, pero no «Agendar
  igualmente».
- El comentario de la prop `ocupado` en `aviso-hueco-raro.tsx:14` (fuera del diff) sigue diciendo
  «Guardando, catálogo vacío o serie en vuelo», sin el recálculo.
- Ninguna de las dos tiene un escenario de fallo.
<!-- /REVISOR-B -->
