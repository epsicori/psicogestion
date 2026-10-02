**Sin hallazgos ALTA (ronda 3, sobre `202934a..ea91ac3`).** Abiertos: 0 ALTA · 0 MEDIA · 4 BAJA (R2-H3, R2-H4, R3-H1, R3-H2; A-H3 trasladado). Detalle en «Ronda 3», al final.
Ronda 2 (`bd3b1b7..75befdd`): 0 ALTA · 1 MEDIA · 3 BAJA.
Ronda 1 (`44d6d67..9b9bbb9`): 0 ALTA · 1 MEDIA · 3 BAJA (A: 1 MEDIA y 2 BAJA; B: 1 BAJA).

# T-037 · Revisión A (seguridad): diff `44d6d67..9b9bbb9`

> Revisor A, 02-10-2026. He leído el diff, el contrato, `diseno.md` (§5 y la enmienda P-3), `CLAUDE.md` y ADR-039.
> No he leído `evidencia.json` ni el informe del verificador. Las mediciones se hicieron sobre una copia `git archive`
> de `9b9bbb9` en el *scratchpad*, construida con `next build --webpack` porque Turbopack rechaza la unión
> `node_modules`. La base local es la compartida y la copia ya está borrada. Lo único que queda son dos usuarios
> `t037-*` inertes en la base local, que el siguiente `db reset` quita.

## Hallazgos

### MEDIA

**A-H1 · `app/primera-vez/segundo-factor.tsx:120-125`. Si `generarCodigos` falla al activar, el aviso no se llega a ver. Desde T-037 el usuario se queda sin códigos para siempre y sin saberlo.**
La rama `!resultado.ok` hace `setMensaje(...)` y justo después `router.refresh()`. El refresco vuelve a pintar
`PasoPendiente`, la sesión ya es `aal2` y `page.tsx:44` pinta `<FormularioPin/>` en lugar de `SegundoFactor`. El
componente se desmonta y el mensaje desaparece con él. La premisa de D8 («avisa y deja seguir»; el propietario
aceptó P-1 sobre ella, «el administrador repone») es falsa en la práctica: el usuario no sabe que tiene que
pedir la reposición. Antes de T-037, la siguiente entrada regeneraba el lote por accidente y el fallo se
curaba solo. Con el arreglo (`:112-116`), ninguna entrada posterior genera.
- **Escenario (medido)**: copia de `9b9bbb9` con `generarCodigos` forzada a `{ ok:false, mensaje:'SONDA-FALLO-CODIGOS' }`
  y una sonda Playwright con usuario propio. Al activar: verify correcto → aparece «Tu PIN de historia» → 1,5 s
  después, `getByText('SONDA-FALLO-CODIGOS').count() = 0` y `codigos_recuperacion_totp` del perfil = **0 filas**. La
  siguiente entrada va por la rama `factorVerificadoId !== null` y no genera nada. Cuando el usuario pierda el
  móvil, el canje devolverá `sin_codigos`, y es la primera vez que se entera.
- Causas reales de `ok:false` en la activación: un error transitorio de la base o de PostgREST, o
  `rol_actual()` nulo. El mismo estado final (factor verificado y 0 códigos) se da si la pestaña se cierra entre
  el `verify` y la llamada a la acción.
- No pide `supabase/`: basta con no refrescar en `ok:false` y dejar el aviso hasta que el usuario pulse para
  seguir. Si no se arregla, hay que corregir la frase de D8 y anotarlo en `state.md`.

### BAJA

**A-H2 · `accesibilidad/codigos-recuperacion.spec.ts:138-141`. El spec da de alta y **confirma** un usuario en el primer `supabase_db_*` que liste `docker ps`, aunque sea de otro proyecto.**
`localizarContenedor()` (`scripts/psql.mjs:17-19`) toma la primera línea que encaja con `^supabase_db_`, y
`docker ps` ordena por fecha de creación, de la más reciente a la más antigua. Hasta ahora sus consumidores
(`test:rls`) terminaban en `rollback`. Este spec es el primero que hace `commit` en `auth.users`/`auth.identities`.
- **Escenario (estado real de esta máquina hoy)**: están en marcha `supabase_db_Psicogestion` (creado el
  02-10 a las 11:52) y `supabase_db_cinfa-e2e` (29-09). Si se reinicia `cinfa-e2e` después de la base de Psicogestión,
  S0 inserta en la base de **otro proyecto** un `profesional_sanitario` con la contraseña conocida `psico1234`. Esa
  base tiene un disparador propio sobre `auth.users`. Después, `entrar()` agota el tiempo, porque el GoTrue de
  Psicogestión no conoce al usuario: el spec sale rojo, pero la escritura ajena ya está confirmada. No hay falso verde.
- El defecto de base está en el ayudante, que es anterior y queda fuera del territorio. Lo que hace este diff es
  convertirlo en una escritura persistente. Arreglo barato dentro del territorio: exigir que la lista de candidatos
  sea única, o filtrar por el `project_id` de `supabase/config.toml`. Si no se arregla, anotarlo en `state.md`.

