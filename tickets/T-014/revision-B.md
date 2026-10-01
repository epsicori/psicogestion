SIN ALTA (revisor B: interfaz, foco, ARIA y componentes). 0 ALTA · 0 MEDIA · 5 BAJA.

# T-014 · Revisión B, tercera ronda de arreglos (cee5503..9d84a86)

Qué he leído:
- `git diff worktree-agent-ad57f1926d23105e2 worktree-agent-a09e769eeabcb1913` (10 ficheros). En el worktree, además, `calendario.tsx` entero, `fila-propuesta.tsx`, `zona-por-confirmar.tsx`, `panel-dia.tsx`, `panel-anclado.tsx`, `colocacion.ts`, `foco.ts`, `dialogo.tsx`, `armazon-cliente.tsx`, `page.tsx`, `documentacion.tsx` y `leerAlertasNotaPendiente` (`lib/citas/agenda.ts`).
- `revision.md` y `revision-B.md` de la ronda anterior, y `docs/state.md` §Hallazgos.

No he leído `evidencia.json`. En el worktree, `vitest run app/(app)/agenda components/ui` pasa entero: 36 ficheros, 334 pruebas.

**Mutaciones.** Cada una se aplicó con `perl -pi`, se pasó la misma suite y se revirtió con `git checkout`. Las tres reproducciones (R1, R2, R3) se hicieron con ficheros de prueba temporales que ya he borrado. En el worktree solo queda `_v/` sin seguimiento (capturas y `b21.mjs`, `sembrar.sql`), que no es mío: apareció a las 21:59, de otro agente que trabaja en el mismo worktree.

| Mutación | Resultado |
|---|---|
| `resolverCita` vuelve a `if (!sigueAbierto) return` (B2-1) | **rojo**: la prueba nueva de B2-1 |
| `nadaAbierto` sin `dialogo === null` | **verde** → B3-2 |
| Zona sin la guarda de foco | **rojo**: 2 (la del selector, B2-2, y la del panel) |
| Zona sin `activo !== document.body` | **rojo**: 2 (recargado en el mismo commit) |
| Zona sin `!zona.contains(activo)` | **rojo**: 3 |
| `rectDe` sin `ancla.closest(CELDA_O_DIA)` (B2-4) | **rojo**: la prueba nueva de B2-4 |
| Sin `centrarEnVentana` (B2-3) | **rojo**: la prueba nueva de B2-3 |
| Centrar con cualquier ancla, no solo con el calendario | **verde** → B3-5 |
| `visibleEnVentana` cambiada por la identidad | **verde** → B3-5 |
| `visibleEnVentana` sin `Math.max(0, …)` | **verde** → B3-5 |

## 1 · Estado de los hallazgos anteriores

| Id | Veredicto |
|---|---|
| B2-1 | **Cerrado para el caso pedido.** Con nada abierto, el resultado tardío no cierra nada y el foco sigue a la cita en su día nuevo. La prueba discrimina: con la guarda antigua, se pone roja. La otra prueba nueva (otro panel abierto y recargado) también fija que no se le quita el foco. **Resto:** la condición mira «nada abierto» y no «el foco está en la propia cita». Por eso el panel del día abierto con el foco en la fila de esa cita sigue cayendo a `body` (B3-1). Además, la conjunción `dialogo === null` no tiene prueba (B3-2). Lo de «foco a la cita aunque el usuario lo moviera a otro control» no lo cuento: se aceptó así. He buscado un escenario peor, un modal ajeno al calendario abierto durante la espera. El cajón del armazón no es modal (`armazon-cliente.tsx` no atrapa el foco) y en `/agenda` no hay otro `Dialogo`, así que no lo he encontrado. |
| B2-2 | **Cerrado según lo pedido.** La zona solo toma el foco si `activeElement` es nulo, `body` o está dentro de ella. La prueba del `<select>` se pone roja sin la guarda. **Resto:** «dentro de la zona» incluye las filas de las *otras* propuestas (B3-3). |
| B2-3 | **Cerrado en lo que se medía.** Con el calendario de −300 a 1300 px en una ventana de 1133 px, el panel queda centrado (`top` 446,5) y con un alto útil de 1117 px. La prueba usa ahora medidas realistas y se pone roja sin `centrarEnVentana`. **El pico, con el panel centrado**, no apunta a nada: va forzado a `lado: 'abajo'`, en el centro del borde superior (B3-4). **Además**, de las dos condiciones nuevas, ninguna tiene prueba que la fije (B3-5). |
| B2-4 | **Cerrado.** El escalón `ancla.closest(CELDA_O_DIA)` tiene prueba: contra la celda da `top` 598 y, sin el escalón, cae al calendario (medido, rojo). Se ha quitado `respaldo?.closest`, que era el mutante equivalente. |
| B2-5 | **Cerrado.** `VISIBLE_AL_TECNICO` es una lista blanca con solo `consentimiento_pendiente`, como decidió el propietario. El técnico ya no pide `borrador_abandonado`. La prueba compara el objeto entero. |
| B2-6 | **Cerrado.** Hay `satisfies Record<TipoAlerta, boolean>` sobre el enum de `database.types`: un tipo nuevo no compila hasta que se decide, y mientras tanto queda oculto al técnico. El profesional sanitario y el administrador van sin filtro de tipo (`tipos` ausente → `leerAlertasNotaPendiente` no añade `.in`). Las pruebas lo fijan con `toBeUndefined`. |
| A2-1 (interfaz) | **Cerrado.** Con `null` (y con cualquier rol que no sea uno de los dos clínicos), el criterio es `{ soloPropias: true, tipos: ['consentimiento_pendiente'] }`. La prueba compara el objeto entero. |

