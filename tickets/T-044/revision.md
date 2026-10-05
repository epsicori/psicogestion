**Sin hallazgos ALTA.** T-044 · revisión (riesgo bajo, un revisor): 0 ALTA · 0 MEDIA · 2 BAJA.

Diff revisado: `git diff main...worktree-agent-a2503e149e4dbf753 -- . ':!tickets'` (9 ficheros, d037af6; base común = `main` a61a568).

## Lo que se pidió mirar

- **El enlace sale solo con factor verificado**: `app/primera-vez/segundo-factor.tsx:291` lo envuelve en `{factorVerificadoId && (…)}` dentro del `return` final, la vista del formulario. Las vistas de fallo (`:172`) y de códigos (`:212`) son `return` tempranos y no lo llevan. Con factor verificado, además, no se llega a ninguna de las dos: `verificar()` hace `router.refresh()` y sale (`:152-155`) antes de `generarCodigos()`. En la activación (`factorVerificadoId === null`) no sale. Correcto.
- **Mutación «enlace sin condición»**: medida en la rama con un mutante real. `{true && (` → «al enrolar un factor nuevo no sale el enlace» falla (1 failed | 15 passed). `{factorId && (` también falla. El mutante `{!enrolamiento && (` sobrevive (16/16): ver H1.
- **Foco y tabulación**: `/primera-vez`: código → «Verificar» → enlace. «Verificar» está `disabled` mientras no haya seis dígitos, así que quien no tiene número llega al enlace con un solo Tab desde el campo. `/recuperar`: código → «Usar el código» → «Volver…», como último hijo del `<form>`. Es un `Link`, así que no envía el formulario. Ningún efecto de foco nuevo.
- **Tamaño táctil**: `min-h-11` es 2,75 rem = 44 px (Tailwind 4 sin `--spacing` propio en `app/globals.css`) y cumple ADR-044 («objetivos táctiles de 44 px»). Se usan las clases exactas del contrato. La medida a 360 px queda como comprobación manual, y la bitácora lo dice.
- **Caso C de Playwright (encabezado en vez de URL `/primera-vez`)**: está justificado y no esconde ningún fallo. `app/login/acciones.ts:50` hace `redirect('/pacientes')` desde una Server Action, y `proxy.ts:105-114` redirige esa petición RSC a `/primera-vez`. Es una navegación suave y la barra puede quedarse en `/pacientes`, el mismo motivo y el mismo comentario que el precedente `accesibilidad/codigos-recuperacion.spec.ts:120-122`. El encabezado «Verificación en dos pasos» prueba que se pintó `SegundoFactor`. El clic siguiente en el enlace por su nombre accesible prueba la rama con factor, porque en la otra rama el enlace no existe y `click()` agotaría el tiempo. Los casos A y B y `abrirRecuperar()` quedan intactos: el diff solo añade al final. El hueco documental está en H2.
- **`docs/state.md` no borra hallazgos de main**: la base común es el `main` actual (a61a568). `git diff main worktree-agent-a2503e149e4dbf753 -- docs/state.md` solo quita la línea «`/recuperar` sin enlace», que es la que el contrato manda cerrar.

## Además

- Territorio: `node ~/.claude/pipeline/territorio.mjs T-044` da 9 ficheros, todos dentro. En `lib/i18n/es.ts` solo están las dos claves del contrato, en su sitio. En `docs/interfaz.md` solo está la sección nueva, entre «Mi cuenta» y «De dónde sale cada pieza».
- `npx vitest run` de los dos `.test.tsx`: 20/20. `lib/i18n` (incluido `sin-literales`): 118/118. `eslint` sobre `app/primera-vez`, `app/recuperar` y el spec: sin salida. Playwright no se ha ejecutado: exige `db reset` y no se hace en revisión.
- Constitución: sin base, sin acción, sin sesión nueva. Nada clínico ni económico. Sin nombres en la URL.

## BAJA

### H1 · `app/primera-vez/segundo-factor.test.tsx:345` · la negativa solo mira un estado de la rama sin factor

La prueba (b) espera al QR y comprueba que no hay enlace solo con el enrolamiento ya hecho. Los otros dos estados de la rama `factorVerificadoId === null` no se miran: «Cargando…» antes de que responda `enroll()`, y el fallo de `enroll()` con `primeraVez.totp.noSePudoEnrolar`.

**Escenario**: alguien reescribe la guarda como `{!enrolamiento && (` (por ejemplo, «el enlace solo cuando no hay QR»). Medido en la rama: 16/16 en verde. En producción, con Auth caído, `enroll()` devuelve error y quien está activando su primer factor ve «No se pudo preparar la verificación…» junto al enlace a `/recuperar`. Esa persona aún no tiene códigos (ADR-039, T-037), así que es un control sin acción real detrás, justo lo que el contrato prohíbe. Arreglo: un tercer caso con `enroll.mockResolvedValue({ data: null, error: {…} })` que espere el texto de `noSePudoEnrolar` y niegue el enlace.

### H2 · `accesibilidad/recuperar.spec.ts:164-169` · el caso C se aparta del criterio 4 y la decisión solo vive en un comentario del spec

El criterio de aceptación 4 dice «El caso entra con contraseña y espera la URL `/primera-vez`». El spec espera el encabezado, por un motivo válido (ver arriba), pero `docs/bitacora/T-044.md` no recoge la desviación.

**Escenario**: el verificador o el propietario cotejan el criterio 4 contra el spec al pie de la letra. O lo marcan como no cumplido, o lo «alinean» con `await expect(pagina).toHaveURL(/\/primera-vez/)`, y entonces el caso C falla de forma intermitente cuando la barra se queda en `/pacientes`, como documenta `codigos-recuperacion.spec.ts:120-121`. Arreglo: una línea en la bitácora («criterio 4: se espera el encabezado y no la URL, por la navegación suave del proxy; precedente `codigos-recuperacion.spec.ts:120`»).