**A-H3 · `app/primera-vez/acciones.ts:21` (y el RPC, H7). T-037 quita la rotación accidental del lote. Un lote regenerado por quien robó una sesión `aal2` reciente ya no caduca nunca, y el titular no recibe ningún aviso.**
`generarCodigos` sigue siendo un punto de entrada público, igual que el RPC por PostgREST (D4). Su único freno
es `segundo_factor_verificado_recientemente()`, es decir, `aal2` más un reto de hace menos de 5 minutos. Eso
está aceptado (P-2). Lo que cambia con T-037 es la ventana de exposición.
- **Escenario**: un atacante con las cookies de la víctima en los 5 minutos siguientes a su TOTP llama a la acción
  (o hace POST al RPC) y recibe diez códigos en claro. El lote de la víctima queda caducado sin que ella lo sepa.
  Antes de T-037, la siguiente entrada de la víctima caducaba el lote del atacante. Ahora sigue vigente
  indefinidamente. Si además tiene la contraseña, lo canjea, se borra el factor (`lib/cuentas/totp.ts:85-87`) y
  enrola el suyo. La auditoría registra las 20 filas (`auditar_codigos_recuperacion_totp`), pero nadie avisa al titular.
- No es un fallo del arreglo: ADR-039 manda exactamente esto. Lo apunto para el ticket de «regenerar mis
  códigos» (P-1): que una regeneración fuera de la activación notifique al titular, como ya hace
  `registrar_reposicion_totp()`.

## Lo que pidió el orquestador, punto por punto

1. **`codigo-totp.ts` sin `server-only` en un bundle de cliente.** No es un hallazgo. Solo lo importan
   `modo-desarrollo.ts` (con `server-only`) y el spec. El cuerpo es idéntico al que se movió: sin `process.env`, sin
   `FACTORES_SEMBRADOS`, sin `'use server'`. Si algún día lo importara un componente cliente, solo se llevaría una
   función pura sin secretos, y `node:crypto` rompería el build del navegador antes de llegar a producción.
   Comprobado: el `.next` del worktree se construyó a las 11:47, después de `9b9bbb9` (11:46), y
   `grep -rlE "SEGUNDO_FACTOR_AUTOMATICO_LOCAL|SEMILLATOTPDEMO|codigoTotp|decodificarBase32|alfabeto base32" .next/static`
   devuelve exit 1.
2. **`router.refresh()` temprano.** La guarda decide con el dato del servidor (`page.tsx:38-41`, `status === 'verified'`),
   y `SegundoFactor` solo se monta ahí. **No hay camino por el que un usuario sin factor verificado se salte la generación.**
   La duda era que un error de `listFactors()` tragado como `null` acabara en la rama de activación y regenerara.
   Lo medí contra el GoTrue local (v2.195.0): con un usuario con factor verificado en `aal1`,
   `mfa.enroll` → `403 insufficient_aal «AAL2 required to enroll a new factor»`. Ese camino se queda en
   `noSePudoEnrolar` y no regenera. El camino que sí deja sin códigos a un usuario con factor activo es A-H1.
3. **`generarCodigos` como server action.** Solo la llama `segundo-factor.tsx:118`. La frenan `exigirSesion()` y el
   RPC (sesión, perfil activo, `aal2` y reto en menos de 5 minutos). Con eso se puede regenerar sin pasar por la
   pantalla, pero solo dentro de esa ventana, igual que por PostgREST (D4, P-2). Lo que cambia es la consecuencia
   (A-H3).
4. **ADR-039 y la auditoría.** El diff no toca `docs/`, `supabase/` ni ningún disparador. ADR-039 dice «generados al
   activar», y el arreglo lo cumple por fin. La auditoría deja de escribir unas 20 filas de
   `codigos_recuperacion_totp` en cada entrada. Ninguna pantalla ni ningún guion las lee como señal de acceso
   (`grep codigos_recuperacion app lib components scripts`), así que no se pierde ningún rastro que alguien consuma.

## §5 «Qué revisar», con mediciones

- Condición literal `factorVerificadoId !== null`, después de `if (error)` y antes de `generarCodigos()`: ✔ (`:112-116`).
  `page.tsx` solo cambia en un comentario. Un único sitio monta `SegundoFactor`.
- Mutantes sobre la prueba de componente (`npx vitest run app/primera-vez/segundo-factor.test.tsx`; la base, 3/3 en verde):

  | Mutante | Resultado |
  |---|---|
  | M1 quitar el `return` (refresh y después generar) | muere: caso 1 |
  | M2 invertir la condición | muere: casos 1 y 2 |
  | M3 bloque antes de `if (error)` | muere: caso 3 |
  | M4 quitar `router.refresh()` | muere: caso 1 |
  | M6 quitar el bloque entero | muere: caso 1 |
  | M5 condición `enrolamiento === null` | **sobrevive**. Es equivalente: con `factorVerificadoId` nulo y sin enrolamiento, `factorId` es nulo y `verificar` sale en `:84`. No es un hallazgo. |

- **Spec P7 contra M1** (medido, con build nuevo en `PUERTO=3247`): rojo **en S7** con el mensaje propio y el diff
  `total 10 → 20`, otros `ids` y otro `ultimo`, con `vigentes` y `factores` iguales. Sospechaba que con el refresco
  ya lanzado aparecería el PIN antes de que acabara la acción y el spec saldría verde por la carrera. Medido: no
  pasa, y el spec mata M1.