## 2 · Hallazgos nuevos

### BAJA

**B3-1 · `app/(app)/agenda/calendario.tsx:160-163`**. Con el panel del día abierto y el foco en la fila de la cita, el resultado tardío no hace nada y, si la cita cambia de día, el foco cae a `body`.
- **La causa.** `nadaAbierto` exige `abiertos.length === 0`. Con la pila `[día]`, no es «nada abierto», no es «sigue abierto» y la función sale sin tocar el foco. Es el mismo tercer estado de B2-1 («foco en la propia cita»), pero con el día debajo.
- **Escenario.** Se abre el martes desde su número y, desde la lista del día, la cita A. Se pulsa Confirmar en su propuesta, «el jueves a las 11:00». Durante «Un momento…» se pulsa Escape: el panel de A se cierra y el foco vuelve a la fila de A en el panel del martes (D9). La acción vuelve y el recargado saca a A del martes. La fila se desmonta con el foco dentro, y el foco cae a `body` con el panel del día todavía abierto. El lector de pantalla pierde el sitio. El siguiente Tab sí lo recupera la trampa, que lleva el foco a la primera fila del panel.
- **Reproducido** (R1, prueba temporal): tras el recargado, `document.activeElement === document.body` y el panel del martes sigue abierto.
- **Lo que falta.** Decidir el caso por dónde está el foco (en un `[data-cita-id=cita.id]` o en `body`), no por cuántos paneles hay. Con el día abierto, el destino razonable es el propio panel del día (su primera fila o el número del día nuevo si se cierra). Elegirlo es cosa del diseño.

**B3-2 · `app/(app)/agenda/calendario.tsx:160`**. La conjunción `dialogo === null` de `nadaAbierto` no tiene prueba. Si se quita, el resultado tardío roba el foco a un diálogo modal y ninguna prueba cae.
- **Cuándo importa.** El diálogo de reprogramar también se abre con la pila vacía, al soltar una cita arrastrada (`alSoltar`). Es el único estado con un diálogo abierto y ningún panel.
- **Escenario.** Se confirma la propuesta de A desde su panel y se pulsa Escape. Durante la espera, se arrastra B a otra hora, y se abre «Reprogramar la cita» con el foco dentro. Vuelve el resultado de A. Con la conjunción, la función sale y el foco no se mueve: el código está bien. Sin ella, `nadaAbierto` es `true`, `enfocarCita` lleva el foco a A en la rejilla, detrás del modal, y vuelve a hacerlo con el recargado.
- **Medido.** Con el mutante, las 334 pruebas siguen en verde. Una prueba temporal (R2) con ese recorrido (arrastre de B como en «soltar una cita arrastrada…» y foco en el diálogo) pasa con el código del árbol y se pone **roja** con el mutante. Es la prueba que falta.

**B3-3 · `app/(app)/agenda/zona-por-confirmar.tsx:25-26`**. «Dentro de la zona» incluye las filas de las otras propuestas, y la resolución de una les quita el foco.
- **La causa.** `zona.current.contains(activo)` es verdad para cualquier botón de «Por confirmar», no solo para los de la fila que se resuelve. La guarda sigue al pie de la letra lo que pedía B2-2, que era demasiado ancho.
- **Escenario.** Hay dos propuestas, la de Ana y la de Berta. Se pulsa Confirmar en la de Ana y, durante «Un momento…», se pasa con Tab al Confirmar de Berta para encadenarla. Vuelve la de Ana: el foco salta al `div` de la zona (`tabIndex=-1`). Un Intro ya no confirma la de Berta, y el lector anuncia la zona en vez del botón.
- **Reproducido** (R3, filas con `key` como en `por-confirmar.tsx`): el Confirmar de Berta sigue montado (`isConnected === true`) y `activeElement` es el `div` de la zona.
- **Lo que falta.** La fila que se resuelve tiene que decir si el foco era suyo. Por ejemplo, `alResuelta` puede recibir el contenedor de la fila, o la fila puede comprobar `contains` antes de avisar. La zona solo toma el foco si estaba en esa fila o en `body`.

