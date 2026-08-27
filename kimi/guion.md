# El guion

Diez pasos, en orden. **No se salta ninguno y no se reordenan.** Si un paso falla, se
arregla ese paso; no se pasa al siguiente «para volver luego».

---

## 0 · Comprueba dónde estás

**Tu raíz de trabajo tiene que ser la del proyecto, no `kimi/`.** Si arrancaste desde
dentro de `kimi/`, todo lo demás falla: `git` toca el repositorio que queda por encima de
tu raíz y te lo rechazan, `npm` no encuentra `package.json`, y ni siquiera puedes leer tu
ticket, porque `tickets/` queda fuera.

```
pwd
```

Tiene que ser la raíz del proyecto —`Psicogestion`, o la copia aparte que te hayan dado,
como `Psicogestion-kimi`—. Si termina en `kimi`, **para**: cierra la sesión y
vuelve a arrancar desde la carpeta del proyecto. No intentes salvarlo con rutas `../`.

Comprobación de que estás donde debes: `package.json`, `tickets/` y `kimi/` se ven los tres
desde aquí.

## 1 · Sitúate

```
git status                     # tiene que estar limpio
git branch --show-current      # ¿en qué rama estás?
npm install
```

**Si `git status` no está limpio**, hay trabajo de otro sin guardar: para y avisa. **No es
tuyo decidir qué se guarda y qué se descarta**, y tampoco tienes que preguntarlo: la
respuesta correcta es que te den una copia limpia.

**Puede que trabajes en una copia aparte** (un *worktree* de git, en una carpeta hermana
del proyecto). Si es así, **esa es tu raíz y no hay nada más**. No vayas a buscar la copia
principal: ahí hay trabajo en curso de otra persona, y que esté sucio **no te afecta ni te
bloquea**.

Ahora mira la rama:

- **Ya estás en `T-0XX-<slug>`** — te la han creado. **Sáltate el paso 3** y ve al 2. No
  hagas `git checkout main`: en una copia aparte git lo rechaza, porque `main` está en uso
  en otro sitio, y ese rechazo **no es un error que debas arreglar**.
- **Estás en `main`** — `git pull` y luego el paso 3 crea tu rama.
- **Estás en otra rama cualquiera** — para y avisa.

## 2 · Lee, y solo esto

- `kimi/LEEME.md`
- `kimi/proyecto.md`
- **tu** ticket en `tickets/`

Después, los ficheros del proyecto que tu ticket **nombra**, para no inventarte lo que
contienen. Ni uno más.

## 3 · Rama

**Si el paso 1 te dejó ya en `T-0XX-<slug>`, este paso está hecho. Sigue al 4.**

```
git checkout -b T-0XX-<slug>
```

El `<slug>` es el del nombre del ticket. Ejemplo: `T-018-fechas-y-zona-horaria`.
**Una rama por ticket, y ni una más.** Si ya existe, no crees otra con un sufijo.

## 4 · Copia las tareas

Escribe en `kimi/informes/T-0XX.md` la lista de tareas del ticket, tal cual, con sus
casillas sin marcar. Es tu lista de la compra: al final, cada casilla marcada tiene que
poder señalarse en el diff.

## 5 · Implementa

Solo los ficheros que tu ticket nombra. **Cada vez que te encuentres queriendo tocar algo
que no está en la lista, para**: eso es un hallazgo (paso 7), no un atajo.

Tres cosas que se comprueban y que la gente se salta:

- **Lee antes de usar.** Si vas a importar de `lib/formularios.ts`, ábrelo. Si vas a usar
  una función de `@date-fns/tz`, abre su README en `node_modules/@date-fns/tz/`. La
  API real, no la que recuerdas.
- **Sin dependencias no declaradas**, y las declaradas, ancladas de versión.
- **Comentarios en castellano** y solo donde expliquen un *porqué*. No narres el código.

## 6 · Demuéstralo

```
npm test
npm run lint
npm run build
```

Los tres en verde. **Y además, por cada criterio de aceptación del ticket, la prueba de que
se cumple**: la mayoría dicen ya cómo hacerlo —«romper, ver el rojo, revertir»—. Hazlo de
verdad. Un criterio marcado sin salida pegada es un criterio no cumplido.

## 7 · Anota lo que no te tocaba

Todo lo que hayas visto y no hayas arreglado va a `kimi/hallazgos/T-0XX.md`, con fichero,
línea y qué pasa. **Un hallazgo bien anotado vale más que un arreglo fuera de alcance.**

Si el fichero se queda vacío, bórralo.

## 8 · Pasa el verificador

```
node kimi/verificar.mjs T-0XX
```

Comprueba que no has tocado nada fuera del alcance y que no has colado dependencias. **Si
falla, no discutas con él: revierte lo que señala.** No edites `kimi/alcance.json` ni
`kimi/verificar.mjs` — eso es hacer trampa al examen y se ve en el diff.

## 9 · Cierra el informe y para

Completa `kimi/informes/T-0XX.md` con la plantilla de `kimi/informes/_plantilla.md`:
tareas marcadas, criterios con su **salida real pegada**, hallazgos y decisiones que
tomaste.

```
git add -A
git commit -m "T-0XX · <título del ticket>"
```

**Y ahí te paras.** No hagas `merge`, no hagas `push` a `main`, no empieces el siguiente
ticket. Avisa de que la rama está lista.

---

## Cuándo parar y preguntar

Para, escribe el hallazgo y **espera**, en estos cuatro casos:

1. El ticket te pide algo que **contradice** lo que ves en el código.
2. Necesitas una **dependencia** que el ticket no nombra.
3. Necesitas tocar una ruta de la lista de fuera de límites.
4. Un criterio de aceptación **no se puede comprobar** como está escrito.

En los cuatro, la respuesta correcta es un hallazgo, nunca una decisión propia. El ticket
lo escribió un arquitecto con contexto que tú no tienes; si algo parece un error, puede
serlo — pero lo confirma él, no tú.

## Lo que nunca se hace

- Marcar un criterio sin haberlo ejecutado.
- «Arreglar» un fallo de `lint` o de `build` que ya existía antes de tu rama. Es un
  hallazgo.
- Añadir un `eslint-disable`, un `@ts-ignore` o un `as any` para que algo pase.
- Escribir una prueba que recorra la misma estructura que dice probar.
- Borrar o reescribir una prueba ajena para que tu cambio pase en verde.