- El spec no lleva ids ni correos sembrados, no usa `page.evaluate` ni `page.request`, y solo interpola UUID
  comprobados. El alta va en una transacción con `=== 0`. Hay que añadir la salvedad de A-H2 sobre *qué* base.
- P6: los cuerpos son idénticos, `modo-desarrollo.ts` conserva `server-only` y hace la reexportación, y
  `modo-desarrollo.test.ts` no cambia.

---

# T-037 · Revisión B (corrección y pruebas): diff `44d6d67..9b9bbb9`

> Revisor B, 02-10-2026. He leído el diff, el contrato, `diseno.md` (§5 y la enmienda P-3) y `CLAUDE.md`.
> No he leído `evidencia.json` ni el informe del verificador. Mido sobre un worktree desechable de `9b9bbb9`
> dentro del repositorio, con `turbopack.root` apuntando a la raíz principal **solo en esa copia**, porque
> Turbopack rechaza la unión `node_modules` fuera de su raíz. El worktree ya está quitado y la unión, deshecha
> antes. En la base local quedan tres usuarios `t037-*` más, inertes, que se suman a los dos del revisor A.

**Sin hallazgos ALTA (revisor B).** Hay un hallazgo BAJA nuevo (B-H1). Coincido con A-H1, A-H2 y A-H3 y no
los repito. El de A-H2 lo vi por separado: `docker ps` lista hoy `supabase_db_Psicogestion` (creado el 02-10
a las 11:52) delante de `supabase_db_cinfa-e2e` (29-09), y basta con recrear el segundo para que el orden se invierta.

## Hallazgos

### BAJA

**B-H1 · `app/primera-vez/segundo-factor.tsx:120-125`. La rama `!resultado.ok` de la activación no tiene ninguna prueba. Desde T-037 es el único sitio donde nace un usuario con factor activo y sin códigos (A-H1), y cualquier cambio en ella pasa el banco en verde.**
- **Escenario (medido con `npx vitest run app/primera-vez/segundo-factor.test.tsx`)**: el mutante que borra
  `setMensaje(resultado.mensaje)` da **3/3 en verde**, y el que borra `router.refresh()` de esa rama también da
  **3/3 en verde**. El arreglo de A-H1 (no refrescar y dejar el aviso hasta que el usuario pulse) y su
  regresión no se distinguen hoy en ninguna prueba. Tampoco se distingue el estado actual, en el que el aviso
  se desmonta sin verse.
- Lo que hace falta, junto con el arreglo de A-H1: un cuarto caso de P4 con `factorVerificadoId={null}` y
  `generarCodigos.mockResolvedValue({ ok: false, mensaje: 'M' })`. Debe exigir que `'M'` esté visible, que
  `refresh` no se haya llamado antes de la acción del usuario y que «Tus códigos de recuperación» no aparezca.

## Lo que pidió el orquestador, punto por punto

1. **La prueba de componente prueba el CA de verdad.** Partí de una base de 3/3 en verde y medí cada mutante:

   | Mutante sobre `segundo-factor.tsx` | Resultado | Por dónde muere |
   |---|---|---|
   | Quitar el `return` temprano (refresca y después genera) | muere | caso 1, `expected "vi.fn()" to not be called at all, but actually been called 1 times`: el motivo exacto |
   | Invertir la condición (`=== null`) | muere | casos 1 y 2 (el 2, porque no aparece «Tus códigos de recuperación») |
   | Mover el `if` antes de `if (error)` | muere | caso 3: no aparece el aviso `codigoNoValido` |
   | Mover el `if` antes del `verify` (entrar sin verificar) | muere | caso 3 |
   | Quitar el bloque entero (= C2) | muere | caso 1, por el motivo exacto |
   | Generar sin esperar y refrescar (`void generarCodigos(); router.refresh(); return`) | muere | caso 1 |
   | Rama `ok:false`: quitar `setMensaje` o quitar `refresh` | **sobreviven** | B-H1 |

   El caso 1 no tiene el riesgo que el diseño temía en §4.1. `esperarFinDeRama` suma las dos llamadas, y en el
   mutante sin `return` `refresh()` y `generarCodigos()` se llaman en el mismo tick síncrono, así que el `waitFor`
   nunca ve una sin la otra. El mock de `generarCodigos` devuelve valor en `beforeEach`, así que no hay `TypeError`.

2. **El spec P7 prueba el CA2 de verdad.** Hice tres ejecuciones, cada una con `npm run build` propio y un `PUERTO` libre:
   - Mutante sin `return`, sin modo local (`PUERTO=3291`): **rojo en S7** con el mensaje propio,
     `total 10 → 20`, otros `ids` y otro `ultimo`, y con `vigentes` y `factores` iguales. Es el motivo exacto.
   - Mutante «generar sin esperar y refrescar» (`PUERTO=3292`): **rojo en S7** con el mismo diff. Yo temía que,
     con el PIN ya pintado, S7 leyera la base antes de que la acción confirmara el lote y saliera verde por la
     carrera. Medido: no pasa en esta ejecución, y S6 seguido de S7 basta.
   - `9b9bbb9` con `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` (`PUERTO=3293`): **verde** en 10,4 s. El usuario propio
     no se salta `SegundoFactor` con el modo local.

