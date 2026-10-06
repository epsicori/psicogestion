Sin hallazgos ALTA. 3 MEDIA, 3 BAJA.

# Revisión T-048 · Documentación pendiente agrupada por paciente

Diff: `git diff main...worktree-agent-af1ed1158ecefddd4` (HEAD 38f78d3, 29 ficheros, base 361a539).
Las líneas citadas son las del worktree. Los mutantes se analizaron leyendo el código: no se
midieron, porque el verificador estaba trabajando en el mismo worktree y no lo toqué.

## Lo que se miró con lupa y está bien

- **El doble de PostgREST** (`lib/citas/agenda.test.ts`): cada método es un `vi.fn` declarado y
  uno desconocido lanza `TypeError`. Afirma `select(…, {count:'exact'})` y `range(0, 999)`.
  Cubre `count: null`, `tipos: []` sin `from` y las tandas de 100 con 250 ids.
- **Criterio 9** (`resolver-alerta.test.tsx:168-217`): el caso (a) comprueba que el foco no se
  mueve antes del `rerender`. El caso (b), con el paciente del medio, fallaría si se enfocara
  pronto.
- **`documentacion.test.tsx:26-60`**: solo cambia el identificador del mock; ninguna aserción
  se toca.
- **`tiposConsultados`**: devuelve `[]` con un tipo que está fuera de la lista del rol
  (`pendientes.test.ts:58`, `contenido.test.tsx` «al técnico…»).
- **D8**: `destinoPendiente` mira el rol, de modo que el técnico y el rol nulo van a la ficha.
  El panel del técnico no lleva `/historia`.
- **El término**: no llega a la URL, al historial, a `localStorage` ni a las cookies
  (`buscador.test.tsx:201`, y el spec de Playwright lo mide en el navegador). Tampoco aparece en
  los argumentos de los lectores. El formulario no lleva ni `method` ni un `action` de cadena
  (`buscador.test.tsx:84`).
- **Animación**: no hay ningún `animate-*`; solo el `rotate-180` del chevron, que es un cambio de
  estado sin transición. Tampoco hay `localStorage`.
- **T-047**: ningún fichero suyo se toca. Los 29 ficheros están dentro del `territorio:` del
  contrato. `es.ts` solo cambia bajo `agenda.documentacion.*`.
- **Desvíos declarados**:
  1. El input controlado está justificado, porque React 19 resetea el formulario tras la acción.
  2. `ORDEN_TIPOS` duplicado vía `Constants` es aceptable: evita arrastrar `bloques.ts` al cliente.
  3. El ajuste de estado durante el render en `ProveedorResolucion` es válido en React 19, y el
     efecto solo toca el DOM.
  4. Las pruebas de `parametros` escritas a la vez: sin consecuencia visible.

  Ninguno es un hallazgo por sí mismo. El H1 no viene de ellos, sino de que falta un reinicio.

## MEDIA

### H1 · La búsqueda sobrevive al cambio de filtro, y los resultados se quedan con los filtros viejos

- **Dónde**: `app/(app)/agenda/documentacion/buscador.tsx:52`, junto con `contenido.tsx:153`.
- **Qué pasa**: `vista`, `estado` (de `useActionState`) y `termino` no se reinician cuando
  cambian `tipo` o `nivel`. Los filtros son `<Link>` a la misma ruta y solo cambian los search
  params. La clave del segmento de página los ignora (`layout-router.js:549`,
  `createRouterCacheKey(…, true)`), así que el `Buscador` no se remonta y conserva su estado.
- **Escenario**:
  1. En `/agenda/documentacion` busco «ana».
  2. Salen 3 pacientes, con pendientes de todos los tipos.
  3. Pulso el filtro «Nota sin firmar».
  4. La URL pasa a `?tipo=nota_sin_firmar` y el filtro sale marcado.
  5. Siguen pintados los 3 resultados calculados sin filtro, incluido el paciente que solo tiene
     un consentimiento. El término sigue en el campo.
  6. Si resuelvo un resultado, `relanzar` (`buscador.tsx:72`) reenvía `ultimoEnvio.current`, que
     lleva los campos ocultos del envío anterior (sin `tipo`).
- **Qué incumple**: el contrato («cualquier navegación… pierde la búsqueda»; «los filtros
  vigentes se aplican a la búsqueda») y el paso 5 del guion manual («cambiar de filtro pierde la
  búsqueda, como dice la ayuda»). La ayuda del campo afirma lo contrario de lo que pasa.
- **Pruebas**: ninguna cubre un cambio de props con la búsqueda activa.

### H2 · D10b no se escribió como se diseñó: la rama de error no prueba que la consola quede limpia

