Sin hallazgos ALTA. 2 MEDIA, 2 BAJA.

# Revisión T-048 · ronda 2 · Documentación pendiente agrupada por paciente

- **Diff de la ronda**: `git diff 38f78d3 worktree-agent-afd4c4801e9671c9e` (HEAD 3108602, 10 ficheros).
- **Diff del conjunto**: `git diff main...worktree-agent-afd4c4801e9671c9e` (29 ficheros).
- **Territorio**: el de la ronda no cambia.
- **Líneas citadas**: las del worktree.
- **Mutantes**: se analizaron leyendo el código y no se midieron. El verificador trabajaba en el
  mismo worktree y no lo toqué.

## Hallazgos de la ronda 1

| Id | Estado | Prueba y mutante |
|---|---|---|
| H1 | **Resuelto en lo que pedía, pero el arreglo rompe otra cosa (ver R2-H1)** | `BuscadorInterno` lleva `key=tipo\|nivel\|pagina` (`buscador.tsx:38`). `buscador.test.tsx` tiene tres casos `it.each`, uno por eje, y cada uno mata el mutante que quita su eje de la clave. El spec lo mide también en el navegador (`:223-231`). |
| H2 | Resuelto | `acciones.test.ts` usa los lectores reales sobre un doble que registra las llamadas y espía las 5 consolas en el camino feliz y en 3 fallos (`:233-263`). Muere el mutante `console.error(…, termino.data)` en `!r.ok`, en `!n.ok` y en `!contexto.ok`. La aserción «el espía está vivo» (`:260`) evita el verde vacío. |
| H3 | Resuelto | `buscador.test.tsx:202` comprueba el segundo envío con el mismo `termino`, `tipo` y `nivel`, el foco en `busqueda-paciente-p2`, el anuncio y el recuento. Mueren `relanzar = () => {}` y `alAcertar={undefined}`, porque falla `toHaveBeenCalledTimes(2)`. |
| H4 | Resuelto | Guarda `palabras.length === 0` (`pendientes.ts:315`) y prueba con los cuatro términos de la ronda 1. |
| H5 | **La prueba mata el mutante, pero el escenario que modela no existe en la página (ver R2-H1)** | `resolver-alerta.test.tsx:217` y su gemela matan `eraUltimo: false` y `eraUltimo: true`. |
| H6 | Resuelto | `documentacion.test.tsx:236` fija los ids `[8,1,2,3,4,5]` en orden, y el paciente 8 de nivel 3 rompe el orden por id. Mueren `slice(-6)` y `slice(0,6)` sin ordenar. Los nombres pintados se comprueban uno a uno. |

## Los dos `UPDATE` del spec y la constitución

No chocan con la regla 6, y no hay hallazgo ALTA por ellos. Motivos:

- **La regla 6 no nombra la tabla.** Nombra `notas_clinicas_versiones`, `facturas`,
  `auditoria` y `accesos_historia`. `alertas_documentacion` es una tabla de trabajo con ciclo de
  estado `abierta → resuelta/anulada` por diseño (T-015, P1). La propia app la actualiza
  (`resolverAlerta`), y la base guarda esa transición con `fn_proteger_alerta_documentacion`
  (`20261006120000_avisos_y_escalado.sql:159-215`).
- **Las dos sentencias solo tocan filas que el spec acaba de crear**, por `origen_id` con el
  prefijo fijo `b0480000-…`. No hay ningún `DELETE`.
- **El cierre usa `resuelta`, no borra.** El paciente y la alerta quedan.
- **Es el patrón que ya usa el banco de RLS.** `scripts/rls/22-avisos.sql:162` y `:413` hacen lo
  mismo como superusuario: cierran una alerta de nivel 3 y fabrican una `nota_sin_firmar` con
  origen `notas_clinicas`.
- **Que pase la guarda es lo esperado.** La guarda es `security invoker` y deja pasar a todo
  `current_user <> 'authenticated'`. Por eso el `UPDATE` de `referencia_en`, que el cliente
  tiene congelado, entra como postgres.

Lo que sí tiene una consecuencia concreta es el efecto lateral de la nota de nivel 3 sobre el
cron de escalado: es el R2-H4.

## Criterio 12: el spec frente al contrato

**Cubierto:**