3. **Estado que el spec deja a otras suites.** Deja un `profesional_sanitario` sin centro por ejecución, con su factor y diez códigos.
   - **En paralelo** con `acceso.spec.ts` (`fullyParallel`): no comparten nada. Ese spec solo usa a Ana y no cuenta perfiles.
   - **Antes de `test:rls` sin `db reset`**: busqué en `scripts/rls/*.sql` las cuentas globales sobre `perfiles`,
     `codigos_recuperacion_totp`, `auditoria` y `auth.mfa_factors`. La única sin filtro por id es
     `13-cuentas.sql:117`, que cuenta **administradores** activos, y el spec crea un profesional. El índice único
     global de `auth.mfa_factors.last_challenged_at` (`00-ayudantes.sql:89`) solo chocaría si dos marcas
     coincidieran al microsegundo.
   - **Después de `test:rls`**: el banco acaba en `rollback` y no deja nada.

   No es un hallazgo. R-E4 del diseño queda bien acotado.

4. **Desvío: `waitForURL('**/primera-vez')` cambiado por el encabezado «Verificación en dos pasos»
   (`spec:119-121`).** **No debilita la prueba.** Ese `<h2>` sale de `primeraVez.totp.titulo` (`lib/i18n/es.ts:229`),
   que solo pinta `SegundoFactor`, así que su presencia demuestra justo lo que la URL solo sugería: que el reto
   está en pantalla. Cada uso de `entrar` exige después la rama concreta: el campo «Clave…» en S1, y en S5
   `TEXTO_ENTRAR` con «Clave…» `toHaveCount(0)`. S4 navega a `/primera-vez` de forma explícita. Si el login
   fallara, la espera agotaría el tiempo igual que `waitForURL`, y sería rojo, nunca verde. No he comprobado la
   afirmación del comentario («la URL puede quedarse en /pacientes»). Si es falsa, el desvío sobraba, pero no daña.

5. **Mover `codigoTotp` a `lib/cuentas/codigo-totp.ts` no cambia el comportamiento.** Los cuerpos de `ALFABETO_BASE32`,
   `decodificarBase32` y `codigoTotp` son idénticos línea a línea en el diff. `modo-desarrollo.ts` conserva
   `server-only`, importa la función, la usa en `superarSegundoFactorSembrado` (`:127`) y la reexporta.
   `modo-desarrollo.test.ts` no cambia, y medido junto con P4 da **47/47 en verde**: los vectores RFC 6238 y los
   de Python pasan por la reexportación. `grep codigoTotp|codigo-totp` en `app lib components scripts accesibilidad`
   solo encuentra `modo-desarrollo.ts` y el spec.

6. **Alcance.** Los siete ficheros del diff caen dentro de `app/primera-vez/**`, `lib/cuentas/**` y `accesibilidad/**`.
   No toca `supabase/`, `scripts/`, `lib/i18n/`, `playwright.config.ts`, `package*.json` ni `acceso.spec.ts`.
   El `grep` de ids y correos sembrados del §5 sobre el spec sale vacío. `SegundoFactor` solo se monta en `page.tsx:41`.

7. **Otra puerta a los mismos datos.** Si `listFactors()` falla, `page.tsx:38` se traga el error y monta la
   rama de activación a un usuario que ya tiene factor. Lo medí contra GoTrue v2.195.0 con un usuario `t037-*`
   verificado y una sesión `aal1`: `POST /auth/v1/factors` → `403 insufficient_aal «AAL2 required to enroll a new factor»`.
   El `enroll` falla, se ve `noSePudoEnrolar` y no se regenera nada. No es un hallazgo; el revisor A llegó a lo mismo.

---

# T-037 · Ronda 2 (seguridad y pruebas): diff `bd3b1b7..75befdd`

> Revisor único de la ronda, 02-10-2026, con las dos lentes. He leído el diff (tres commits: `60bcfcb`, `5932d4c`,
> `75befdd`), D8 y §5 del diseño, la revisión de la ronda 1 y `CLAUDE.md`. No he leído `evidencia.json` ni el
> informe del verificador. Mido sobre una copia `git archive 75befdd` en el *scratchpad*, con una unión a
> `node_modules` que ya está deshecha y la copia borrada. Línea base: `segundo-factor.test.tsx` y
> `contenedor-proyecto.test.ts` dan **6/6 en verde**, y `eslint` sobre los cinco ficheros del diff sale limpio.

**Sin hallazgos ALTA.** A-H1 y B-H1 están arreglados en lo que pedían: el aviso se ve y la prueba distingue
la regresión. Quedan 1 MEDIA y 3 BAJA. La MEDIA es el mismo A-H1 para quien usa lector de pantalla. A-H2 queda
cerrado para el spec. A-H3 se traslada al ticket «regenerar mis códigos».

## Estado de los hallazgos de la ronda 1

| Id | Estado | Comprobación |
|---|---|---|
| A-H1 | **Cerrado para quien ve la pantalla**. Sigue abierto para el lector de pantalla (R2-H1). | `ok:false` ⇒ `setFalloCodigos` y `return`, sin `refresh` (`segundo-factor.tsx:122-128`). La vista de aviso (`:134-146`) sustituye al formulario y el `refresh` solo ocurre al pulsar «Aceptar» (`:143`). |
| B-H1 | **Cerrado**. Queda un hueco menor (R2-H2). | Cuarto caso (`segundo-factor.test.tsx:99-120`). Tabla de mutantes abajo. |
| A-H2 | **Cerrado para el spec**. El defecto de base sigue en otros consumidores (R2-H4). | `contenedorDelProyecto()` solo devuelve `supabase_db_<project_id>` si está en `docker ps`, y si no, lanza. |
| A-H3 | **Trasladado** al ticket «regenerar mis códigos» (P-1; ya figura en `docs/state.md`). | Este diff no lo toca. |

