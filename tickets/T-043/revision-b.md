Sin hallazgos ALTA (revisor B, ronda 3: 0 ALTA, 1 MEDIA, 1 BAJA).

<!-- REVISOR-B -->
# T-043 · Revisión B (interfaz, foco y pruebas) · ronda 3

Diff de la ronda: `git diff f2670dc 0c2c87e` en la rama `T-043-aviso-de-hueco-raro`, en el contexto de
`git diff main...0c2c87e`. Lo revisado: `app/(app)/agenda/nueva/formulario-alta.tsx` y su prueba,
`aviso-hueco-raro.tsx` y su prueba, `estado-alta.ts` (contexto), `docs/interfaz.md` y `docs/bitacora/T-043.md`.
La ronda 2 está archivada en `revision-b.ronda2.md` y `.json`.

Cómo se midió:
- Se sacó una copia con `git archive 0c2c87e` al scratchpad y se le puso una unión de `node_modules`.
- En la copia se ejecutó `npx vitest run formulario-alta aviso-hueco-raro alternativas-hueco estado-alta`.
  La línea base da 79/79 en verde, y `agenda/nueva` + `lib/citas` dan 379/379.
- Los mutantes se aplicaron uno a uno con un guion (`scratchpad/rb3/mut-rb3.js`): sustitución exacta,
  comprobando una sola coincidencia y con CRLF, y restaurando después.
- Las sondas son pruebas temporales añadidas a una copia del fichero de prueba y borradas después.
- El worktree no se tocó: `git status` queda vacío. Al acabar, `formulario-alta.tsx` de la copia
  coincide con 0c2c87e (salvo CR).

## Hallazgos

### MEDIA

**B3-H1 · `app/(app)/agenda/nueva/formulario-alta.tsx:126` (con `estado-alta.ts:109-131`).** El aviso solo
mira `vista.huecosRaros`, y ese mapa cubre la semana pintada y la ventana de 28 días desde hoy. El elegido
sobrevive a la navegación de semana. Si está fuera de la ventana y el usuario mira otra semana, su clave ya
no está en el mapa: `huecoRaroElegido` = null y Guardar guarda un hueco raro sin aviso.
- **Escenario (sonda S2 medida; el mapa, por lectura de `estado-alta.ts`):**
  1. Hoy es 04-10. El usuario va al calendario de la semana del 09-11 (día +36, fuera de `hoy..hoy+27`) y
     elige un hueco que es raro. La vista de esa semana trae su clave en `huecosRaros`.
  2. Pulsa «Semana anterior» para comparar con la del 02-11 (o «Semana siguiente»). `cargarVistaAlta` lee
     `desde = hoy` y `hasta = max(semanaHasta, hoy+27)` (`:109-110`), o bien semana ∪ ventana (`:131`). En
     ninguno de los dos casos entra el 09-11, así que el mapa nuevo no trae la clave del elegido.
  3. El elegido sigue marcado: en la sonda, el resumen dice «Hueco elegido: martes, 6 de octubre…» después
     de navegar.
  4. Guardar → `guardarAlta` se llama una vez, con la fecha y hora del elegido y sin aviso. Sonda S2: vista
     de la otra semana con `huecosRaros: {}` y resultado `guardarAlta=1 aviso=false`.
- Contradice el criterio que el ticket recupera de T-028 («aviso… cuando la cita deja un hueco raro»).
  También contradice la premisa de D4 («cubre a la vez calendario y tarjetas: el elegido puede venir de
  otra semana»): D4 solo es cierta para tarjetas, que siempre caen en la ventana.
- No es regresión de la ronda 3: pasa igual desde la ronda 1. Ningún revisor lo vio antes.
- Arreglo posible: en `enviar`, si el elegido no está en `vista.calendario.huecos`, pedir su semana como ya
  hace `elegirHueco` (`:253-259`) y decidir con esa vista. La otra opción es que `cargarVistaAlta` reciba la
  fecha del elegido y la incluya en la lectura. Una prueba que lo fije: elegir raro, navegar a una vista
  cuyo mapa no trae la clave, y Guardar ⇒ aviso o nueva petición, nunca `guardarAlta`.

### BAJA

**B3-H2 · `docs/interfaz.md:496-497` (con `formulario-alta.tsx:157-160` y `:175-179`).** La doc dice «Si el
cálculo falla, Guardar guarda sin aviso (la rareza no se conoce) y nunca decide con los huecos de antes».
Pero la rama de fallo solo avanza `clave` y conserva `claveVista`. Si la clave que falla es la misma de una
vista anterior, esa vista vuelve a contar como vigente.
- **Escenario (medido, sonda S1):**
  1. Tipo A y 17:00, que con A es raro (30 min).
  2. Se cambia a tipo B y `recalcularAlta` falla («FALLO B»). No hay aviso.
  3. Se vuelve a tipo A y el recálculo vuelve a fallar («FALLO A»). Ahora `clave` = `claveVista` = clave de
     A, y la vista que sigue pintada es la de A.
  4. Guardar → `guardarAlta` = 0. Sale el aviso con «30 minutos» y sus alternativas mientras la alerta
     «FALLO A» sigue visible.
