**Sin ALTA. Gate combinado: 0 ALTA** (revisores A y B, ronda 2: 0 ALTA, 2 MEDIA, 5 BAJA).

# T-038 · Revisión, ronda 2

Sustituye a la ronda 1. Diff: `git diff main...worktree-agent-ac39d19a23cb82596` (HEAD `e25fae0`). De la ronda 1 quedan cerrados A-H1 a A-H7 y B-H1 a B-H11 (B-H10 cerrado en el anuncio y B-H11 en lo visible; lo que les falta va en B2-H2 y B2-H3).

| Id | Sev. | Dónde | Qué |
|---|---|---|---|
| A2-H1 | MEDIA | `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:216` | registro_postgres_seguro() no lee los ajustes de plpgsql_check, que está precargada y cuyo trazador escribe los argumentos de cada función PL/pgSQL, p_contrasena incluido. |
| B2-H1 | MEDIA | `app/primera-vez/segundo-factor.tsx:102` | «Reintentar» (nuevo en T-038) hace iniciarTransicion(async () => await generarCodigos()) sin try/catch, y en app/ no hay error.tsx ni global-error.tsx: un rechazo tumba la página entera. |
| A2-H2 | BAJA | `scripts/t038-concurrencia.mjs:198` | La pasada B, que mide que el candado de fila basta sin el candado de consejo, no exige b.espero, a diferencia de la A. |
| B2-H2 | BAJA | `app/primera-vez/segundo-factor.tsx:183` | disabled={trabajando} sobre el «Reintentar» enfocado manda el foco a BODY, y un reintento que falla con el mismo texto (constante de totp.ts:53, todo fallo de la RPC) no lo devuelve: setFalloCodigos con el mismo string no cambia el estado y el efecto [falloCodigos] no corre. |
| B2-H3 | BAJA | `app/(app)/cuenta/lista-avisos.tsx:253` | La marca «Sin leer» es un span pegado a la etiqueta sin espacio en el DOM (ml-2 solo separa en pantalla). |
| B2-H4 | BAJA | `app/(app)/cuenta/formulario-regenerar.tsx:77` | El catch afirma «No se han regenerado los códigos» cuando el rechazo de la acción no dice si el paso dos se confirmó. |
| B2-H5 | BAJA | `app/primera-vez/segundo-factor.tsx:101` | «Reintentar» llama a generar_codigos_recuperacion(), que exige segundo factor de menos de cinco minutos, desde una vista sin temporizadores que espera a la persona. |

<!-- REVISOR-A -->
## Revisor A · base y seguridad (ronda 2)

- **Diff:** `main...worktree-agent-ac39d19a23cb82596` (HEAD `e25fae0`).
- **Dónde se midió:** en `supabase_db_Psicogestion`, siempre dentro de `begin … rollback`, sin `db reset`, con `max(version) = 20261008120000`.
- **Interrupción:** el verificador reseteó la base a mitad de un mutante. Ese mutante se repitió cuando la migración volvió a estar aplicada.

### Hallazgos de la ronda 1

| Id | Estado | Cómo se comprobó |
|---|---|---|
| A-H1 | **Cerrado** | El paso uno devuelve `void`. Después de `crypt` hay una sola escritura (`insert … on conflict` con `case` sobre `v_ok`) y el aviso, que solo depende de `v_bloqueo`; ningún `return` ni `raise` depende del acierto. La guarda de solo lectura (25006) y el candado van antes del cotejo. El paso dos no recibe la contraseña. El oráculo da la misma respuesta con la buena y con la mala en S1 a S5, y el contador confirma. |
| A-H2 | **Cerrado** | C5 está en la migración (`:166`). El mutante que la quita pone el banco en rojo con «R2-5 C5». |
| A-H3 | **Cerrado** | `registrar_reposicion_totp` rechaza `p_perfil_id = v_actor` y cambia `<>` por `is distinct from`. Por lo demás es una copia fiel del cuerpo anterior. El mutante que quita la guarda pone el banco en rojo con «R2-4». |
| A-H4 | **Cerrado** | C1 a C8, N0 y N1 tienen su negativa y su gemela, también en vivo (L0 a L7b). |
| A-H5 | **Cerrado** | Cada condición lleva su `coalesce(…, true)`. Si falta una clave (N0) o una biblioteca (N1), el resultado es `false`. |
| A-H6 | **Cerrado** | Se cierra con DR7: `alcanzable(u)` usa `st > 0 and st <= u` y L7b lo prueba con el `statement_timeout` de `authenticated`. |
| A-H7 | **Cerrado** | Hay `revoke … from public, anon` y una comprobación que para si `anon` puede ejecutarlas. Queda una ventana de milisegundos entre la creación y el `revoke`, cubierta por el `finally` del corredor. |

