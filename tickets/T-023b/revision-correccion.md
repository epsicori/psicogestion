Sin hallazgos ALTA. Revisión de corrección, ronda 2, de T-023b sobre f6a2a51 (delta `3b2ea22..f6a2a51`): 0 ALTA, 1 MEDIA, 0 BAJA.

## Hallazgos de la ronda 1

| Id | Estado | Cómo se comprobó |
|---|---|---|
| H1 · MEDIA | **Cerrado** | `acciones-factura.tsx:22-26` monta siempre `AsignarCobro` con `disponible={cobrosSinFactura > 0}`. En `asignar-cobro.tsx:130-146` solo el botón depende de `disponible`; el `<p role="status" tabIndex={-1}>` queda montado. El efecto `asignar-cobro.tsx:67-69` lleva el foco a esa región cuando `!disponible && aviso !== ''`. La prueba `acciones-factura.test.tsx:29-63` asigna, repinta con `cobrosSinFactura={0}` y exige el aviso dentro de `role=status` y el foco en esa región. Caería sin el arreglo: con el montaje condicional, `getByText` no encuentra el aviso; sin el efecto, el foco queda en `body`. `npx vitest run` de los tres ficheros de la fila: 21/21 en verde. |
| H2 · MEDIA | **Cerrado** | `facturacion.spec.ts:358-372`: la precondición `option` = 2 (el marcador y el cobro suelto) asegura que se asigna el último. Después, sin `if`: `boton` = 0, aviso «Cobro asignado a la factura» visible y enfocado, y `activeElement` distinto de `BODY`. |
| H3 · MEDIA | **Cerrado** | `facturacion.spec.ts:387-434`: `page.route` + `ruta.fetch` leen los documentos, los `fetch` y todos los POST. El técnico abre «Asignar» en la fila de Lucía (`E2E-L-<ts>`). Un control exige que algún cuerpo no HTML traiga `REFERENCIA_LUCIA`. Ese texto solo viaja en la respuesta de `cargarCobrosAsignables`: `fila-factura.tsx` pinta la referencia de los cobros ya asignados, no la de los sueltos. Así que el control prueba que el POST se leyó. |
| H4 · BAJA | **Cerrado** | `mutantes.json`: M1 y M2 pasan a ser mutantes del disparador, como fija el diseño. M1p queda declarado como mutante equivalente de la política de alta. |
| H5 · BAJA | **Cerrado** | La bitácora (`:23`) ya dice `limit 201` y remite a la prueba de `acciones.test.ts:590`: 201 filas dan 200 y `hayMas`; 200 filas, sin `hayMas`. |

## Regresiones buscadas

- **Fila que carga ya a 0:** el efecto no se dispara, porque `aviso` empieza en `''`. Ninguna fila roba el foco al cargar la página.
- **`beforeAll` y el paso 4:** la siembra canónica no trae cobros. El `beforeAll` deja 2 en «Últimos cobros» (Sofía y Lucía), por debajo del tope de 18; el paso 4 cuenta en relativo (`antes + 1`). Los números y las referencias no se contienen entre sí (`E2E-<ts>` frente a `E2E-L-<ts>`), así que `fila(page)` y las opciones del paso 8 no se cruzan con las de Lucía. En ejecuciones repetidas sin reset, Sofía vuelve a tener exactamente un cobro suelto, porque el paso 8 asigna el anterior, y la precondición del paso 8 se sostiene.
- **Orden de efectos al cerrar:** `useDevolucionDeFoco` devuelve el foco en la limpieza de su efecto, y React ejecuta todas las limpiezas antes que los efectos nuevos. Si el cierre y el repintado llegan en el mismo commit, el efecto de `AsignarCobro` va después y gana. Si llegan en dos commits, el segundo vuelve a disparar el efecto, porque cambia `disponible`. En los dos casos el foco acaba en la región de estado.
- **Foco robado en repintados posteriores:** sí ocurre. Es el hallazgo N1.

## MEDIA

### N1 · MEDIA (local) · `app/(app)/facturacion/asignar-cobro.tsx:67-69`
**Qué pasa:** el efecto de foco se dispara en **todas** las filas del mismo paciente que conserven un aviso antiguo. El foco salta a otra fila.
**Por qué:**
- La condición es `!disponible && aviso !== ''`, con dependencias `[disponible, aviso]`.
- `cobrosSinFactura` es por **paciente**: el subselect de `listado_facturas_espejo` filtra por `c.paciente_id = pg.paciente_id`. Cuando se asigna el último cobro suelto, `disponible` pasa a `false` a la vez en todas las facturas de ese paciente.
- `aviso` solo se limpia en `abrir()`. Una fila donde ya se asignó antes sigue con «Cobro asignado a la factura».
- Todas esas filas llaman a `focus()` en el mismo commit. Gana la última en el orden del árbol, no la fila donde actuó el usuario.

**Escenario:** Sofía tiene dos facturas en la página, F1 encima de F2, y dos cobros sueltos, c1 y c2.
1. El administrador asigna c1 a F2. F2 muestra «Cobro asignado a la factura» y el foco vuelve a su botón, porque aún queda c2.
2. Asigna c2 a F1. `revalidatePath` repinta las dos filas con `cobrosSinFactura = 0`.
3. El efecto de F1 enfoca su región de estado, y justo después el de F2 enfoca la suya, que conserva el aviso del paso 1.

**Efecto:** el foco termina en la fila de **otra** factura. Lo medí con una prueba temporal en jsdom (ya borrada) con dos `AsignarCobro` hermanos: antes del repintado, el foco estaba en F1; después, `F1=false F2=true`. El lector de pantalla lee el aviso antiguo de F2 como si fuera la confirmación, y el siguiente Tab sigue desde la fila de abajo.

Lo mismo pasa si F2 tenía un aviso de cualquier asignación anterior y luego se asigna el último cobro suelto del paciente desde cualquier otra fila que esté por encima.

**Arreglo posible:** que el foco lo pida la asignación con éxito de esa misma instancia, no el estado en reposo. Por ejemplo, un `ref`/contador que se arma en `enviar()` al recibir el éxito y se consume en el efecto, o limpiar `aviso` cuando `disponible` cambia sin una asignación propia en vuelo.

**Prueba que lo cazaría:** dos `AsignarCobro` hermanos con aviso en el de abajo; se asigna en el de arriba y se repinta con `disponible={false}`; el foco debe quedar dentro del de arriba.