## Lo que pidió el orquestador, punto por punto

**A-H1. ¿Hay algún camino a una pantalla de códigos vacía o a un atasco sin salida?** No, medido y leído:
- `ok:false` ⇒ aviso y «Aceptar» ⇒ `router.refresh()`. La sesión ya es `aal2`, así que `primerAccesoPendiente`
  devuelve `'pin'` ⇒ `<FormularioPin/>`. Cambia el tipo de componente, `SegundoFactor` se desmonta y el estado se va con él.
- La vista de códigos solo se pinta con `codigos` no nulo, que solo se fija con `ok:true`. Con `ok:false` no
  hay ningún camino a esa vista: el caso nuevo lo comprueba antes y después de pulsar.
- El único bucle posible es que el servidor vuelva a pintar `SegundoFactor`, que entonces conserva
  `falloCodigos` porque es el mismo tipo en la misma posición. Eso pasa si `getAuthenticatorAssuranceLevel()` falla
  (`nivel` nulo ⇒ `'totp'`). Es transitorio: el siguiente «Aceptar» lo reintenta, y una recarga monta el
  componente de cero (rama «entrar»). No es un atasco ni un hallazgo.
- El `return` temprano va después de todos los hooks (`:134`), así que el orden de hooks no cambia.
- **Cumple D8 («avisa y deja seguir») para quien ve la pantalla. Para el lector de pantalla, no está
  garantizado**: R2-H1.

**B-H1. Mutantes sobre `segundo-factor.tsx`** (`npx vitest run app/primera-vez/segundo-factor.test.tsx`; base 4/4):

| Mutante | Resultado |
|---|---|
| Volver a `setMensaje(resultado.mensaje); router.refresh()` | **muere** en `:114`, `expected "vi.fn()" to not be called at all, but actually been called 1 times`: el motivo exacto |
| Quitar el botón «Aceptar» | **muere** (`getByRole('button', { name: 'Aceptar' })`) |
| `setFalloCodigos(...)` y `router.refresh()` sin esperar a pulsar | **muere** |
| `refresh` en un `useEffect` al fijarse `falloCodigos` | **muere** |
| `setTimeout(router.refresh, 0)` | **muere** |
| El botón no llama a `refresh` | **muere** (`:118`) |
| Aviso con texto fijo en lugar del mensaje | **muere** |
| La vista de aviso no se pinta nunca (`&& false`) | **muere** |
| `setTimeout(router.refresh, 200)` / `3000` (refresco diferido) | **sobrevive**: R2-H2 |
| Quitar `role="status"` del aviso | **sobrevive**: R2-H1/R2-H2 |

Los tres mutantes que pedía el orquestador mueren, y por el motivo exacto. Sobrevive el refresco diferido.

**A-H2. `lib/cuentas/contenedor-proyecto.ts`**:
- **Lectura del TOML** (regex `^project_id\s*=\s*"([^"]+)"` con `m`, probada en node). Acepta comillas dobles con
  o sin espacios, tabuladores, comentario al final de la línea y CRLF. No coge la línea comentada
  `# project_id = "my-firebase-project"` (`config.toml:362`) porque `^` exige la columna 0. No reconoce comillas
  simples (cadena literal TOML), una clave sangrada, una clave entre comillas ni un valor vacío: **todos fallan
  cerrados**, porque lanzan o buscan un nombre que no está en `docker ps`. TOML obliga a que las claves de primer
  nivel vayan antes de cualquier cabecera de tabla, así que un `project_id` de `[auth.third_party.firebase]`
  descomentado nunca puede ser el primero en coincidir.
- **¿Puede elegir otro contenedor?** No. Devuelve `esperado` solo si está en la lista con `===` tras `trim()`, y
  si no, lanza. Docker no admite dos contenedores con el mismo nombre. Las dos pruebas matan «el primero que
  encaje» (caso 1) y «el primero si falta el esperado» (caso 2). Hoy `docker ps` lista `supabase_db_Psicogestion`
  (recreado el 02-10 a las 12:16) y `supabase_db_cinfa-e2e`.
- **¿Puede acabar en un bundle de la app?** No. Los únicos importadores son el spec, su prueba y una sonda sin
  versionar del worktree (ver la nota del final). `node:child_process` haría fallar el build del navegador si
  algún componente cliente lo importara. No necesita `server-only` y no hay escenario de fallo.
- **¿Debe vivir en `lib/cuentas/`?** Es infraestructura de pruebas en una carpeta de dominio. Está ahí porque
  `scripts/` cae fuera del territorio, y su prueba no puede ir en `accesibilidad/` porque Playwright la recogería
  (`75befdd`). Por sí solo no es un hallazgo. Lo que sí lo es: el arreglo duplica `localizarContenedor()` en vez de
  corregirlo, y el defecto sigue en los consumidores que confirman filas (R2-H4).

## Hallazgos de la ronda 2

### MEDIA

