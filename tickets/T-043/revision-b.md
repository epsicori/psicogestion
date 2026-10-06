Sin hallazgos ALTA (revisor B, ronda 4: 0 ALTA, 1 MEDIA, 1 BAJA).

<!-- REVISOR-B -->
# T-043 · Revisión B (interfaz, foco y pruebas) · ronda 4

He revisado el diff de la ronda (`git diff 0c2c87e 4b1d9eb`) dentro del contexto de `git diff main...T-043-aviso-de-hueco-raro`,
con HEAD en 4b1d9eb. Ficheros que he leído:
- `formulario-alta.tsx` y su prueba;
- `estado-alta.ts` y `vista-alta.ts`, como contexto (`lunesDe`, `desde`, `anterior` y `siguiente`);
- `lib/i18n/es.ts`, `docs/interfaz.md`, `scripts/rls/README.md` y la bitácora.

La ronda 3 está archivada en `revision-b.ronda3.*`.

Cómo lo he medido:
- **Copia de trabajo.** Saqué una copia con `git archive 4b1d9eb` al scratchpad y le puse una junction a `node_modules`.
  Línea base: `app/(app)/agenda/nueva/` da 225/225 en verde.
- **Mutantes.** Los apliqué uno a uno con `scratchpad/rb4/mut.js`: sustitución exacta, con una sola coincidencia, respetando el fin de
  línea de la copia y restaurando el fichero al acabar.
- **Sondas.** Son pruebas temporales que añadí al final del `describe` en la copia y que luego borré.
- **Contra 0c2c87e.** Puse el `.tsx` de 0c2c87e en la copia con las pruebas de HEAD.
- **El worktree no se ha tocado.** `git status` sale vacío y HEAD sigue en 4b1d9eb.

## Hallazgos

### MEDIA

**B4-H1 · `app/(app)/agenda/nueva/formulario-alta.tsx:311` (con `:496` y `:570-572`).** El segundo rebote pone en la región de
estado el mismo texto, que nadie ha borrado entre medias. React no toca el DOM, la región no cambia y el lector de pantalla no
anuncia nada. Eso es justo lo que D-R4.3 dice evitar.
- **Por qué pasa.** `aviso` solo se vacía en `elegirHueco` y en `guardar`. Navegar de semana (`alCambiarSemana={setFoco}`) no
  lo toca.
- **Escenario (sonda P1, medido):**
  1. Se elige el hueco raro del 06-10 a las 17:00 y se pulsa «Semana siguiente». Al pulsar Guardar, el calendario vuelve al 05-10
     y la región dice «El calendario vuelve a la semana del hueco elegido. Pulsa Guardar otra vez.». Aquí el anuncio sí suena.
  2. El usuario vuelve a pulsar «Semana siguiente» para comparar. La región **sigue diciendo** «El calendario vuelve…», aunque
     ahora pinta la semana del 12-10.
  3. Pulsa Guardar. Otra vez se llama a `recalcularAlta` con `fechaFoco: '2026-10-05'`, el calendario salta y `guardarAlta` = 0.
  4. Un `MutationObserver` sobre la región, con `childList`, `characterData` y `subtree`, registra **0 mutaciones**. Para un
     lector de pantalla, Guardar no ha hecho nada audible y el calendario ha cambiado de semana en silencio.
- **Qué no se cumple.** La frase nueva de `docs/interfaz.md:497-499` («…y lo dice en la región de estado») y el CA7 manual
  («se anuncia el texto») solo se cumplen en el primer rebote.
- **R11 no lo ve.** Hace un solo rebote y parte de la región vacía.
- **Arreglo posible.** Vaciar `aviso` al cambiar de semana, envolviendo `setFoco` en `alCambiarSemana`. Con eso:
  - el texto viejo deja de quedarse en otra semana;
  - el segundo rebote pasa de `''` al texto, y la región sí cambia.

  La prueba que lo fija es R11 con una segunda navegación y un segundo clic, comprobando que la región cambia: que pasa por `''`
  o que se observa una mutación.

### BAJA

