# El guion

Diez pasos, en orden. **No se salta ninguno y no se reordenan.** Si un paso falla, se
arregla ese paso; no se pasa al siguiente «para volver luego».

---

## 0 · Comprueba dónde estás

**Tu raíz de trabajo tiene que ser la del proyecto, no `minimax/`.** Si arrancaste desde
dentro de `minimax/`, todo lo demás falla: `git` toca el repositorio que queda por encima
de tu raíz y te lo rechazan, `npm` no encuentra `package.json`, y ni siquiera puedes leer
tu corte, porque `tickets/` queda fuera.

```
pwd
```

Tiene que ser la raíz del proyecto —`Psicogestion`, o la copia aparte que te hayan dado,
como `Psicogestion-minimax`—. Si termina en `minimax`, **para**: cierra la sesión y vuelve
a arrancar desde la carpeta del proyecto. No intentes salvarlo con rutas `../`.

Comprobación de que estás donde debes: `package.json`, `tickets/` y `minimax/` se ven los
tres desde aquí.

## 1 · Sitúate

```
git status                     # tiene que estar limpio
git branch --show-current      # ¿en qué rama estás?
npm install
```

**Si `git status` no está limpio**, hay trabajo de otro sin guardar: para y avisa. **No es
tuyo decidir qué se guarda y qué se descarta**, y tampoco tienes que preguntarlo: la
respuesta correcta es que te den una copia limpia.

**Puede que trabajes en una copia aparte** (un *worktree* de git, en una carpeta hermana del
proyecto). Si es así, **esa es tu raíz y no hay nada más**. No vayas a buscar la copia
principal: ahí hay trabajo en curso de otros carriles, y que esté sucia **no te afecta ni
te bloquea**.

Ahora mira la rama:

- **Ya estás en `T-0XX<letra>-<slug>`** — te la han creado. **Sáltate el paso 3** y ve al 2.
  No hagas `git checkout main`: en una copia aparte git lo rechaza, porque `main` está en
  uso en otro sitio, y ese rechazo **no es un error que debas arreglar**.
- **Estás en `main`** — `git pull` y luego el paso 3 crea tu rama.
- **Estás en otra rama cualquiera** — para y avisa.

**Hay otros dos carriles moviendo `main` a la vez que tú.** Si tu rama se queda atrás y
hace falta ponerla al día, se rebasa **sobre `main` y solo sobre `main`**, nunca sobre la
rama de otro carril. Después de rebasar, `npm install` otra vez: `package-lock.json` puede
haber cambiado. **Un conflicto en el lock no se resuelve a mano**: te quedas con el de
`main`, reaplicas tu `package.json` y corres `npm install`.

## 2 · Lee, y solo esto

- `minimax/LEEME.md`
- `minimax/proyecto.md`
- **tu** corte en `minimax/cortes/`
- el **ticket** del que sale el corte, en `tickets/`

Después:

- Las secciones de `docs/interfaz.md` que tu corte **cite por nombre**. Solo esas.
- Los ficheros del proyecto que tu corte **nombre**, para no inventarte lo que contienen.
- La guía de `node_modules/next/dist/docs/` que corresponda a lo que vayas a escribir.

Ni uno más.

**El corte manda sobre el ticket.** El ticket es la pieza entera y se entrega en varias
partes; el corte dice cuál te toca. Lo que aparezca en el ticket y **no** en tu corte, **no
lo hagas**: es de otra entrega y hacerlo la rompe.

**Las citas a ADR son procedencia, no deberes.** Cuando el corte dice «ADR-044», te está
diciendo de dónde viene la regla, no mandándote a leer el ADR entero: `minimax/proyecto.md`
y el corte ya la reescriben donde te hace falta. Ábrelo en `docs/decisions.md` solo si
después de leerlos sigue habiendo algo que no puedes resolver sin él.

## 3 · Rama

**Si el paso 1 te dejó ya en tu rama, este paso está hecho. Sigue al 4.**

```
git checkout -b T-007a-primitivas
```

El nombre sale del corte. **Una rama por entrega, y ni una más.** Si ya existe, no crees
otra con un sufijo.

## 4 · Copia las tareas

Escribe en `minimax/informes/T-0XX.md` la lista de tareas de **tu corte**, tal cual, con
sus casillas sin marcar. Es tu lista de la compra: al final, cada casilla marcada tiene que
poder señalarse en el diff.

## 5 · Implementa

Solo los ficheros que tu corte nombra. **Cada vez que te encuentres queriendo tocar algo
que no está en la lista, para**: eso es un hallazgo (paso 7), no un atajo.

Cinco cosas que se comprueban y que la gente se salta:

