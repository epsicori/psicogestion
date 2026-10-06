Sin hallazgos ALTA (revisor B, ronda 5: 0 ALTA, 0 MEDIA, 1 BAJA).

<!-- REVISOR-B -->
# T-043 · Revisión B (interfaz, foco y pruebas) · ronda 5

He revisado el diff de la ronda (`git diff 4b1d9eb eb81753`), con HEAD en eb81753. Toca tres ficheros:
- `formulario-alta.tsx`: `cambiarSemana` y `setAviso('')` en las dos ramas de fallo;
- su prueba: R15 y R16;
- la bitácora.

Como contexto he leído:
- `selector-hueco.tsx`: los únicos dos llamantes de `alCambiarSemana` están en `:39` y `:43`, son los botones «Semana anterior» y «Semana
  siguiente», y no hay ningún efecto que los llame;
- los textos de `lib/i18n/es.ts`.

La ronda 4 está archivada en `revision-b.ronda4.*`.

Cómo lo he medido:
- **Copia de trabajo.** Saqué una copia con `git archive eb81753` al scratchpad y le puse una junction a `node_modules`, que ya he
  deshecho. Línea base: `app/(app)/agenda/nueva/` da 228/228.
- **Mutantes.** Sustitución exacta con una sola coincidencia, respetando el CRLF y restaurando el fichero al acabar.
- **Sondas.** Pruebas temporales al final del `describe` del hueco raro. Escriben con `appendFileSync`, y un `MutationObserver` registra
  la secuencia de textos de las regiones `status`.
- **No he tocado el worktree ni la base.** Pero el worktree **no está limpio, y no por mí**. Mientras medía, `git status` en
  `agent-aceab5e51b7500771` enseñaba `M formulario-alta.tsx`, con mtime de las 19:58:24 y luego de las 19:58:44. El diff iba cambiando:
  - primero, quitar `setAviso(t('agenda.alta.semanaDelElegido'))` (M_SEM_MSG);
  - después, otra línea.

  Es otro agente que aplica mutantes sobre el worktree. Yo solo escribí en `scratchpad/rb5`, y no lo he revertido. Al terminar mi
  revisión, `git status` ya sale vacío y HEAD sigue en eb81753: el otro agente lo restauró.

## Hallazgos

### BAJA

**B5-H1 · `app/(app)/agenda/nueva/formulario-alta.tsx:161` y `:181` (con `:376` y `:381`).** El `setAviso('')` de las ramas de fallo
es incondicional. Borra cualquier texto de la región de estado, no solo el de la vuelta. En particular borra el «acaba de ocuparse»
de `hueco_ocupado`, cuyo propio `setExcluirHuecos` es lo que dispara el recálculo que falla.
- **Escenario (sonda Q1, medido en las dos ramas, `!resultado.ok` y `catch`):**
  1. Se elige tipo y el hueco del 06-10 a las 17:00, y se pulsa Guardar. `guardarAlta` responde `hueco_ocupado` con
     «Ese hueco acaba de ocuparse. Elige otro de los que quedan.».
  2. `guardar` desmarca el elegido, pone el mensaje (`:381`) y mete la clave en `excluirHuecos` (`:376`). Eso cambia `claveCalculo` y
     lanza un recálculo.
  3. El recálculo falla. Secuencia de la región:
     - primero: `"… | Ese hueco acaba de ocuparse. Elige otro de los que quedan."`;
     - después: `"… | "`.
  4. Estado final:
     - alerta: «No se han podido calcular los huecos.»;
     - resumen: «Hueco elegido: Elige un hueco libre del calendario.»;
     - ningún texto dice por qué desapareció la selección.
- **Lo que ve el usuario.** El mensaje dura lo que tarda en volver el recálculo. Para el lector de pantalla, la alerta asertiva puede
  cortar el anuncio cortés. El usuario ve que su hueco se ha desmarcado junto a un error de cálculo, y lo atribuye al error, no a que
  otro lo haya ocupado.
- **Si `hueco_ocupado` llega con `vista: null`** (la otra forma que acepta la rama, `:377`), la vista pintada no cambia y el fallo
  impide el recálculo. Las 17:00 siguen pintadas como «libre», sin texto que diga que acaban de ocuparse. El usuario la vuelve a
  elegir, Guardar guarda sin aviso (`claveVista: ''`) y el servidor responde otra vez `hueco_ocupado`. No se guarda nada indebido,
  pero hace falta una vuelta en falso.
- **Es una regresión de esta ronda.** En 4b1d9eb el texto se quedaba.
- **Por qué es BAJA.**
  - Hacen falta dos fallos seguidos: una carrera perdida y un recálculo que falla justo después.
  - La alerta y el resumen están a la vista.
  - No se guarda nada indebido.