- Variante S1b: si el aviso ya estaba abierto antes de pasar a B, tras el segundo fallo **reaparece solo**,
  con la alerta de fallo a la vez. El foco se queda en el select.
- El código cumple el invariante del diseño (la vista es de la clave pedida): la vista de A sí es de A. Lo
  que queda falso es la frase de la doc, y la pantalla enseña dos mensajes que se contradicen: «no se
  pudieron calcular» y un aviso calculado.
- Arreglo mínimo, a elegir uno:
  - `claveVista: ''` en las dos ramas de fallo, para que un fallo invalide toda vista hasta el siguiente
    ok. Así la doc pasa a ser cierta.
  - Matizar la frase de la doc («…salvo que la vista pintada sea ya de esa misma elección»).

## Lo que se pidió comprobar (diseño, «Qué revisar» R3.5)

| Punto | Resultado |
|---|---|
| B2-H1: el aviso no está montado mientras se recalcula | Cerrado. `avisoVisible` exige `vistaVigente`, y esta exige `!recalculando`. R8 lo mide. Mutantes M_VV y M_VV2 mueren en R8 (1) `:1161`, R9 (3) `:1201`, R9b (3) `:1227` y R10 (1) `:1251`. |
| B2-H2: un fallo no decide con la vista vieja | Cerrado, salvo la vuelta a una clave ya pintada (B3-H2). M_FAV y M_FCV (fallo que marca `claveVista`) mueren en `:1201`/`:1251` y en `:1227`. |
| B2-H3: sacar de «recalculando» tras un fallo, probado | Cerrado. M_FA muere en R9 (2) `:1193` y R10 `:1256`. M_FC muere en R9b (2) `:1219` y en «hueco acaba de ocuparse» `:966`. |
| B2-H4: «Agendar igualmente» no existe durante el recálculo | Cerrado: no se monta. M_R_aviso es equivalente por construcción (`avisoVisible ⇒ !recalculando`). |
| Invariante `claveVista` | M_VV3 (sin `!recalculando`) muere en R10 (2) `:1256`. M_OK (la rama ok conserva `claveVista`) hace caer 14 pruebas. |
| Las pruebas nuevas fallan sin el arreglo | Sí. Contra f2670dc, R8, R9, R9b y R10 fallan en `:1161`, `:1201`, `:1227` y `:1251`, como dice la bitácora. |
| Sin efecto de foco genérico (D-R3.2) | Cierto. `focoPendiente = 'guardar'` solo está en el `.then` de `agendarIgualmente`, que ya existía. El grep de `huecosRaros`/`huecoRaroElegido` da solo `:126`, `:128`, `:305` y `:575-579`. |
| Mutantes de rondas anteriores | M_R y M_R_submit mueren en `:998`/`:1036`, y M_R_aria en `:999`. M_E, M_F, M_L, M_M y M_BM tumban una prueba cada uno, M_H tumba 14 y M_V tumba H8. M_B sigue equivalente, como se declaró. |
| Notas de la ronda 2 | Arregladas: el JSDoc de `ocupado` (`aviso-hueco-raro.tsx:14`) y la mención de «Agendar igualmente» en `interfaz.md`. La prueba «sin alternativas» comprueba ahora que el botón existe. |

## Notas sin hallazgo

- **Bitácora.** La tabla de mutantes dice que M_R_aviso sobrevive porque «`ocupado` impide la llamada». Para
  M_R_aviso no es así, porque ese mutante también muta `ocupado`. Sobrevive porque `avisoVisible ⇒
  !recalculando`, y el aviso no existe mientras se recalcula. No hay escenario de fallo: el veredicto
  (equivalente) es correcto.
- **M_HOV y M_INI siguen verdes y son equivalentes en la práctica.**
  - M_HOV pone `claveVista: ''` tras `hueco_ocupado`; M_INI la pone en el estado inicial.
  - Al empezar no hay tipo, así que zod corta antes de `enviar`.
  - Tras `hueco_ocupado` el elegido es null, y la clave cambia con `excluirHuecos`.
- **No medido.** En Safari un clic de ratón no enfoca botones. Un clic en «semana» o en un hueco con el foco
  en el aviso podría dejar el foco en `body` al desmontarse el aviso. Ya pasaba antes de esta ronda y no lo
  he podido medir en jsdom, así que no va como hallazgo.
- La lista de cambios que retiran el aviso en `interfaz.md:495` no nombra la exclusión de huecos
  (`excluirHuecos`). No pasa nada por ello: es la rama de `hueco_ocupado`, donde el elegido ya se ha quitado.