**B4-H2 · `app/(app)/agenda/nueva/formulario-alta.tsx:159` y `:178` (con `:311`).** Si falla el recálculo de la vuelta, las
ramas de fallo no tocan `aviso`. La región sigue diciendo que el calendario ha vuelto a la semana del elegido, y no ha vuelto.
- **Escenario (sonda P3, medido; es el camino de R12):**
  1. Se elige el hueco raro del 06-10 a las 17:00, se pulsa «Semana siguiente» y luego Guardar. El recálculo de la semana del
     05-10 falla.
  2. Las regiones de estado dicen «… | El calendario vuelve a la semana del hueco elegido. Pulsa Guardar otra vez.».
  3. El calendario pintado sigue siendo la semana del 12-10 («lun 12, sin huecos libres», «mar 13, un hueco libre»). Ningún botón
     de 17:00 está pintado.
  4. El usuario sigue la instrucción y pulsa Guardar otra vez. Se guarda sin aviso el hueco del 06-10 a las 17:00 (R12, D-R3.3),
     y lo hace tras un texto que afirma que el calendario volvió a esa semana para comprobarla.
- **Por qué es BAJA.** La alerta «No se han podido calcular los huecos.» está a la vista y avisa de que algo falló. Pero la
  región de estado afirma un hecho falso. Además, la frase nueva de `interfaz.md` («Guardar vuelve primero a la del hueco
  elegido y lo dice») no contempla que la vuelta falle.
- **Arreglo posible.** Que las dos ramas de fallo vacíen `aviso` (o lo sustituyan) cuando es el de la vuelta. Otra opción es
  añadir a la frase de `interfaz.md` lo que pasa si falla. R12 podría comprobar que el texto «vuelve…» ya no está tras
  `findByText(FALLO_CALCULO)`.

## Lo que se pidió juzgar

### 1 · M_VV3 sobrevive: es equivalente, no un hueco

- **Por qué es equivalente.** Tras R4, las cinco escrituras de `calculo` (`:116-119`, `:160`, `:164`, `:179` y `:367`) mantienen
  este invariante: **`claveVista` vale `clave` o `''`**.
  - El estado inicial y la rama `ok` ponen las dos claves.
  - Los dos fallos ponen `''`.
  - `hueco_ocupado` conserva las dos.

  Como `claveCalculo` es un `join('|')` de seis campos y nunca vale `''`, `claveVista === claveCalculo` implica
  `clave === claveCalculo`, es decir, `!recalculando`. El `!recalculando` de `:126` queda como cinturón redundante.
- **El escenario que declara el implementador no existe tal cual.** Era: bueno para K, cambio a K2 en vuelo y vuelta a K con
  otro recálculo en vuelo. Lo medí con la sonda P2:
  - Al volver a K con K2 en vuelo, `calculo.clave` sigue siendo K, así que `recalculando` = false y el efecto sale en `:145` sin
    pedir nada. Se hacen 2 llamadas en total, y Guardar pasa de `aria-disabled=true` a `false` nada más volver.
  - La limpieza del efecto marca K2 como no vigente, y su respuesta tardía (`SIN_RARA`) se descarta.
  - Guardar enseña el aviso de la vista de K.

  No hay ningún recálculo en vuelo, y la vista de K vale para K. Ningún usuario puede observar la diferencia.
- **Medición.** M_VV3 sobrevive en 3 ejecuciones seguidas (65/65).
- **Nota sobre la bitácora.** La fila «M_VV3 sobrevive» no la clasifica como equivalente, y las otras filas de supervivientes sí
  dicen «equivalentes». No hay escenario de fallo, así que no va como hallazgo.

### 2 · R12 y M_SEM caen en otra línea: está bien

| Mutante | Diseño | Medido | Juicio |
|---|---|---|---|
| M_SEM | R11 (1); R12 (2) | R11 `:1318`; R12 `:1345` (`findByText`) | Correcto. Sin el bloque, el primer clic ya guarda (SEMANA_SIGUIENTE no tiene rarezas), no hay 3.ª llamada y el fallo nunca sale. Cae antes, y por el motivo que la prueba protege. |
| M_SEM_SIGUE | R11 (1) | R11 `:1318`; R12 `:1353` (`toHaveBeenCalledTimes(1)` da 2) | Correcto. |
| M_SEM_MSG | R11 (2) | R11 `:1319` | Correcto. |
| M_SEM_CAL | R12 (2) | R12 `:1351` (la espera R7 se agota) | Correcto. El segundo clic vuelve a rebotar porque la vista pintada sigue siendo la del 12-10. |
| M_SEM_VA (mío: el bloque sin `volverAlElegido()`) | — | R11 `:1316`; R12 `:1345` | Lo cubren R11 y R12. |
| M_FV_A / M_FV_C | R13 (2) / R14 (1) | `:1382` / `:1413` | Correcto. Cada rama tiene su prueba. |

