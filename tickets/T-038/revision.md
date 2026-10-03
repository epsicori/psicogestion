**Gate combinado: 1 ALTA** (revisores A y B, ronda 1: 1 ALTA, 8 MEDIA, 9 BAJA).

**Sin ALTA en la parte del revisor B** (ronda 1: 0 ALTA, 5 MEDIA, 6 BAJA). La parte del revisor A aún no estaba escrita al cerrar B: el gate combinado lo fija quien fusione la última parte.

# T-038 · Revisión, ronda 1

<!-- REVISOR-B -->
## Revisor B · aplicación e interfaz (ronda 1)

Revisor B no encuentra ningún hallazgo ALTA: 0 ALTA, 5 MEDIA y 6 BAJA.

Diff revisado: `git diff cdfefbe..3fc4a2b`, ficheros de `app/`, `components/`, `lib/cuentas/`, `lib/i18n/`, `next.config.ts`, `accesibilidad/` y `docs/`. Las mutaciones y sondas se ejecutaron en una copia del árbol fuera del worktree, que no se tocó. No se ejecutó `db reset`.

### Lista «Qué revisar», punto por punto

| Punto | Resultado |
|---|---|
| El mismo esquema Zod en cliente y servidor | Sí. `esquemaRegenerarCodigos` se usa en el resolver del formulario y en el `safeParse` de la acción. |
| La contraseña no se queda en el estado ni en los registros | `serverFunctions:false` está en `next.config.ts` y es un valor válido según `logging.md`. En los registros, `totp.ts` registra el objeto `error` del RPC, no los argumentos. En el estado, `reset` se ejecuta en el camino de vuelta normal, pero no cuando la acción lanza: **B-H2**. |
| Se llama a `registro_postgres_seguro()` antes de enviar la contraseña y falla cerrado | Sí. Se llama antes de `regenerarCodigosRecuperacion`; con error o con un valor distinto de `true`, la acción corta y nunca llama al RPC. Está probado con error y con `null`. |
| Foco, `region` con nombre, `aria-invalid` y `aria-describedby` | Correcto en las vistas de códigos y de fallo, y en los campos. «Volver» pierde el foco: **B-H9**. |
| Ningún temporizador en el formulario | Correcto, con `getTimerCount` en formulario-regenerar.test.tsx:79. En segundo-factor, CA11 tiene un hueco: **B-H4**. |
| «Ya los he guardado» lleva el foco a los avisos | Sí, a `#avisos-seguridad-titulo` (h3 con `tabIndex -1`). |
| lista-avisos: filtro y leídos | Filtra por los cuatro tipos, incluye los leídos (no filtra por `leida_en`) y ordena por fecha descendente con límite 50. La política RLS `notificaciones_lectura_propia` restringe a las filas propias. |
| lista-avisos: zona horaria y lista vacía | La zona está, pero no hay prueba que la distinga del valor por defecto: **B-H5**. Un error de lectura se presenta como lista vacía: **B-H3**. |
| enlace-cuenta: `aria-current`, nombre accesible y 44 px | Correcto: `min-h-11`, «Mi cuenta» en `sr-only` y el nombre de la persona. |
| enlace-cuenta: cierra el cajón | **No** con el armazón real: **B-H1**. |
| segundo-factor: vistas de fallo y de reintento | Están. Si el reintento falla con el mismo mensaje, no se anuncia: **B-H10**. |
| Ningún literal en los `.tsx` | Correcto. Todo sale de `lib/i18n/es.ts`, y `lib/i18n/sin-literales.test.ts` recorre `app/` y `components/`. |
| El spec de Playwright prueba lo que dice | En general sí: S3 a S9 contra la base y los contenedores. La aserción de la línea 255 es vacía: **B-H6**. |

### Desvíos declarados