### MEDIA

- **A2-H1** · `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:216` · `registro_postgres_seguro()` no lee los ajustes de `plpgsql_check`. Esa biblioteca está en `shared_preload_libraries`, y su trazador escribe los argumentos de cada función PL/pgSQL, `p_contrasena` incluido.
  - **Escenario:** se midió como `supabase_admin` dentro de `begin … rollback`, con un perfil sembrado con aal2 y una contraseña marcada.
    1. Se fijaron `set local plpgsql_check.enable_tracer = on`, `plpgsql_check.tracer = on` y `plpgsql_check.tracer_errlevel = 'log'`.
    2. `registro_postgres_seguro()` devolvió `t`.
    3. Se llamó a `comprobar_contrasena_para_regenerar('clave-revisor-log-7731')`.
    4. `docker logs supabase_db_Psicogestion` mostró `LOG:  #0  "p_contrasena" => 'clave-revisor-log-7731'`.
  - **Variante:** con el `tracer_errlevel` por defecto (`notice`) y `log_min_messages` en `notice` o por debajo, la línea llega igual al registro.
  - **Por qué importa:** si un operador activa el trazador para depurar, la acción da el registro por seguro (Q1 b) y la contraseña queda escrita en claro. Es la misma familia que A-H2: un ajuste que escribe parámetros y que la lista no enumera.
  - **Arreglo:**
    - añadir una C9: si `plpgsql_check` está cargada, el registro es inseguro cuando `plpgsql_check.enable_tracer = on` y `plpgsql_check.tracer = on`;
    - si la biblioteca está cargada, sus claves pasan a N0;
    - una negativa y una gemela en R2-5 y en vivo.
  - **Más ancho (lo decide el arquitecto):** la lista cerrada de ajustes no protege ante una biblioteca precargada que la lista no conoce. Una alternativa es que N1 tenga una lista de bibliotecas permitidas, de modo que cualquier precargada que no figure en ella cuente como insegura.

### BAJA

- **A2-H2** · `scripts/t038-concurrencia.mjs:198` · La pasada B («sin candado de consejo, el candado de fila del consumo serializa») no exige `b.espero`, a diferencia de la A (`:175`).
  - **Escenario:** las dos conexiones pueden no solaparse, por ejemplo porque la primera confirma antes de que arranque la segunda en una máquina lenta, o porque cambia `dormir`. Entonces las dos regeneraciones van en serie, dan `ok|10`, dejan diez vigentes y dos avisos, y la B sale verde. La medición «el candado de fila basta» queda registrada en `ca4-concurrencia.json` sin que haya habido carrera.
  - **Estado actual:** hoy el JSON registra `espero: true`, así que la medición vale. Lo que falta es que la condición se exija en lugar de solo anotarse.
  - **Arreglo:** `exigir(b.espero, …)`, igual que en la A. La D no lo necesita, porque sin solape la segunda activación lanza 42501 y deja 10 vigentes, y entonces la D sale roja.

### Comprobado sin hallazgo

**Lista R2.7, punto por punto:**
- **Paso uno uniforme:**
  - una sola escritura con `case` y `least(…, 100)`;
  - sin `return` ni `raise` dentro de un `if v_ok`;
  - el aviso depende solo de `v_bloqueo`;
  - si `p_contrasena` es `null`, `v_ok` es falso y cuenta como fallo.