**R2-H1 · `app/primera-vez/segundo-factor.tsx:134-146`. Para quien usa lector de pantalla el aviso nuevo no está garantizado: el foco cae en `body` y la región `role="status"` nace con el texto ya dentro. Para ese usuario, A-H1 sigue igual.**
- **Escenario**: el usuario pulsa «Verificar» y `generarCodigos` devuelve `ok:false`. La vista entera se
  sustituye, así que el botón enfocado se desmonta. **Medido** con una sonda en jsdom sobre el caso nuevo: justo
  después de aparecer el aviso, `document.activeElement` es `BODY`. La región `<p role="status">` se monta con
  el texto ya puesto. Una región viva solo se anuncia con seguridad si ya existía antes del cambio, y el propio
  proyecto lo evita así en `app/(app)/agenda/zona-por-confirmar.tsx:15-37`: región `status` persistente y foco a la
  zona cuando su botón acaba de desmontarse. El usuario no oye nada, pulsa Tab, oye «Aceptar, botón», pulsa y
  pasa al PIN sin saber que se ha quedado sin códigos. Es la consecuencia de A-H1 (0 códigos para siempre, sin
  saberlo) para un grupo de usuarios. `docs/interfaz.md:189` pide «anuncio al lector de pantalla de lo que
  aparece o cambia».
- El anuncio con un lector real **no está medido**. El foco en `body` sí, y el mutante que quita
  `role="status"` sobrevive (R2-H2).
- Arreglo dentro del territorio: llevar el foco a la vista de aviso al montarla (un `ref` con `tabIndex={-1}` sobre
  el encabezado o el aviso) y probarlo con `expect(document.activeElement)...` en el cuarto caso. La pantalla de
  códigos (`:148-162`, que no es de este diff) tiene el mismo cambio de vista sin foco. Se anota, no se reabre aquí.

### BAJA

**R2-H2 · `app/primera-vez/segundo-factor.test.tsx:112-118`. El cuarto caso comprueba que no hay `refresh` en el instante en que aparece el aviso, no «hasta que el usuario pulsa». Un refresco diferido pasa el banco.**
- **Escenario (medido)**: con `setFalloCodigos(...); setTimeout(() => router.refresh(), 200)` o con `3000`, el
  banco da **4/4 en verde**. `findByText` resuelve antes del temporizador, y el clic llega antes de que este
  dispare, así que `toHaveBeenCalledTimes(1)` también se cumple. Un «para que no se quede atascado» con un
  autodescarte de 3 s vuelve a A-H1 para quien lee despacio, y no lo caza nadie. Quitar `role="status"`
  también sobrevive.
- Lo que falta: después de `findByText`, avanzar el tiempo (temporizadores falsos o una espera real acotada) y
  volver a exigir `refresh` sin llamar. Y una aserción de ARIA o de foco que acompañe a R2-H1.

**R2-H3 · `lib/cuentas/totp.ts:53` (texto que pinta `segundo-factor.tsx:141`). El aviso dice qué ha fallado, pero no lo que implica ni qué hacer, y no ofrece reintentar aunque la base lo permitiría.**
- **Escenario**: un error transitorio de PostgREST al activar ⇒ «No se pudieron generar los códigos de
  recuperación.» ⇒ «Aceptar». Nada dice que no se volverán a ofrecer ni que hay que pedir la reposición al
  administrador (D8). El usuario supone que se reintentará y, meses después, el canje le devuelve `sin_codigos`.
  Además, durante los 5 minutos de `segundo_factor_verificado_recientemente()` una segunda llamada a
  `generarCodigos()` curaría el fallo transitorio, y la vista no la ofrece. A-H1 pedía que el usuario supiera
  que tiene que pedir la reposición. Hoy sabe que algo falló, pero no eso. El texto vive en `lib/cuentas/`
  (dentro del territorio); un botón «Reintentar» necesitaría una clave en `lib/i18n/` o reutilizar una de `comunes`.

**R2-H4 · `scripts/seed.mjs:29`, `scripts/test-huellas.mjs:19` (fuera del territorio). El arreglo de A-H2 protege solo al spec: `localizarContenedor()` sigue tomando el primer `supabase_db_*`, y otros dos consumidores confirman filas.**
- **Escenario**: si `cinfa-e2e` se recrea después de la base de Psicogestión, `npm run seed` siembra en la
  base del otro proyecto los usuarios de demostración con su contraseña conocida, y `npm run test:huellas`
  (que «confirma filas», según `CLAUDE.md`) escribe en ella su cadena de prueba.
  `contenedorDelProyecto()` duplica la lógica en `lib/cuentas/` en vez de corregir `scripts/psql.mjs`.
- No se arregla aquí (`scripts/` no es del ticket): **anotar en `docs/state.md` §Hallazgos** que
  `localizarContenedor()` debe filtrar por `project_id` y que, una vez hecho, `contenedorDelProyecto()` se sustituye
  por él.

## Regresiones

No encuentro ninguna. Los casos 1-3 siguen en verde. Las ramas «entrar» (`:114-118`) y «códigos» (`:130`, `:148-162`) no cambian, y
`falloCodigos` solo se fija con `ok:false`. En el spec solo cambia de dónde sale el contenedor.

## Nota de proceso (no es un hallazgo del diff)