**B3-4 · `components/ui/colocacion.ts:129`** (lo pinta `panel-anclado.tsx:147`). Con el panel centrado, el pico sigue dibujado y apunta a lo que haya justo encima del panel, que no es la cita.
- **La causa.** `centrarEnVentana` devuelve `lado: 'abajo'` y `picoX = ancho / 2`. El pico sale en el centro del borde superior, apuntando hacia arriba, al centro horizontal del calendario.
- **Escenario.** Es el de B2-3: un iPad mini con la semana abierta en horizontal, una cita abierta desde el panel del día, y se gira a vertical (744 px, por debajo de `md`). La semana pasa a la `ListaDia` y el panel se centra en `top` 446. El pico apunta a la fila de la lista que queda encima del panel, que puede ser otra cita, por ejemplo la de Berta. Quien mira lee que el panel de Ana pertenece a Berta.
- **Lo que falta.** Sin referencia, no dibujar el pico: un tercer `lado` sin `before:`, o `--pico-x` vacío. Otra opción, de alcance más ancho, es buscar antes del calendario el gemelo visible `[data-cita-id]`: en este escenario existe en `lista-dia.tsx:93`.

**B3-5 · `components/ui/panel-anclado.tsx:101-104` y `components/ui/colocacion.ts:99-103`**. Las dos condiciones nuevas del último escalón no tienen prueba que las fije, y `visibleEnVentana` solo recorta por un lado.
- **`referencia.calendario &&`.** Si se quita, se centra cualquier panel que no quepa, no solo el que se coloca contra el calendario, y las 334 pruebas siguen en verde.
  - **Escenario:** un teléfono en horizontal (932 × 430), y el panel de un día con diez citas (unos 500 px), abierto desde un número a media altura. Hoy se coloca en el lado mayor y hace scroll por dentro (criterio 12).
  - Con el mutante, se despega del día y se centra, y ninguna prueba cae: `colocacion.test.ts` prueba `colocarPanel`, no el cableado.
- **`visibleEnVentana`.** Cambiarla por la identidad, o quitarle el `Math.max(0, …)`, deja todo en verde.
  - Para la caja de B2-3 es equivalente: los dos huecos negativos o a cero llevan igualmente a centrar.
  - Solo cambia algo cuando el calendario queda entero **por encima** de la ventana. Por ejemplo, tras el giro de B2-3, al bajar hasta «Documentación» con el panel abierto: el calendario acaba en −100 px. Sin el recorte, el panel va a `top` −92, cortado por arriba. Con él, va a 8.
  - Ese caso no tiene prueba.
  - El recorte no es simétrico. Con el calendario por debajo de la ventana, `top` se queda en `rect.top` (mayor que `alto`) y no se acota a `alto`, aunque el comentario dice «la parte de `rect` que se ve en una ventana». En `/agenda` hoy no se llega ahí, porque por encima del calendario solo están la cabecera y el título.
- **Lo que falta.** Una prueba de `PanelAnclado` con un ancla normal donde no quepa el panel, que exija que no se centre. Una prueba de `visibleEnVentana` en `colocacion.test.ts` con la caja por encima y por debajo de la ventana. Y el `top` acotado a `[0, alto]`.

## Notas (sin hallazgo)

- **El `if (sigueAbierto)` alrededor de `setReprogramando(null); setPila([])`** es equivalente. Con nada abierto, poner la pila vacía y el diálogo a `null` no cambia nada. Está bien como documentación.
- **Calendario remontado durante la espera** (cambiar de semana o de vista cambia la `key`): el `resolverCita` de la instancia muerta solo hace `setState` sobre un componente desmontado y no mueve el foco de la nueva. Cambiar el filtro de profesional no remonta. Eso cae en el caso aceptado del «otro control».
- **`criterio.tipos?.length === 0`** solo es cierto si la lista blanca se vacía, y entonces la bandeja desaparece entera para el técnico. Es coherente con «un tipo nuevo queda oculto».
- `panel-anclado.test.tsx:266-267`: hay una línea en blanco doble antes de `ConLimitesYRespaldo`, y sigue en pie el comentario mal colocado de la ronda anterior (l. 181-183).
- **Ya anotado en `state.md`, no lo cuento**: el panel del mes que rebasa el recuadro del calendario, la caja de cita por debajo de 44 px, la RLS del técnico (T-015) y la otra puerta de la ficha del paciente.
