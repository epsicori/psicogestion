**Sin hallazgos ALTA.** T-052, ronda 1, revisión única (riesgo medio). Commit revisado: `5aca298` (diff `a9b5903...5aca298`). Resultado: 0 ALTA, 0 MEDIA y 1 BAJA.

## BAJA

### H1 · `docs/state.md` choca con `main` al integrar (cruce)

- **Dónde:** `docs/state.md:21` y `:27-28` en la rama, contra `main` `b0023a4`.
- **Qué pasa:** la rama reescribe el punto 2 de «Siguiente paso» y quita dos líneas de «Hallazgos abiertos». Mientras tanto, `main` ha reescrito esas mismas zonas: la cabecera «Actualizado», «Dónde estamos», el «Siguiente paso» 1 y 2, la entrada nueva «T-051 B2» y la línea «QA visible». `git merge-tree --write-tree main 5aca298` da `CONFLICT (content): Merge conflict in docs/state.md`.
- **Escenario:** el merge se resuelve tomando una versión entera, como pasa a menudo.
  - Con la de la rama, desaparecen el hallazgo abierto «T-051 B2 (BAJA)» y los datos de integración de T-047 y T-051.
  - Con la de `main`, siguen abiertos «T-023b N1 (MEDIA)» y «`/facturacion` a 360 px», aunque este ticket los cierra.
- **Qué hacer:** resolver a mano. Hay que partir de la versión de `main`, quitar las dos líneas de hallazgo y poner T-052 como integrado.

## Lista «Qué revisar» del diseño (§5), punto por punto

- `focoTrasExito.current = true`: aparece una sola vez, en la rama de éxito de `enviar` y antes de `setAbierto(false)`. Cumple.
- Efecto `[disponible, aviso]`: exige marca, `!disponible` y `aviso !== ''`, y apaga la marca antes de `focus()`. Con `disponible === true` no la apaga (D1). Cumple.
- Excepciones del `focusin`: son exactamente `disparador.current` y `estado.current`. El oyente se registra con `[]` y se quita en la limpieza. `abrir()` apaga la marca en su primera línea. Cumple.
- `acciones-factura.tsx` no se toca, y `disponible` sigue siendo `cobrosSinFactura > 0`. Cumple.
- Contra el `asignar-cobro.tsx` de la base (`a9b5903`), medido en una copia con `git archive`: falla solo `F1 antes que F2`, con `Expected: "región de F1"` y `Received: "región de F2"`. `F2 antes que F1` sigue verde. Cumple.
- Líneas 1-74 de `acciones-factura.test.tsx`: la única línea que cambia es el `import` de la `:2`, para añadir `beforeEach`. El cuerpo de H1 no cambia y el `beforeEach` vive dentro del `describe` nuevo. No tiene efecto observable.
- `bloques.tsx`: solo `min-w-0` en la `Tarjeta` de `MarcoFacturacion`. Ni `Tarjeta` ni `page.tsx` cambian, y no hay ninguna unitaria que mire la clase. Cumple.
- Paso 11 del spec:
  - selecciona por `aria-labelledby` los dos `id` de la rejilla;
  - espera a que no quede `Cargando`;
  - inyecta y mide en un solo `evaluate`;
  - comprueba los controles antes del desborde;
  - no lleva `ejecutarSql`.

  Cumple.
- `git diff --stat a9b5903...5aca298 -- supabase/ scripts/rls/` sale vacío. Cumple.
- `state.md`: salen «T-023b N1» y «`/facturacion` a 360 px». La bitácora enlaza T-023 B-H3. Cumple, salvo el conflicto de H1.

## Mutantes (vitest, en una copia de `5aca298`, `app/(app)/facturacion/`)

| Mutante | Resultado |
|---|---|
| sin oyente `focusin` | rojo: `F1 antes que F2` |
| `focusin` sin la excepción del disparador | rojo: H1 y los dos casos de N1 |
| dependencias `[disponible]` sin `aviso` | rojo: el caso C |
| apagar la marca con `disponible === true` (lo contrario de D1) | rojo: H1 y los dos casos de N1 |
| efecto sin `focoTrasExito.current` (el código de `main`) | rojo: `F1 antes que F2` |
| efecto sin `disponible` | rojo: los dos casos de N1 y «con éxito cierra, devuelve el foco» |
| `focusin` sin la excepción de la región | verde, equivalente: la región solo se enfoca desde el efecto, que ya ha apagado la marca, o con un clic sobre ella, donde el foco ya está en el destino |
| `abrir()` sin apagar la marca | verde, equivalente: `Dialogo` enfoca siempre la «X» al abrir, y ese `focusin` ajeno la apaga |
| el efecto enfoca sin gastar la marca | verde, equivalente: la marca solo vuelve a contar si `disponible` pasa a `true` y luego a `false` sin que el foco salga de la región, y eso no lo produce ninguna ruta |
| sin `aviso === ''` | verde, equivalente: la marca y un aviso vacío no coinciden nunca, porque `abrir` apaga una y vacía el otro |
| marca armada también en la rama de rechazo | verde, equivalente: el rechazo lleva el foco al selector (`pedirFoco`) y ese `focusin` la apaga |

Los cinco supervivientes son redundancia defensiva sin un escenario que los distinga. No los abro como hallazgo.

## Paso 11: el mecanismo, medido aparte

Lo he medido sin tocar la base: Chromium a 360 px con `page.setContent`, reproduciendo la rejilla, los dos marcos, el `li` en columna de «Por paciente» y el `li` en fila de «Últimos cobros», con el mismo bloque inyectado.

| Caso | Desborde |
|---|---|
| sin `min-w-0` | 442 px |
| con `min-w-0` en los dos marcos | 0 |
| `min-w-0` solo en el primer marco | 442 px |
| `min-w-0` solo en el segundo marco | 338 px |
| sin `min-w-0`, con el bloque inyectado solo en el marco de cobros | 442 px |
| sin `min-w-0`, con el bloque inyectado solo en el de pendientes | 338 px |

Cada inyección basta por sí sola: el `overflow:hidden` dentro del `li` en fila no absorbe el mínimo de contenido. El paso detecta también un arreglo aplicado a un solo marco.

## Lógica del foco: escenarios recorridos sin fallo

- Órdenes A, B y C del diseño.
- Fila hermana con un aviso viejo, tanto con teclado como con ratón en Safari, donde el clic no enfoca. En los dos casos, la «X» del diálogo de la otra fila genera un `focusin` ajeno.
- Doble montaje de efectos en StrictMode.
- Error y rechazo de red.
- `cobroYaEstaba`.

No encuentro ninguna ruta de la aplicación que reduzca `cobrosSinFactura` sin que el foco entre antes en otro control.

## Territorio

`territorio.mjs T-052 --base a9b5903` señala solo `.claude/qa.json`. Es un fichero sin seguimiento del entorno de QA y también aparece sin seguimiento en el directorio principal. No está en ningún commit de la rama. La pasada sin `--base` compara contra un `origin/main` antiguo (`adc87ad`) y da 1228 ficheros que son ruido.