- 360 px sin desplazamiento en `/agenda` y `/agenda/documentacion`.
- 44 × 44 en «Marcar como resuelta», «Ver todos» del paciente y del panel, filtros, «Buscar» y
  paginación.
- El campo de búsqueda, de ≥ 44 de alto.
- Los enlaces de cada pendiente, de ≥ 44 de alto.
- Tab hasta «Marcar como resuelta» e Intro.
- El foco en la rama (a) del criterio 9.
- D10 de punta a punta: la URL sigue igual, ni la cruda ni la codificada llevan el término, y
  `history.length` no cambia.
- Ningún diálogo al pasar de `/agenda` a «Ver todos».
- La idempotencia: ids fijos, `not exists` sobre la abierta y cierre por prefijo.

**No cubierto:** Tab hasta el botón y Espacio (R2-H2), y el enlace de nombre (R2-H3).

## MEDIA

### R2-H1 · La clave del arreglo de H1 remonta también el `ProveedorResolucion` de la lista: resolver el único paciente de la última página pierde el foco y el anuncio

- **Dónde**: `app/(app)/agenda/documentacion/buscador.tsx:38`, junto con `contenido.tsx:43` y
  `:153`.
- **Por qué pasa**: la `key` que reinicia la búsqueda está en `BuscadorInterno`, y ese
  componente pinta `children`, que es la `<Lista>` envuelta en
  `ProveedorResolucion prefijo="pagina"`. Un cambio de `pagina` desmonta el proveedor, y con él
  su `pendiente`, su `eraUltimo` y su región `status` con el anuncio.
- **Escenario**:
  1. En `/agenda/documentacion?pagina=3`, la última página tiene un paciente con un pendiente.
  2. Pulso «Marcar como resuelta» y la acción da `ok`.
  3. La revalidación pinta `contenido.tsx` con `pagina=3 > ultima=2` y redirige a `?pagina=2`
     (`:87-88`).
  4. `pag.pagina` pasa a 2, la `key` cambia, y se monta un proveedor nuevo con
     `pendiente = null`.
  5. Nadie mueve el foco: el botón que lo tenía ya no existe y el foco cae en `body`. No se
     anuncia «Marcada como resuelta».
- **Lo mismo en una búsqueda**: si la que se resuelve desde los resultados es el único paciente
  de la última página, la redirección descarta la búsqueda (aceptado por el contrato) y también
  el foco.
- **Qué incumple**: el criterio 9 (b), «si era el último de la lista, al anterior».
- **La prueba de H5 lo certifica en falso**: `resolver-alerta.test.tsx:217` modela justo este
  caso («la redirección lleva a la anterior, que trae más pacientes») con un `rerender` que
  conserva el estado. En la página eso no puede pasar:
  - con la `key`, el proveedor se remonta;
  - sin ella, el `redirect()` que llega en el render de la revalidación lo recoge
    `RedirectErrorBoundary` (`node_modules/next/dist/client/components/redirect-boundary.js`),
    que sustituye el subárbol por `HandleRedirect` y también lo desmonta.

  En el resto de casos, la rama `eraUltimo` coincide con `min(indice, len-1)`. Ocurre en el
  panel, que sigue en 6, en una página no final y en la búsqueda, que queda en ≤ 20. Esa rama
  queda sin ningún camino real.
- **Corrección a la ronda 1**: el H5 de la ronda 1 lo pedí yo con la premisa «el estado se
  conserva», y esa premisa era falsa. El arreglo no puede limitarse a quitar `pagina` de la
  clave. Hace falta decidir qué pasa con el foco cuando la redirección remonta la lista; por
  ejemplo, que el proveedor nuevo enfoque el encabezado si nace tras una resolución, o declarar
  el residuo. Además, la prueba tiene que montar el árbol que remonta, no un `rerender` que lo
  conserva.

### R2-H2 · Ni el spec ni jsdom prueban «Tab al botón» ni «Espacio despliega», que el contrato pide por su nombre

- **Dónde**:
  - `accesibilidad/documentacion-pendiente.spec.ts:131-132`: hace `boton.focus()` y pulsa
    `Enter`.
  - `app/(app)/agenda/pendientes-fila.test.tsx:115-129`: el título dice «con el clic y el
    teclado», pero solo usa `fireEvent.click`.