Cuando revisé, el worktree `agent-aa540ce84292f9170` tenía cambios **sin versionar**: `app/primera-vez/acciones.ts`
con `generarCodigos` forzada a `{ ok:false, mensaje:'FORZADO-FALLO-T037' }` y un `accesibilidad/tmp-ah1.spec.ts`
nuevo (12:19-12:20). Parece la sonda de otro agente. No lo he tocado. Antes de integrar, hay que comprobar que
ninguno de los dos entra en un commit.

---

# T-037 · Ronda 3 (seguridad y pruebas): diff `202934a..ea91ac3`

> Revisor único de la ronda, 02-10-2026, con las dos lentes. He leído el diff (un commit, `ea91ac3`: dos ficheros,
> +48/−2), la revisión de las rondas 1 y 2 y `CLAUDE.md`. No he leído `evidencia.json` ni el informe del verificador.
> No he usado la base ni Playwright. Mido sobre una copia `git archive ea91ac3` en el *scratchpad*, con una unión
> a `node_modules` que ya está deshecha y la copia borrada. El worktree queda limpio (`git status` vacío).
> Línea base: `segundo-factor.test.tsx` da **5/5 en verde**, también en orden aleatorio (`--sequence.shuffle`,
> semillas 1, 2 y 3) y con el caso 5 solo. `eslint` sobre los dos ficheros sale limpio.

**Sin hallazgos ALTA ni MEDIA.** R2-H1 y R2-H2 quedan cerrados en lo que pedían. Hay dos BAJA nuevas, que son
restos de esos dos arreglos (R3-H1 y R3-H2). R2-H3 y R2-H4 siguen abiertos, porque el diff no los toca. A-H3
sigue trasladado.

## Estado de los hallazgos de la ronda 2

| Id | Estado | Comprobación |
|---|---|---|
| R2-H1 | **Cerrado en lo que pedía** (el foco ya no cae en `body`). Lo que queda va a R3-H1. | `useEffect` con `[falloCodigos]` (`segundo-factor.tsx:89-91`) y contenedor `ref` con `tabIndex={-1}` (`:144`). Prueba en `segundo-factor.test.tsx:119-121`. |
| R2-H2 | **Cerrado** para los refrescos de 200 y 3000 ms. Lo que queda va a R3-H2. | Caso 5 (`segundo-factor.test.tsx:128-158`). Mutantes abajo. |
| R2-H3 | **Abierto** (BAJA). | El diff no toca `lib/cuentas/totp.ts` ni la vista del aviso, salvo el foco. |
| R2-H4 | **Abierto** (BAJA). | Fuera del territorio. `docs/state.md:22-23` anota A-H2, pero no dice que `seed.mjs` y `test-huellas.mjs` sigan expuestos. |
| A-H3 | **Trasladado** (`docs/state.md:23,27`). | — |

## Lo que pidió el orquestador, punto por punto

**R2-H1. Foco al montar la vista del aviso.**
- **Llega el foco**: medido en jsdom, en cuanto aparece el aviso `document.activeElement` es el `DIV` contenedor y no `BODY`.
- **¿Roba el foco en otros momentos?** No. El efecto solo corre cuando cambia `falloCodigos`, y ese estado solo
  pasa de `null` a texto una vez por montaje. Su único `set` está en `verificar` (`:134`), y desde la vista del
  aviso no se llega a `verificar` porque esa vista no tiene campo ni botón «Verificar». No hay ningún camino de
  «un valor a otro». Si `refresh` vuelve a pintar el mismo `SegundoFactor` (el bucle de `nivel` nulo de la ronda 2),
  `falloCodigos` se conserva, la dependencia no cambia y el foco se queda en «Aceptar». Si lo desmonta, el estado
  se va con él. En StrictMode el doble efecto de montaje corre con `falloCodigos` nulo y no hace nada.
- **`tabIndex={-1}` con `outline-none`**: no deja ningún control interactivo sin indicador. El contenedor no
  entra en la secuencia de Tab y no se puede activar. El único control de la vista es el `Button` «Aceptar», que
  conserva su anillo de foco. Es el mismo patrón que `zona-por-confirmar.tsx:31`. No es un hallazgo.
- **¿Tiene el lector algo que leer?** Tiene contenido, pero ni nombre ni rol. Medido con `dom-accessibility-api`
  sobre el elemento enfocado: `{ tag: "DIV", role: null, nombre: "", descripcion: "" }`, y el texto del subárbol es
  «Verificación en dos pasos · FALLO-CODIGOS · Aceptar». Ver R3-H1.

**R2-H2. Mutantes sobre `segundo-factor.tsx`** (`npx vitest run app/primera-vez/segundo-factor.test.tsx`; base 5/5):