- **El texto `registroInseguro`**: se acepta, porque responde a la decisión Q1 del propietario y no dice qué ajuste falla. Ninguna prueba lo fija: **B-H7**.
- **El spec solo cubre al rol técnico**: se acepta, porque CA13 del diseño permite el técnico. La variante profesional necesita el paso del PIN y queda anotada en la bitácora.
- **La nota de despliegue de Q1 vive en la bitácora**: comprobado, está en `docs/bitacora/T-038.md` §«Nota de despliegue de Q1». Es correcto mientras no haya manual de despliegue. El orquestador debería llevarla a `docs/state.md` §Hallazgos para que no se pierda.

### MEDIA

- **B-H1**, `components/armazon/enlace-cuenta.tsx:33`.
  - **Problema:** «Mi cuenta» no cierra el cajón. `identidad` se pinta fuera de `CajonContext.Provider`: en `armazon-cliente.tsx`, la línea 91 envuelve solo `navegacion` y la 95 deja `identidad` fuera. Por eso `useCerrarCajon()` devuelve el `() => {}` por defecto. Además, el armazón no cierra el cajón al cambiar de ruta.
  - **Por qué la prueba pasa:** monta el Provider a mano (`enlace-cuenta.test.tsx:44`).
  - **Escenario:** en móvil a 360 px, «Abrir menú» y pulsar «Mi cuenta». La navegación va a `/cuenta`, pero el cajón sigue abierto y el velo tapa el formulario. Medido con el `ArmazonCliente` real: tras el clic, abierto=true y el velo sigue presente.
- **B-H2**, `app/(app)/cuenta/formulario-regenerar.tsx:57`.
  - **Problema:** `reset` va después del `await`, dentro de un `try` que solo tiene `finally`.
  - **Escenario:** la acción lanza (red caída, un 500, un id de acción obsoleto tras un despliegue). Medido:
    - la contraseña sigue en el campo;
    - no aparece región de fallo;
    - el botón vuelve a habilitarse sin decir nada;
    - queda 1 unhandled rejection.
- **B-H3**, `app/(app)/cuenta/lista-avisos.tsx:51`.
  - **Problema:** si la lectura falla, se pinta «No hay avisos de seguridad.».
  - **Escenario:** PostgREST devuelve un error. La persona ve una falsa tranquilidad aunque tenga un aviso «regeneración bloqueada» de alguien que prueba su contraseña.
- **B-H4**, `app/primera-vez/segundo-factor.test.tsx:148`.
  - **Problema:** CA11 solo cuenta temporizadores tras un reintento con éxito.
  - **Escenario:** el mutante M2b añade un `useEffect` con `setTimeout(60000)` y su limpieza en la vista de fallo. Las 9 pruebas de segundo-factor siguen verdes (medido).
- **B-H5**, `app/(app)/cuenta/lista-avisos.tsx:40` y `acciones.ts:81`.
  - **Problema:** la zona de la organización no está probada. Todas las pruebas usan Madrid, que es también el valor por defecto.
  - **Escenario:** con `zona = ZONA_POR_DEFECTO` forzado, lista-avisos sigue 6/6 verde y acciones 17/17 (medido). Una organización en Atlantic/Canary vería todas las horas una hora adelantadas sin que falle ninguna prueba.

### BAJA

- **B-H6**, `app/(app)/cuenta/formulario-regenerar.test.tsx:140` y `:153`, y `accesibilidad/regenerar-codigos.spec.ts:255`.
  - **Problema:** las comprobaciones de que `innerHTML` o `content()` no contienen la contraseña no prueban nada: el valor tecleado es una propiedad del input y no se serializa.
  - **Escenario:** el mutante M1 quita `reset` del camino de éxito y las 10 pruebas siguen verdes. Tras «Ya los he guardado», el campo vuelve a contener la contraseña.
- **B-H7**, `app/(app)/cuenta/acciones.test.ts:181`.
  - **Problema:** la prueba solo exige `r.mensaje` verdadero.
  - **Escenario:** cambiar `registroInseguro` por `generico` deja las pruebas 17/17 verdes (medido).
- **B-H8**, `app/(app)/cuenta/acciones.ts:40`.
  - **Problema:** se descarta el error de `listFactors()`.
  - **Escenario:** si GoTrue responde 500, la persona recibe «No tienes la verificación en dos pasos…» aunque la tenga.