- **Lee antes de usar.** Si vas a importar de `lib/formularios.ts`, ábrelo. Si vas a
  escribir un `<Suspense>` o `use cache`, abre la guía de Next en
  `node_modules/next/dist/docs/`. La API real, no la que recuerdas.
- **Ni un color literal.** Token siempre, y los tokens en `app/globals.css`. Si te falta un
  token, se añade allí; no se escribe un `#` en un componente.
- **Ninguna librería de componentes**, y **sin dependencias no declaradas**. Las
  declaradas, ancladas de versión.
- **Escribe la primitiva táctil y responsiva la primera vez.** 44 px de objetivo y 360 px de
  ancho no son un repaso final: son parte de escribirla.
- **Comentarios en castellano** y solo donde expliquen un *porqué*.

## 6 · Demuéstralo

```
npm test
npm run lint
npm run build
```

Los tres en verde, y el build **sin avisos de prerenderizado bloqueado** si tu entrega
tocó `cacheComponents`.

**Y además, por cada criterio de aceptación de tu corte, la prueba de que se cumple.**
Varios dicen ya cómo hacerlo —«romper, ver el rojo, revertir»—: hazlo de verdad y pega
**las dos** salidas. Un criterio marcado sin salida pegada es un criterio no cumplido.

Los criterios manuales se ejecutan de verdad, no se razonan:

- **Teclado**: recorre lo que has escrito **solo con el teclado**. El foco nunca desaparece
  ni se escapa detrás de una capa, y al cerrar vuelve a donde estaba.
- **360 px**: estrecha la ventana a 360 px y repítelo entero.
- **Movimiento reducido**: actívalo en el sistema y comprueba que nada anima.
- **Al lado del prototipo**: abre `/prototipo` en otra pestaña y compara el vocabulario
  visual. Sin controles de adorno.

## 7 · Anota lo que no te tocaba

Todo lo que hayas visto y no hayas arreglado va a `minimax/hallazgos/T-0XX.md`, con
fichero, línea y qué pasa. **Un hallazgo bien anotado vale más que un arreglo fuera de
alcance.**

**Nunca en `docs/`.** La memoria del proyecto la escribe el arquitecto: tú le dejas el
material en `minimax/hallazgos/` y en la sección **§Para `docs/state.md`** de tu informe.
Si un ticket te manda escribir en `docs/`, el ticket está mal: eso es un hallazgo.

Si el fichero se queda vacío, bórralo.

## 8 · Pasa el verificador

```
node minimax/verificar.mjs T-007a
```

Comprueba que no has tocado nada fuera del alcance y que no has colado dependencias. **Si
falla, no discutas con él: revierte lo que señala.** No edites `minimax/alcance.json` ni
`minimax/verificar.mjs` — eso es hacer trampa al examen y se ve en el diff.

## 9 · Cierra el informe y para

Completa `minimax/informes/T-0XX.md` con la plantilla de `minimax/informes/_plantilla.md`:
tareas marcadas, criterios con su **salida real pegada**, hallazgos y decisiones que
tomaste.

```
git add -A
git commit -m "T-007a · Seis primitivas accesibles"
```

**Y ahí te paras.** No hagas `merge`, no hagas `push` a `main`, no empieces la siguiente
entrega. Avisa de que la rama está lista.

---

## Cuándo parar y preguntar

Para, escribe el hallazgo y **espera**, en estos cinco casos:

1. El corte te pide algo que **contradice** lo que ves en el código.
2. Necesitas una **dependencia** que el corte no nombra — y muy en particular si lo que te
   pide el cuerpo es instalar una librería de componentes: eso es siempre un no.
3. Necesitas tocar una ruta de la lista de fuera de límites.
4. Un criterio de aceptación **no se puede comprobar** como está escrito.
5. `docs/interfaz.md` y lo que ves en `/prototipo` **dicen cosas distintas**. Manda la
   arquitectura, pero el choque se anota: puede que el prototipo enseñe algo que un rol no
   debe ver, y eso no lo decides tú.

En los cinco, la respuesta correcta es un hallazgo, nunca una decisión propia. El corte lo
escribió alguien con contexto que tú no tienes; si algo parece un error, puede serlo — pero
lo confirma él, no tú.

## Lo que nunca se hace

- Marcar un criterio sin haberlo ejecutado.
- «Arreglar» un fallo de `lint` o de `build` que ya existía antes de tu rama. Es un
  hallazgo.
- Añadir un `eslint-disable`, un `@ts-ignore` o un `as any` para que algo pase.
- Escribir un diálogo, un menú, unas pestañas o un desplegable **dentro de una pantalla**.
  Van en `components/ui/` o no van.
- Escribir una prueba que recorra la misma estructura que dice probar.
- Borrar o reescribir una prueba ajena para que tu cambio pase en verde.
- Tocar `app/prototipo/` para que deje de dar avisos. Está exento a propósito.
