# T-0XX · <título de la entrega>

**Rama**: `T-0XX<letra>-<slug>` · **Fecha**: <dd-mm-aaaa> · **Corte**: `minimax/cortes/T-0XX.md`

## Tareas

Copiadas de tu corte. Una marcada = un cambio señalable en el diff.

- [ ] …
- [ ] …

## Criterios de aceptación

**Uno por criterio, con la salida real pegada.** Sin salida, el criterio no está cumplido.
Si el criterio dice «romper, ver el rojo, revertir», se pegan **las dos** salidas.

### 1 · <texto del criterio, tal cual>

```
$ <comando>
<salida literal, sin recortar lo que incomoda>
```

### 2 · …

**Los criterios manuales también traen evidencia.** No vale «comprobado». Vale qué hiciste,
en qué orden y qué viste: «estreché la ventana a 360 px, abrí el cajón, tabulé las seis
primitivas y en las seis el foco volvió al disparador al cerrar con Escape». Si algo no se
pudo comprobar, se dice cuál y por qué.

## Alcance

```
$ node minimax/verificar.mjs T-0XX
<salida>
```

## Decisiones que tomé

Todo punto donde el ticket admitía más de una lectura y elegiste una. Qué elegiste y por
qué. **Si no hubo ninguna, escribe «ninguna»** — no lo dejes en blanco.

## Hallazgos

Lo que viste y no arreglaste. Detalle en `minimax/hallazgos/T-0XX.md`; aquí, una línea por
hallazgo. Si no hay, «ninguno».

## Para `docs/state.md`

Lo que el arquitecto tiene que transcribir a la memoria del proyecto: convenciones que
fijaste, patrones que quedan para el siguiente. **Tú no escribes en `docs/` nunca.**
Una línea por cosa, redactada para pegarse tal cual. Si no hay nada, «nada».

## Lo que NO hice

Lo que el ticket no pedía y podría parecer que falta. Sirve para que quien revise no
busque lo que nunca estuvo.