- **Dónde**: `app/(app)/agenda/documentacion/acciones.test.ts:10`.
- **Qué pasa**: el diseño pedía mockear solo `../datos` y usar los lectores **reales** sobre un
  doble de PostgREST que registre cada llamada. Sus casos eran:
  - (4): ningún argumento de `or`/`ilike`/`textSearch`/`filter` lleva el término;
  - (5): con un error de PostgREST forzado, la consola no recibe el término.

  En su lugar, la prueba mockea entero `@/lib/citas/agenda`. La única prueba de consola
  (`:165`) recorre el camino feliz, y la de fallo (`:152`) solo mira el valor devuelto.
- **Escenario**: el mutante que el propio diseño cita en §5 sigue en verde. Consiste en añadir,
  en `acciones.ts:53`, `if (!r.ok) { console.error('buscarPendientes', termino.data, r.mensaje); return { fase: 'fallo' }; }`.
  - Pasa `:152`, que solo compara `{fase:'fallo'}`.
  - Pasa `:165`, porque esa prueba no falla.
  - Efecto: con un 42501 o un corte de red, el nombre del paciente buscado acaba en el log del
    servidor, contra D10.
- **Nota**: hoy el código está limpio. El hallazgo es que la guarda no tiene prueba que la
  sostenga, en el punto exacto que el diseño marcó.

### H3 · D10c sin prueba: nada comprueba que resolver desde un resultado relance la búsqueda

- **Dónde**: `app/(app)/agenda/documentacion/buscador.test.tsx:34`.
- **Qué pasa**: todos los fixtures llevan `resoluble: false` y ninguna prueba pulsa «resolver»
  en un resultado. El caso D10c del diseño pedía comprobar que, con `resolverAlerta` a `ok`,
  `buscarPendientes` se llama otra vez con el mismo `termino`.
- **Escenario**: el mutante `const relanzar = () => {};` (`buscador.tsx:72`), o
  `alAcertar={undefined}` (`:163`), deja la suite en verde.
- **Efecto con el mutante**:
  1. Resuelvo el único pendiente de un resultado.
  2. La lista de resultados no cambia, así que `ProveedorResolucion` nunca ve desaparecer la
     alerta.
  3. El foco no se mueve y no se anuncia nada.
  4. El paciente sigue pintado con su recuento viejo y un botón de resolver que ya no tiene
     alerta detrás.

## BAJA

### H4 · Un término hecho solo de diacríticos coincide con todos los pacientes

- **Dónde**: `app/(app)/agenda/pendientes.ts:316`.
- **Qué pasa**: «´´», «^^», «¨¨» o «``» pasan `esquemaTermino` (2 caracteres tras `trim`).
  `normalizar` los deja en `''` y `palabras` queda vacío. `[].every(...)` da `true`.
- **Escenario**: busco «´´». La acción devuelve los 20 pacientes más urgentes como si
  coincidieran y anuncia «N pacientes coinciden». Medido con node: `coincideBusqueda('´´', 'Ana', 'López') === true`.
- **Alcance**: no filtra nada que la RLS no deje ver ya; es un falso positivo de búsqueda. La
  guarda `nombre === null && apellidos === null` (`:310`) no lo cubre.

### H5 · `eraUltimo` no tiene ninguna prueba que lo distinga de `min(indice, len-1)`

- **Dónde**: `app/(app)/agenda/resolver-alerta.tsx:90`.
- **Qué pasa**: la prueba «(b) era el último» (`resolver-alerta.test.tsx:207`) quita un paciente
  de una lista que se acorta en uno, y ahí las dos ramas dan el mismo vecino.
- **Escenario**: el mutante `eraUltimo: false` (`:108`) queda en verde.
- **Efecto**: el caso que lo justifica (riesgo 4 del diseño) es resolver el único paciente de la
  página 3. La redirección lleva a la página 2, de 20 pacientes, y el estado se conserva. Con el
  mutante, el foco va a `pacientes[0]`, el primero de la página 2, en vez del último.

### H6 · El panel solo comprueba que pide 6 nombres, no que sean los 6 que pinta

- **Dónde**: `app/(app)/agenda/documentacion.test.tsx:231`.
- **Qué pasa**: el diseño (criterio 10) pide que reciba «**exactamente** los 6 ids pintados», y
  la prueba afirma `toHaveLength(6)`. Como el mapa de nombres de esa prueba no trae ninguno de
  los 8, todos se pintan como «Paciente» con cualquier mutante.
- **Escenario**: el mutante `leerNombresPacientes(sesion, grupos.slice(-6).map(…))`
  (`documentacion.tsx:79`) queda en verde. En producción, con 8 pacientes, los 2 más urgentes
  salen como «Paciente» sin nombre y se piden los nombres de 2 que no se pintan.