- **B-H9**, `app/(app)/cuenta/formulario-regenerar.tsx:104`.
  - **Problema:** «Volver» desmonta la región que tiene el foco y no lo devuelve a ningún sitio.
  - **Escenario:** el foco cae a `body` y el lector de pantalla tiene que volver a recorrer la página desde arriba.
- **B-H10**, `app/primera-vez/segundo-factor.tsx:177`.
  - **Problema:** un reintento que vuelve a fallar con el mismo mensaje constante (`totp.ts:53`) no cambia el `role="status"` y no se anuncia. La prueba usa 'OTRO-FALLO' (`:204`).
  - **Escenario:** medido, el foco queda en el botón y no hay anuncio. La persona no sabe si el reintento falló.
- **B-H11**, `app/(app)/cuenta/lista-avisos.tsx:63`.
  - **Problema:** leído y no leído se distinguen solo por el peso de la fuente.
  - **Escenario:** con lector de pantalla, un aviso de bloqueo sin leer suena igual que uno leído hace meses.

<!-- REVISOR-A -->
## Revisor A · base y seguridad (ronda 1)

Revisor A: **1 ALTA**, 3 MEDIA, 3 BAJA.

Diff `cdfefbe..3fc4a2b`. Medido en `supabase_db_Psicogestion` dentro de `begin … rollback`. La base se reseteó a mitad de la ronda; antes de volver a medir se esperó a `max(version) = 20261008120000` con la siembra hecha.

### ALTA

- **A-H1** · `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:171` · El contador de intentos (D4: «la contraseña errónea no lanza, así el contador persiste») solo persiste si la transacción del llamante confirma; PostgREST puede fallar después de que la función devuelva (o ejecutarla en solo lectura) y entonces el intento se deshace, mientras la respuesta sigue distinguiendo la contraseña buena de la mala. El límite de cinco intentos de P-4 no se cumple por la puerta directa /rest/v1/rpc.
  - Escenario: Medido en begin…rollback con un perfil sembrado y aal2 reciente: varias llamadas con contraseña errónea cuya transacción acaba en error por una causa posterior a la función no dejan fila en intentos_regenerar_codigos ni aviso, y el error que vuelve permite distinguir «contrasena_incorrecta» de «ok». Tras siete fallos así, la contraseña buena devuelve ok y genera el lote: nunca se bloquea. Contrastado contra el PostgREST local. D4 supone que solo un raise de la propia función deshace el contador. El arreglo es decisión del arquitecto: persistir el intento fuera de la transacción del llamante, o no exponer la RPC a PostgREST y llamarla solo desde la acción con un rol propio.

### MEDIA

- **A-H2** · `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:71` · registro_postgres_seguro() no comprueba log_transaction_sample_rate, que escribe en el registro todas las sentencias de las transacciones muestreadas, con sus parámetros.
  - Escenario: Medido como supabase_admin en begin…rollback: con set local log_transaction_sample_rate = 1, registro_postgres_seguro() devuelve t; con ese ajuste y log_parameter_max_length = -1 (el de la imagen), una sentencia con $1 deja «Parameters: $1 = …» en docker logs. En una instancia con muestreo de transacciones la acción da el registro por seguro (Q1 b) y la contraseña queda escrita. Se arregla tratándolo como log_min_duration_sample (seguro solo si vale 0 o si log_parameter_max_length = 0), con su negativa en el banco.
- **A-H3** · `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:274` · La regla Q3(B) cuenta con que una fila TOTP_REPUESTO posterior al lote solo puede venir de una reposición legítima, pero registrar_reposicion_totp() solo exige rol administrador y no impide que el llamante se reponga a sí mismo.
  - Escenario: Un administrador con sesión aal2 llama a registrar_reposicion_totp con su propio id: queda una fila TOTP_REPUESTO posterior a su lote vigente, y generar_codigos_recuperacion() vuelve a emitir lote sin pedir contraseña. Es justo la puerta que P-4 manda cerrar «una vez hay lote», y la abre el rol con más alcance. Los avisos llegan al titular, pero nada lo impide. La función no está en el diff, aunque la regla nueva depende de ella. Hay que decidir entre excluir p_perfil_id = auth.uid() en la reposición o exigir en la regla Q3 que actor_id <> registro_id.