| Mutante | Resultado | Dónde muere |
|---|---|---|
| `setFalloCodigos(...); setTimeout(() => router.refresh(), 200)` | **muere** | caso 5, `:150`: «to not be called at all» |
| Lo mismo con `3000` | **muere** | caso 5, `:150` |
| `refresh` en un `setTimeout` de 5 s dentro del efecto de foco | **muere** | caso 5, `:150` |
| `refresh` en un `requestAnimationFrame` | **muere** | casos 4 y 5 |
| Lo mismo con `60000` | **sobrevive** | R3-H2 |
| Quitar el efecto de foco | **muere** | caso 4, `:120`: el foco está en `body` |
| Efecto con dependencias `[]` (corre al montar, sin `ref`) | **muere** | caso 4, `:120` |
| Quitar `tabIndex={-1}` | **muere** | caso 4, `:120`. jsdom no enfoca un `div` sin `tabIndex` |
| Foco en un envoltorio de «Aceptar» en vez de en la vista | **muere** | caso 4, `:121` |
| Efecto sin array de dependencias (corre en cada render) | sobrevive | no es un hallazgo: con las dependencias del diff no hay escenario. Si se perdieran, el foco volvería de «Aceptar» al contenedor en el render que pinta otra vez la vista, y el aviso se releería |
| Foco al `<p role="status">` con `tabIndex={-1}` | sobrevive | es una alternativa válida, no un defecto |
| Quitar `role="status"` | sobrevive | ver R3-H1 |

- **Reloj falso**: `vi.useFakeTimers({ shouldAdvanceTime: true })` está dentro de `try` y `vi.useRealTimers()` en
  `finally`, así que se restaura aunque falle una aserción. El `cleanup` de RTL (`vitest.setup.ts`, `afterEach`) corre
  después del `finally`, ya con el reloj real. Si en el reloj falso quedan temporizadores pendientes, se descartan
  con él. Con el orden aleatorio (semillas 1-3) el banco sigue 5/5 y el caso 5 pasa solo. **No contamina.**
- Un efecto que he visto pero que no es un hallazgo: en el mutante de 200 ms, el caso 5 ve `refresh` llamado **2**
  veces. La segunda es el temporizador **real** que dejó el caso 4, que sobrevive a su `cleanup` y dispara dentro
  del caso 5. Con el código del diff no se siembra ningún temporizador, así que no pasa. Lo que demuestra es que
  el caso 5 también caza los restos del caso 4.

**Regresiones.** No encuentro ninguna. Los casos 1-3 no pasan por la vista del aviso, y el efecto nuevo no hace
nada con `falloCodigos` nulo. El caso 4 conserva todas sus aserciones de la ronda 2 y gana las de foco. Lo cerrado
en la ronda 2 sigue cerrado: `ok:false` no refresca, la vista de códigos solo aparece con `ok:true` y
«Aceptar» es la única salida. El orden de hooks no cambia, porque el `useEffect` nuevo (`:89`) va antes del
`return` temprano (`:142`).

## Hallazgos de la ronda 3

### BAJA

**R3-H1 · `app/primera-vez/segundo-factor.tsx:144`. El foco llega a un `div` sin rol ni nombre accesible. Lo que oye el lector al llegar depende de que lea el subárbol por su cuenta, y la región `role="status"` sigue naciendo con el texto dentro.**
- **Escenario (medido en jsdom, no con un lector real)**: con `ok:false` el foco va al contenedor, y este da
  `role: null`, nombre `""` y descripción `""`. El árbol de accesibilidad ofrece un genérico sin nombre. Un lector
  que anuncia el foco por nombre y rol no tiene nada que decir. Uno que lee el contenido empieza por «Verificación
  en dos pasos», el mismo título de la vista anterior, y el aviso solo llega en segundo lugar. La región viva no
  ayuda: se crea ya con el texto, igual que en la ronda 2, y quitar `role="status"` sigue en verde. La prueba
  solo exige `activo.contains(aviso)`, así que da igual qué anuncie el elemento enfocado.
- Es el resto de R2-H1: el foco ya no se pierde, pero lo que se anuncia no está garantizado. `zona-por-confirmar` se puede permitir un
  contenedor anónimo porque su anuncio sale de una región `status` **persistente**. Aquí esa región no existe.
- Arreglo barato dentro del territorio: dar al contenedor `role="group"`, `aria-labelledby` (título) y
  `aria-describedby` (el `<p>` del aviso), o bien `aria-labelledby` directo al aviso. En la prueba,
  `expect(activo).toHaveAccessibleDescription('FALLO-CODIGOS')` o `toHaveAccessibleName(...)`.

**R3-H2 · `app/primera-vez/segundo-factor.test.tsx:128,147-149`. El caso 5 se titula «no ocurre solo por mucho que pase el tiempo», pero solo avanza 30 s. Un refresco diferido de 60 s pasa el banco.**
- **Escenario (medido)**: con `setFalloCodigos(...); setTimeout(() => router.refresh(), 60000)` el banco da
  **5/5 en verde**. Un «autodescarte al minuto, para que nadie se quede atascado» devuelve A-H1 a quien tarde más
  de un minuto en leer (lector de pantalla, o alguien que va a buscar a quién pedir la reposición), y nadie lo caza.
- Arreglo de una línea, medido: con el código del diff, justo después de `findByText('FALLO-CODIGOS')` dentro del
  reloj falso, `vi.getTimerCount()` vale **0**. `expect(vi.getTimerCount()).toBe(0)` en ese punto, o
  `vi.runAllTimers()` en vez de avanzar 30 s, mata cualquier plazo, y el título pasaría a ser cierto.

## Notas

- R2-H4 sigue sin anotarse en `docs/state.md`. Allí figura A-H2 (`:22-23`), pero no que `seed.mjs` y
  `test-huellas.mjs` sigan tomando el primer `supabase_db_*`. Hay que anotarlo antes de integrar.
