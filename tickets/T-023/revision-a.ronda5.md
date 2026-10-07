**Sin hallazgos ALTA.** Revisor A, ronda 5: 0 ALTA, 0 MEDIA, 0 BAJA.

# T-023 · Revisión A · Ronda 5 (acción, datos y constitución)

Rama revisada: `worktree-agent-aaa4e03b1bd13834a` (5604fa0), comparada con `worktree-agent-af4665097e6d61770` (afcc774). No he leído `evidencia.json` ni el informe del implementador.

## Qué medí
- Una copia hecha con `git archive` de 5604fa0, con un junction a `node_modules` que quité al acabar. Línea base: `acciones.test.ts` y `page.test.tsx` en verde (30/30).
- Mutantes M35, M36 y M40, más seis mutantes míos sobre las salidas de la acción. Para cada uno, la prueba que cae y por qué cae.
- `docs/state.md` de la rama frente al bloque literal de R5.4 del diseño, comparado línea a línea con node.
- `git diff --stat` del rango sobre `supabase/`, `lib/supabase/` y `scripts/`, y un grep de `.update(`, `.delete(`, `.upsert(`, `UPDATE` y `DELETE` en las líneas añadidas.

## R5.6, punto por punto (revisor A)

1. **`cobroYaRegistrado` solo sale de una fila propia.**
   - Sale en dos sitios, y en los dos hay una fila propia: `acciones.ts:61-63` (2b, `previa && !errorPrevia`, con lectura `.eq('registrado_por', usuario.id)`) y `:131-133` (relectura tras el 23505, `propio`).
   - `errorPrevia` sigue adelante. La relectura con error da `resultadoDesconocido` (`:126-129`). La relectura sin fila cae en `fallo()` (`:137-138`).
   - Mutantes de comprobación, que caen todos con la prueba que nombra esa rama:
     - la relectura con error devuelve «ya estaba» → cae «23505 … con error al releer es resultadoDesconocido»;
     - `if (propio)` → `if (true)` → cae «23505 … sin fila propia visible es el mensaje genérico»;
     - `previa || errorPrevia` → cae «la consulta previa falla (57014)».
   - Resultado: **OK**.
2. **Las dos salidas «ya estaba» revalidan y no insertan. El alta nueva sigue con `cobroRegistrado`.**
   - `:62` y `:132` llaman a `revalidatePath('/facturacion')`. El 2b vuelve antes del insert. La relectura viene después de un insert que ha fallado.
   - Quité cada una de las dos llamadas y en los dos casos cae su prueba (`revalidatePath` toHaveBeenCalledWith).
   - En el alta nueva (`:143`), cambiar el texto a `cobroYaRegistrado` tumba 4 pruebas: la devolución de -20,00, la gemela de Madrid, la de `fusionado_en` null y la de la consulta previa que falla.
   - La prueba del 23505 propio añade `insertar` toHaveBeenCalledTimes(1). Así queda claro que pasa por la relectura y no por el 2b: el doble devuelve `previa` en la primera llamada y `existente` en las siguientes.
   - Resultado: **OK**.
3. **No hay oráculo nuevo.**
   - Las dos lecturas filtran por `registrado_por = usuario.id`. Con un id ajeno, el 2b no encuentra nada, la acción sigue por las guardas y el insert, y después del 23505 la relectura tampoco encuentra nada: `fallo()`, igual que en R4.
   - El texto nuevo solo distingue entre ids propios, y esos la sesión ya los conoce.
   - La huella (`esquemas.ts:89-98`) cubre los mismos campos que se guardan (paciente, céntimos, fecha, forma, referencia y motivo solo si es negativo). Desde la interfaz no se llega a un «ya estaba» con datos distintos de los guardados.
   - Resultado: **OK**.
4. **`state.md`.**
   - El subpunto de A-H2 coincide byte a byte con el bloque de R5.4.
   - Es el último subpunto del grupo, y el grupo se llama ahora «T-023, fuera de alcance (R2.7, ronda 3 y ronda 4)».
   - Las líneas 11 y 21 coinciden con las de R5.4.
   - `grep -c "A-H2 de la ronda 4"` = 1. `wc -l` = 61 (≤ 80).
   - El texto describe bien el código: `cobros_lectura` sigue sin rama por `registrado_por`, y la salida es `noSePudoRegistrar` = «No se ha podido registrar el cobro».
   - Resultado: **OK**.
5. **Constitución (regla 6).**
   - En `supabase/`, `lib/supabase/` y `scripts/` no cambia nada.
   - Entre las líneas añadidas, el único `.delete(` es `claves.current.delete(huella)`, que es el `Map` del cliente. No hay `UPDATE`, `DELETE`, `upsert` ni migraciones.
   - Resultado: **OK**.

## Mutantes que me tocan (los medí, no me fié de `mutantes.json`)

| Id | Prueba que cae | ¿Cae por el motivo correcto? |
|---|---|---|
| M35 | `acciones.test.ts` · «clave propia ya registrada y paciente fusionado» (1 roja de 30) | Sí: `toEqual` con `cobroYaRegistrado`, por el camino del 2b (`previa` con fila, sin `select` de pacientes). |
| M36 | `acciones.test.ts` · «23505 de cobros_pkey con el cobro propio ya registrado…» (1 roja de 30) | Sí: el 2b no encuentra fila, se inserta una vez y sale por la relectura. |
| M40 | `page.test.tsx` · «la isla se monta igual, con pacientes null» (1 roja de 8) | Sí. La misma prueba también tumba mi variante `: []` en lugar de `: null`, porque `props` se compara con `toEqual({ pacientes: null, … })`. |

El paso 9 del spec también ataca M35 (el reintento entra por el 2b), pero no lo he ejecutado: eso le toca al verificador.

## Hallazgos A de la ronda 4

- **A-H1 (BAJA, «ya estaba» dicho como un alta nueva): cerrado.**
  - La confirmación por clave tiene ahora su propio texto en las dos salidas (lo prueban M35 y M36). El cliente trata ese texto como éxito y olvida la clave, así que el siguiente cobro idéntico entra con un id nuevo.
  - Lo que queda es que el usuario tiene que volver a registrar un cobro idéntico y legítimo después de leer el aviso. Es un riesgo explícito y aceptado en R5.1. Ya no hay confirmación falsa.
  - La parte del cliente (`MENSAJES_DE_EXITO`, `delete` de una sola huella) es del revisor B.
- **A-H2 (BAJA, visibilidad perdida entre el envío y el reintento): cerrado como riesgo aceptado.** Está anotado letra por letra en `docs/state.md`, en el grupo que pedía R5.4.

## Fuera de mi alcance, sin hallazgo
- El título de la prueba de `acciones.test.ts:336` todavía dice «éxito», aunque ahora espera `cobroYaRegistrado`. No hay ningún escenario en el que falle, así que no lo cuento como hallazgo.
- `formulario-cobro.tsx:44`, `OPCIONES_FORMA =FORMAS_DE_PAGO`: le falta un espacio. Eso es formato, y el proyecto no tiene Prettier en su configuración. ESLint sale limpio en los cuatro ficheros de la acción, la página y la isla.