- **A-H4** · `scripts/rls/13-cuentas.sql:502` · El banco ejercita una sola de las seis condiciones de registro_postgres_seguro() (log_parameter_max_length_on_error); las otras cinco no tienen negativa.
  - Escenario: Mutante: se borra la cláusula de log_statement, la de log_min_duration_statement, la del muestreo, la de auto_explain o la de pgaudit, y el banco 13 sigue verde. Medido: como supabase_admin y dentro de begin…rollback, set local fija esos ajustes, así que cada rama puede tener su negativa y su gemela.

### BAJA

- **A-H5** · `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:53` · La cabecera dice que la función «falla cerrado» si no puede leer un ajuste, pero los coalesce de log_statement, auto_explain.* y pgaudit.* caen al valor que da por seguro.
  - Escenario: Si el dueño de la función deja de ver un ajuste en pg_settings (pierde pg_read_all_settings, o la extensión no está cargada en ese proceso), la función responde «seguro» sin haberlo leído. Hoy postgres sí lo ve, así que el problema está en el comentario. Corregir el comentario o invertir los coalesce.
- **A-H6** · `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:84` · La condición de auto_explain (inseguro solo entre 0 y 9999 ms) es segura en la imagen local solo porque authenticated tiene statement_timeout = 8s, y la función no lo comprueba.
  - Escenario: Medido: la imagen trae auto_explain.log_min_duration = 10000 y auto_explain.log_parameter_max_length = -1, y una regeneración tarda 1,6 s en local (bcrypt 12 por diez). Si se sube el statement_timeout de authenticated y una llamada pasa de 10 s (por una instancia lenta o por esperar el candado), auto_explain escribe los parámetros aunque la función haya dicho «seguro». Hay que tratar cualquier valor ≥ 0 igual que log_min_duration_statement.
- **A-H7** · `scripts/t038-concurrencia.sql:75` · La copia sin candado del contraensayo se crea en public con el EXECUTE por defecto a PUBLIC (anon incluido) y solo se borra en el finally del corredor.
  - Escenario: Medido durante la ronda: public.t038_sin_candado existía con has_function_privilege('anon', …) = t. Si el corredor se interrumpe antes del finally, la base local se queda con una regeneración sin candado ejecutable por cualquiera. Arreglo: revocar de public y anon al crearla.

### Comprobado sin hallazgo

- `p_contrasena` solo aparece en el `coalesce(...) <> ''` y en `extensions.crypt`. Ningún raise, format, insert ni aviso la lleva, y las dos funciones no tienen bloques `exception` ni `execute` dinámico.
- El orden de guardas es correcto: sesión, rol y segundo factor (42501) van antes del candado y del contador. Las dos funciones usan el mismo `pg_advisory_xact_lock` y son `volatile`, `security definer` con `search_path = ''`.
- CA4: sin candado, el contraensayo deja 20 códigos vigentes; con él, 10. El script usa `contenedorDelProyecto()`.
- `intentos_regenerar_codigos` tiene RLS sin políticas, ningún grant y auditoría con `fn_auditar`. No hay UPDATE ni DELETE nuevo sobre tablas de solo adición. `canjear_codigo_recuperacion` y `registrar_reposicion_totp` no cambian.
- Lado TS: la RPC va por POST. `console.error` registra el objeto de error o el motivo, nunca la entrada, y `next.config.ts` pone `logging.serverFunctions: false`.

### Fuera del diff (para `docs/state.md`, no cuenta en el gate)

- `desbloquear_historia` (PIN) tiene el mismo patrón que A-H1: el contador sin raise y el motivo en la respuesta, así que su límite de intentos se elude igual. La solución que se elija para A-H1 debería aplicarse también ahí.
<!-- /REVISOR-A -->