- **Qué pide el contrato**:
  - Criterio 12: «Tab al botón, **Espacio** despliega».
  - Criterio del desplegable: «**Intro** y **Espacio** (`userEvent.keyboard`) lo abren y lo
    cierran».
  - El diseño (§1.13.3) repite el «Tab hasta el botón».
- **Escenario**: cambiar el `Button` por un `<div role="button" tabIndex={-1}>` con un
  `onKeyDown` que solo atienda `Enter`.
  - El spec sigue verde, porque `.focus()` enfoca aunque esté fuera del orden de tabulación y
    Enter abre.
  - jsdom sigue verde, porque `click` abre.
  - Efecto en producción: con el teclado, Tab salta el desplegable y Espacio no lo abre.
- **Qué falta**: el criterio 12, que es el que suspendió en la ronda 1, sigue sin cubrir dos de
  sus pasos literales.

## BAJA

### R2-H3 · El enlace de nombre del paciente no se mide, y del botón de desplegar solo se mide el alto

- **Dónde**: `accesibilidad/documentacion-pendiente.spec.ts:119-126`.
- **Qué pasa**:
  - `enlacePaciente` solo se usa para el foco.
  - Del botón se comprueban el alto y el borde derecho, pero no el ancho.
  - De los enlaces de pendiente, el alto.

  El contrato pide ≥ 44 × 44 en «el enlace de nombre» y en los demás.
- **Escenario**: un paciente con nombre corto y sin apellidos, por ejemplo «Eva».
  - El enlace usa `ENLACE` (`pendientes-fila.tsx:15`), que es `inline-flex min-h-11` sin ancho
    mínimo, así que mide unos 25 px de ancho.
  - El spec no lo ve, porque los nombres de la marca («Zzmarca T048 00») son largos y además ese
    enlace no se mide.

### R2-H4 · La nota de nivel 3 que fabrica el spec la ve el cron de escalado, y puede dejar una notificación permanente a los administradores

- **Dónde**: `accesibilidad/documentacion-pendiente.spec.ts:71-74`, junto con
  `20261006120000_avisos_y_escalado.sql:440-480` y `:502`.
- **Qué pasa**: el `UPDATE` de `referencia_en` deja abierta una `nota_sin_firmar` de nivel 3.
  `escalar_notas_pendientes()` corre cada 15 minutos (`cron.schedule`) e inserta una
  notificación `nota_pendiente_escalada` por cada administrador. Esa notificación no se cierra
  cuando `LIMPIAR` resuelve la alerta.
- **Escenario 1, el cron cae durante la pasada**:
  1. Una pasada del spec coincide con un `:00`, `:15`, `:30` o `:45`.
  2. Queda en `notificaciones` «Ana … tiene sin firmar la nota de la sesión del DD/MM», con
     origen `notas_clinicas/b0480000-…000`, una nota que no existe.
  3. Está en la campana del administrador hasta el siguiente `db reset`.
- **Escenario 2, la ejecución se corta antes de `afterAll`**:
  1. La alerta sigue abierta y Ana ve en `/agenda` a «Zzmarca T048 00» como «Muy atrasada».
  2. No puede cerrarla: la base dice «solo se cierra firmando la nota» y la nota no existe.
  3. El estado se cura solo con otra pasada completa del spec.
- **Alcance**: es una base local y no hay fuga, pero el banco fabrica un estado que ninguna ruta
  de la app produce.

## Lo que se miró y está bien

- **`acciones.ts`**: solo lee `termino`, `tipo` y `nivel` del `FormData`. La prueba de `:160`
  manda `rol`, `soloPropias`, `tipos`, `profesional` y `paciente`, y comprueba que ni el
  profesional ni el paciente llegan a la base.
- **El doble de `acciones.test.ts`**: un método desconocido lanza, y existen `or`, `ilike`,
  `textSearch` y `filter` para registrar su uso.
- **`documentacion.test.tsx:26-60`**: sin cambios en la ronda.
- **D10c**: comprueba que el reenvío lleva los campos ocultos vigentes (`tipo`, `nivel`), y no
  solo el término.
- **Idempotencia del spec**: los pacientes se insertan con `on conflict (id) do nothing`, y cada
  alerta solo si no hay una abierta del mismo `origen_id`. El índice único parcial lo respalda.
- **Sin cambios fuera de la ronda**: nada en `bloques.ts`, `page.tsx` de `agenda/` ni otros
  ficheros de T-047.