- **Guarda de solo lectura:** va antes del candado y de `crypt`.
- **Paso dos:**
  - no lee `auth.users` ni recibe nada;
  - consume con `> 0 and autorizado_hasta > now()` antes de caducar el lote.
- **Firma antigua:** en la base no queda `regenerar_codigos_recuperacion(text)`. En `tipos-bd.ts` la función figura con `Args: never`, y `p_contrasena` solo aparece en `lib/cuentas/totp.ts:80`, que es la comprobación.
- **Evaluador:**
  - solo lo ejecuta su dueño: se revoca a `public`, `anon`, `authenticated` y `service_role`;
  - normaliza las listas de precarga;
  - `alcanzable` usa `<=`.
- **Tabla `intentos_regenerar_codigos`:**
  - ni `anon` ni `authenticated` tienen `TRUNCATE`, `DELETE`, `UPDATE` ni `SELECT`;
  - `authenticated` no puede insertar en `auditoria`, así que una fila `TOTP_REPUESTO` no se puede fabricar para eludir Q3(B).

**Mutantes del banco**, cada uno aplicado tras el `begin` con el banco completo (`00` a `23`) en `rollback`. El banco sin mutar sale verde: rc 0 y 1139 OK. Los siete ponen el banco en rojo por la aserción esperada:

| Mutante | Aserción que salta |
|---|---|
| La contraseña mala autoriza en el primer insert | «R2-1 · contraseña mala: UN intento fallido …» |
| La mala no anula la autorización | «R2-1 punto 5» |
| El paso dos ignora `autorizado_hasta` | «R2-1 punto 6» |
| Sin guarda 25006 | «R2-1 · la guarda de solo lectura y el candado van ANTES …» |
| Umbral de bloqueo en 6 | «CA2 bis» |
| Sin C5 | «R2-5 C5» |
| Reposición propia permitida | «R2-4 … 42501» |

**Lado TS:**
- los dos pasos van por POST;
- el error del paso uno se registra solo con el `code`;
- el error del paso dos no puede llevar la contraseña, porque el paso dos no la recibe.

**Residuo aceptado:** el tope 2 deja una autorización sobrante tras un doble envío. Durante 60 s, quien tenga la cookie con aal2 reciente puede gastarla y regenerar sin contraseña. Es la decisión P2 del propietario y cada regeneración avisa al titular, así que no se cuenta como hallazgo.

<!-- REVISOR-B -->
## Revisor B · interfaz, accesibilidad e integración TS (ronda 2)

Sin ALTA en la parte del revisor B: 0 ALTA, 1 MEDIA, 4 BAJA.

Diff revisado: `git diff main...worktree-agent-ac39d19a23cb82596` (HEAD `e25fae0`), ficheros de `app/(app)/cuenta/**`, `app/primera-vez/**`, `components/armazon/**`, `lib/cuentas/totp.ts`, `lib/cuentas/esquemas.ts`, `lib/i18n/es.ts`, `lib/supabase/tipos-bd.ts`, `next.config.ts`, `accesibilidad/**` y `docs/interfaz.md`. Las mutaciones y las sondas se ejecutaron en una copia exportada con `git archive e25fae0` fuera del worktree, que no se tocó. No se ejecutó `db reset`.

### B-H1 a B-H11 de la ronda 1

