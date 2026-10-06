Sin hallazgos ALTA (revisor B, ronda 2: 0 ALTA, 1 MEDIA, 3 BAJA).

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
