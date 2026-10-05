# T-045 · Revisión (un revisor, riesgo bajo)

**Sin hallazgos ALTA.** 0 ALTA · 0 MEDIA · 3 BAJA.

Diff revisado: `git diff main...worktree-agent-add3f6ad417ca678e -- . ':!tickets'` (7 ficheros, la
base común es `80b6a06`, que es `main`). Territorio: los 7 están en `territorio:`; `supabase/` y
`scripts/rls/` no se tocan.

## Lo que se pidió mirar

- **`directorio_perfiles` no expone más de lo necesario**: la consulta pide solo `id, nombre_completo`
  y el cargador mapea a `{ valor, etiqueta }` antes de pasarlo al formulario cliente: aunque el
  `select` se ensanchara, al navegador solo llegan esas dos. No sale `rol`, `centro_id` ni
  `motivo_estado` (la vista no lo tiene). Bien.
- **Error de lectura frente a lista vacía**: `error` da `console.error` + `{ ok: false }`, y las dos
  páginas pintan `role="alert"` con la clave nueva. C2 lo fija con `toEqual({ ok: false })` (M4
  cae). Bien.
- **Docstring de `reponer-totp/page.tsx`**: ha quedado inexacto (H1).
- **`docs/state.md`**: la rama cambia una sola línea, la del hallazgo que el contrato manda quitar,
  por el hallazgo que el contrato manda añadir. No borra ningún otro hallazgo de `main`. Los
  cambios sin confirmar de `main` en `state.md` están en otros tramos (cabecera, «Dónde estamos»,
  «Siguiente paso»): no chocan. Un detalle de redacción en H3.

## BAJA

### H1 · `app/(app)/ajustes/reponer-totp/page.tsx:18`: el docstring dice que RLS decide quién sale, y ya no es así
«La lista de perfiles se lee en servidor; RLS decide cuáles ve quien mira.» Antes era cierto (y por
eso la lista salía vacía). Ahora la página lee `directorio_perfiles`, que es `security_invoker = false`
(`20260822160000_rls_funciones_y_politicas.sql:1390-1399`): la RLS de `perfiles` no se aplica y el
único filtro es `rol_actual() is not null`. Quien filtra es la vista, no RLS.
**Escenario**: alguien quiere que el técnico no salga en «Reponer TOTP» y, fiándose del comentario,
añade una política de lectura sobre `perfiles` → la lista no cambia, porque la vista definer no la
consulta. Arreglo: «se lee de `directorio_perfiles` (definer: todo perfil con rol la ve entera);
quien decide si la acción procede es la RPC».

### H2 · `app/(app)/ajustes/perfiles-activos.test.ts:12-27`: ninguna prueba fija el orden por nombre
El simulado resuelve en `order()` sin mirar su argumento, y C1 solo comprueba «el orden recibido».
El paso 2 del guion pide «por orden alfabético», y eso solo lo mira el navegador.
**Escenario (medido)**: con `.order('nombre_completo')` → `.order('id')` en `perfiles-activos.ts:21`,
`npx vitest run "app/(app)/ajustes/perfiles-activos.test.ts"` sale `5 passed`. En producción, el
desplegable sale ordenado por uuid. Arreglo: que el simulado apunte `['order', columna]` en `filtros`
y que C1 compruebe `['order', 'nombre_completo']`.

### H3 · `docs/state.md:31`: el hallazgo nuevo lleva el estado del ticket, que caduca con el merge
La línea termina en «T-045 (dar de baja y reponer TOTP leen la vista) pendiente de verificación y
merge». Esa frase es estado del ticket, no del hallazgo.
**Escenario**: se hace el merge y nadie reescribe esa línea → `state.md` (que debe hablar solo del
presente) dice que T-045 está pendiente cuando ya está integrado, en la misma sección que el
documentalista copia al siguiente ticket. Además, «la usan tres pantallas de administrador» deja
fuera a otros lectores de la vista que están en `main` (`contenido-alta.tsx`, en la línea 28 del
mismo fichero, y las RPC de agenda `20260926120000:163` y `20261007120000:1560`). El módulo de RLS
que se escriba con esta línea como encargo podría probar solo al administrador. Arreglo: quitar la
cola de estado y decir «la usan las pantallas de administrador y el alta de citas».

## Lo que miré y está bien

- C1 usa `toEqual(['directorio_perfiles'])` (M1 cae) y `toContainEqual(['eq','estado','activo'])`
  (M3 cae; también caería `.eq('estado','baja')`).
- C4 no casa con la línea del `import` (`cargarPerfilesActivos }` no lleva `(`): exige la llamada.
- Las filas nulas se descartan antes de comparar con `propioId`; el propio se quita después.
- `es.ts`: solo la clave del contrato, en el bloque `ajustes.resultados`.
- Las comillas dobles de `t("totp.titulo")` / `t("baja.titulo")` siguen sin tocar, como pide el contrato.