| # | Estado | Cómo se ha comprobado |
|---|---|---|
| B-H1 | **Cerrado** | El Provider envuelve el `<aside>` entero. `armazon-cliente.test.tsx` monta el `ArmazonCliente` real y cuenta los botones «Cerrar menú»: 1, luego 2 y luego 1. El mutante «Provider solo en `navegacion`» sale rojo (`mutantes-ui.json`). Ningún otro consumidor de `CajonContext` cambia de comportamiento: solo están `navegacion.tsx` y `enlace-cuenta.tsx`. |
| B-H2 | **Cerrado** | `catch` con `reset` y vista de fallo. Medido: sin el `reset` del `catch` (y con el resto igual) cae «B-H2 · si la acción se rechaza…», porque RHF repuebla el campo al volver. La prueba discrimina. El texto que se pinta tiene un matiz: **B2-H4**. |
| B-H3 | **Cerrado** | Error → `errorLectura`, sin `vacio` ni lista. Mutante rojo. |
| B-H4 | **Cerrado** | Medido: M2b (`useEffect` con `setTimeout(60000)` en la vista de fallo) tumba «B-H4 · en la vista de fallo…» (1 rojo de 11). |
| B-H5 | **Cerrado** | Medido: `zona = ZONA_POR_DEFECTO` en lista-avisos da 1 rojo de 9, y `ZONA_POR_DEFECTO,` en acciones.ts da 1 rojo de 19 (Canarias, 11:00). |
| B-H6 | **Cerrado** | Vitest mira `toHaveValue('')`. Medido: M1 (sin el `reset` de `:57`) da 5 rojos de 11. Playwright lo mira en S3 y S6. «Volver» no se ejercita en Playwright, pero Vitest lo cubre. |
| B-H7 | **Cerrado** | `toBe(registroInseguro)` en las tres variantes (falso, error y `null`), y ninguna llamada a ninguno de los dos pasos. |
| B-H8 | **Cerrado** | `listFactors` con error da `generico`, sin `challengeAndVerify` ni RPC. Mutante rojo. |
| B-H9 | **Cerrado** | «Volver» lleva el foco al campo contraseña. Mutante rojo en las dos variantes de fallo. Que el efecto vuelva a correr cuando cambia `enviando` con un `campoConFoco` antiguo no roba el foco: el input ya está desmontado y `focus()` sobre un nodo desconectado no hace nada. |
| B-H10 | **Cerrado en el anuncio** | El `status` se vacía y se rellena, y el mutante sale rojo. Pero el foco se pierde en cada reintento fallido: **B2-H2**. |
| B-H11 | **Cerrado en lo visible** | La marca «Sin leer» está dentro del `<li>` del no leído. Para el lector de pantalla se pega a la etiqueta: **B2-H3**. |

### R2.7 «Qué revisar» (parte de interfaz e integración TS)

- **La firma `(text)` no reaparece.**
  - `tipos-bd.ts` tiene `comprobar_contrasena_para_regenerar: { Args: { p_contrasena: string } }` y `regenerar_codigos_recuperacion: { Args: never }`.
  - `p_contrasena` solo aparece en `lib/cuentas/totp.ts:80`, en sus pruebas y en `scripts/t038-oraculo.mjs`. Este último la usa precisamente para comprobar que la firma vieja da 404/PGRST202.
  - Ninguna de las dos llamadas lleva `{ get: true }`.
- **Integración de los dos pasos en `totp.ts`.**
  - Si el paso uno da error, la función devuelve `error`, registra solo `.code` y no llama al paso dos (probado).
  - La traducción del paso dos no cambia.
  - Contrastado con el SQL:
    - con bloqueo, el paso uno vuelve sin escribir y el paso dos devuelve `bloqueado` con su hora;
    - sin autorización, el paso dos devuelve `contrasena_incorrecta`;
    - el quinto fallo devuelve `bloqueado`, no `contrasena_incorrecta`.
  - Las tres respuestas llegan bien a la acción.
- **Orden de la acción.** `listFactors` → `challengeAndVerify` → `registro_postgres_seguro` → comprobar → regenerar, probado en `acciones.test.ts:132`. `logging.serverFunctions: false` sigue en su sitio.
- **La prueba de B-H1 monta `ArmazonCliente` de verdad, y B-H6 mira `value` y no el HTML**: sí, en las dos.

### MEDIA