Contra el `.tsx` de 0c2c87e caen R11 `:1318`, R12 `:1345`, R13 `:1382` y R14 `:1413`: 4 fallos de 65, como dice la bitácora.

### 3 · `respuestasDeRecalculo()` es correcta

- **Lo que dice el comentario es cierto.** En `@vitest/spy` 4.1.11, `mockClear` (que es lo que hace `clearAllMocks` en el
  `beforeEach` de `:78`) solo vacía `calls`, `results` y demás. `mockReset` es lo único que pone `onceMockImplementations = []`.
- **Repone el mismo valor por defecto que el `beforeEach`** (`VISTA`), así que una llamada de más recibe lo mismo que en
  cualquier otra prueba.
- **Alcance.** Solo protege a R11-R14. Las cadenas `*Once` de R8-R10, que no la usan, seguirían filtrándose a la prueba
  siguiente si una de ellas cayera. Eso solo pasa con una prueba ya roja, así que no hay escenario sobre una prueba verde y no va
  como hallazgo.
- **R11-R14 no dejan colas sin consumir cuando pasan.** Cada una gasta exactamente las 3 respuestas que encola.

## «Qué revisar» de R4.4, punto por punto

| Punto | Resultado |
|---|---|
| El bloque de R4.1.1 va después de `esperandoSerie` y antes de la intercepción, y compara con `foco` | Sí, en `:305`, `:309-313` y `:314`. `foco` y `lunesDe(...)` son siempre lunes: `desde = lunesDe(fechaFoco)` (`vista-alta.ts:93`), y `anterior`/`siguiente` llegan por `alCambiarSemana`. El bloque no puede rebotar sin fin: tras `volverAlElegido()`, `foco` es el lunes del elegido, y nada lo vuelve a mover salvo el usuario. |
| Las dos ramas de fallo ponen `claveVista: ''`; `ok` pone las dos claves; `hueco_ocupado` conserva el spread; ningún fallo pone `claveVista = claveCalculo` | Sí: `:160`, `:179`, `:164` y `:367`. |
| R14 (1) y (2) son síncronas tras `waitFor(guardarActivo)`; R13 usa `ok:false` y R14 rechazos | Sí. La espera de R14 exige además 3 llamadas, así que solo pasa cuando el 3.er rechazo ya se ha procesado (Guardar sale de `recalculando`). |
| Ni efecto nuevo, ni `focoPendiente`, ni servidor; en el README solo la celda; en `interfaz.md` solo la frase | Sí. `git diff 0c2c87e --stat` no toca `estado-alta.ts`, `acciones.ts` ni `lib/` salvo `es.ts`. |

## B3-H1, B3-H2 y A3-H1: ¿cerrados?

| Id | Estado | Comprobación |
|---|---|---|
| B3-H1 | **Cerrado.** Ya no se guarda un hueco raro sin aviso tras navegar. | La rareza solo se lee con `vistaVigente`, y eso exige que la vista sea de `claveCalculo`, que incluye `foco`. Con el bloque nuevo, `foco` es la semana del elegido, y la lectura de esa semana trae su clave en `huecosRaros`. R11 (6) lo mide. Lo que queda es el anuncio (B4-H1) y el texto tras un fallo (B4-H2). |
| B3-H2 | **Cerrado.** | R13 y R14. La frase de `interfaz.md` («Si el cálculo falla, Guardar guarda sin aviso… y nunca decide con los huecos de antes») ya es cierta. |
| A3-H1 | **Cerrado.** | `README.md:143` dice `.. +154`. |

## Notas sin hallazgo

- **Prueba inestable bajo carga.** En la primera tanda de mutantes, la prueba «si al agendar igualmente el hueco acaba de
  ocuparse, el foco no se pierde en body» (`:966`) cayó una vez con M_VV3, en 1092 ms: el `waitFor` por defecto tiene un plazo de
  1 s. Con el mismo mutante salió verde en tres tandas seguidas. La prueba no es de esta ronda, pero puede hacer que un mutante
  equivalente parezca muerto si la tabla se mide con la máquina cargada.
- Tras el rebote, el texto «Pulsa Guardar otra vez» se queda junto al aviso cuando el segundo clic lo abre. Es el riesgo que
  declara R4.3 («Baja»), y no lo cuento.