- **Comparación con la alternativa condicional.** `setAviso((a) => (a === t('agenda.alta.semanaDelElegido') ? '' : a))` en las dos
  ramas. La he medido en la copia:
  - pasa el fichero entero, 71/71, con R15 y las dos R16 en verde;
  - con la sonda Q1, la región queda `"… | Ese hueco acaba de ocuparse. Elige otro de los que quedan."` y la alerta de fallo sigue al lado.

  Es estrictamente mejor: cierra B4-H2 igual, porque quita el texto que afirmaba algo falso, y no borra uno cierto.
- **Otros textos que podría haber en `aviso` cuando falla un recálculo.** Ninguno cambia el juicio:
  - `huecoNoCabe`: lo pone la rama `ok`. Si después falla otro recálculo, la variante incondicional lo borra y la condicional lo
    conserva. Sigue siendo cierto, porque el elegido ya se desmarcó, así que tampoco aquí se pierde nada con la condicional;
  - el mensaje de `previsualizacion_caducada`: no dispara recálculo por sí mismo.
- **Hueco de prueba.** Ninguna prueba fija el caso `hueco_ocupado` con el recálculo fallido. Hoy R16 no distingue la variante
  incondicional de la condicional, así que, si se cambia, volver a la incondicional sobreviviría. La prueba que lo fija es la sonda Q1
  como negativa, en las dos ramas:
  - `guardarAlta` → `hueco_ocupado`;
  - el 2.º `recalcularAlta` falla;
  - tras `findByText(FALLO_CALCULO)`, `avisos()` sigue conteniendo «acaba de ocuparse».

## Lo que se pidió juzgar

### 1 · El `setAviso('')` incondicional de las ramas de fallo

Sí es un hallazgo, **BAJA**: es B5-H1. El escenario que señala el implementador (`:369` en su numeración, `:381` en eb81753) existe tal
cual y lo he medido en las dos ramas. La alternativa condicional lo evita sin perder nada de lo que pide B4-H2.

### 2 · ¿`cambiarSemana` borra algún texto que debiera quedarse?

He medido el caso de `hueco_ocupado` al navegar (sonda Q2):
- antes de navegar, la región dice `"… | Ese hueco acaba de ocuparse. Elige otro de los que quedan."`;
- tras pulsar «Semana siguiente», dice `"… | "`.

**No lo cuento como hallazgo.**
- Navegar es justo el gesto que el mensaje pide («Elige otro de los que quedan»).
- El texto ya se anunció al aparecer.
- Vaciar la región no anuncia nada ni afirma nada falso.
- Es lo mismo que ya hace `elegirHueco` (`:238`) con cualquier gesto de elección.

Lo mismo vale para:
- `previsualizacion_caducada`: el mensaje ya sonó, y si luego se navega, Guardar rebota con su propio texto;
- `huecoNoCabe`: el elegido ya está desmarcado y el resumen lo dice.

`cambiarSemana` no tiene más puertas:
- `volverAlElegido` llama a `setFoco` directamente (`:263`);
- `elegirHueco` ya vaciaba `aviso` antes (`:238-239`);
- `SelectorHueco` solo la llama desde los dos botones.

## B4-H1 y B4-H2: ¿cerrados?

| Id | Estado | Comprobación |
|---|---|---|
| B4-H1 | **Cerrado.** | `cambiarSemana` vacía `aviso` en un commit propio (el clic de navegación), y el segundo rebote lo vuelve a llenar en otro. La región pasa de `''` al texto, así que cambia y se anuncia. R15 (2) comprueba el vacío tras navegar y R15 (4) el texto tras el segundo Guardar. M_NAV (quitar `setAviso('')` de `cambiarSemana`) cae en R15 `:1445` (medido; `:1447` en mi copia, desplazada 2 líneas por la cabecera de las sondas). |
| B4-H2 | **Cerrado**, con la regresión de B5-H1. | Tras el fallo de la vuelta, la región ya no dice «El calendario vuelve…». M_FA_A cae en R16 `!resultado.ok` y M_FA_C en R16 `catch`, los dos en `:1477` (medido). R16 comprueba además `toHaveBeenCalledTimes(3)` y `guardarAlta` = 0. |

Sobre las pruebas nuevas:
- **R15 no es verde por el motivo equivocado.**
  - (2) es una aserción síncrona tras `waitFor(guardarActivo)`, en un commit distinto del del segundo clic, así que el «paso por vacío»
    es observable y no queda absorbido en un lote.
  - La espera del segundo clic tiene tres salidas (`guardarAlta` llamado, aviso montado o 5.ª llamada). (3), (4) y (5) descartan las
    dos primeras.
  - El `resolver5` pendiente se resuelve dentro de `act` al final, así que no deja ninguna promesa a la prueba siguiente.
- **R16 consume exactamente sus 3 respuestas** y parte de `respuestasDeRecalculo()`.

## Notas sin hallazgo

- La bitácora dice «Pasaría lo mismo si lo vaciase» sobre `volverAlElegido`. Es cierto: `volverAlElegido()` y `setAviso(texto)` van en
  el mismo manejador, y gana el último. Pero el caso no existe en el código, y no cambia nada.