- **B2-H1** · `app/primera-vez/segundo-factor.tsx:102`
  - **Problema:** «Reintentar» (nuevo en T-038) hace `iniciarTransicion(async () => await generarCodigos())` sin `try/catch`. En `app/` no hay `error.tsx` ni `global-error.tsx`.
  - **Escenario:** en la vista «no se han podido generar tus códigos», la red cae y la persona pulsa «Reintentar». `generarCodigos` rechaza, el error sube a la frontera más cercana y la página entera se sustituye por la pantalla de error de Next. Se pierden con ella el texto que dice que los códigos ya no se ofrecerán al entrar y dónde generarlos.
  - **Medido** con una frontera de clase en Vitest y `mockRejectedValueOnce(new Error('red caida'))`: el documento solo contiene «FRONTERA Error: red caida».
  - Es el mismo patrón que B-H2 resolvió en el formulario de Mi cuenta.
  - `verificar` (`:117`) tiene el mismo patrón desde T-037: queda fuera del diff y es para `docs/state.md`.

### BAJA

- **B2-H2** · `app/primera-vez/segundo-factor.tsx:183`
  - **Problema:** `disabled={trabajando}` sobre el «Reintentar» que tiene el foco manda el foco a `BODY`. Si el reintento vuelve a fallar con el mismo texto, nada lo devuelve. Ese caso es todo fallo de la RPC, porque `lib/cuentas/totp.ts:53` devuelve siempre la misma constante.
  - **Escenario:** con teclado, «Reintentar» → fallo. El `status` se anuncia, pero el foco queda en `body` y hay que volver a recorrer la página para reintentar.
  - **Medido:**
    - en Chromium, con `page.setContent`, un botón enfocado y `disabled = true`, el foco pasa a `BODY` y no vuelve al habilitarlo;
    - en Vitest, tras el reintento fallido con el mismo texto, `focus()` de la región se llama 0 veces: `setFalloCodigos` con el mismo string no cambia el estado y el efecto `[falloCodigos]` no corre.
  - **Por qué la prueba no lo ve:** la de B-H10 corre en jsdom, que no quita el foco al deshabilitar, así que allí `activeElement` sigue siendo «Reintentar».
- **B2-H3** · `app/(app)/cuenta/lista-avisos.tsx:253`
  - **Problema:** la marca «Sin leer» es un `<span>` pegado a la etiqueta sin espacio: el `ml-2` solo separa en pantalla.
  - **Escenario:** el lector de pantalla oye «Regeneración de códigos bloqueadaSin leer», una sola palabra al final.
  - **Medido** en Chromium: `ariaSnapshot()` da `paragraph: Regeneración de códigos bloqueadaSin leer`, y `innerText` lo mismo.
  - **Por qué la prueba no lo ve:** busca el `<span>` con `getByText` y no puede notarlo.
- **B2-H4** · `app/(app)/cuenta/formulario-regenerar.tsx:77`
  - **Problema:** el `catch` afirma «No se han regenerado los códigos», pero un rechazo de la acción no dice si el paso dos se confirmó.
  - **Escenario:**
    1. La conexión se corta después de que `regenerar_codigos_recuperacion()` confirme. El lote viejo ya está caducado y el nuevo no se ha enseñado.
    2. La persona lee «No se han regenerado» y se queda con su lista en papel, que ya no vale.
    3. «Volver» no refresca, así que el aviso `codigos_regenerados` que lo delataría no aparece en la lista hasta que se recargue.
  - El texto lo fijó el diseño (R2.4, B-H2), pero el resultado es desconocido y la vista lo da por sabido.
- **B2-H5** · `app/primera-vez/segundo-factor.tsx:101`
  - **Problema:** «Reintentar» llama a `generar_codigos_recuperacion()`, que exige el segundo factor verificado hace menos de cinco minutos (`20261008120000:469`). La vista de fallo no tiene temporizadores, a propósito, y espera a la persona.
  - **Escenario:** la persona vuelve a los seis minutos y pulsa «Reintentar». Da 42501 y la misma constante «No se pudieron generar los códigos de recuperación.» una y otra vez. El botón ya no puede funcionar y nada lo dice. La descripción remite a Mi cuenta, que sí funciona: es una vía muerta con salida, no un bloqueo.

### Fuera del diff (para `docs/state.md`, no cuenta en el gate)

- `verificar` en `app/primera-vez/segundo-factor.tsx:117` (T-037): la misma transición asíncrona sin `try/catch` que B2-H1, con `generarCodigos()` y `mfa.verify` dentro.
