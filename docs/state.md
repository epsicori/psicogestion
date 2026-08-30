# Estado

> Memoria viva del proyecto. **Léelo antes de tocar código; actualízalo al terminar.**
> Es el bus entre agentes: lo que aprendas aquí se escribe, no se re-explica.

**Actualizado**: 30-08-2026

## Ticket en curso

**T-005 · Cadena de huellas SHA-256, canonicalización y verificador — implementado el
30-08-2026, primera revisión con Opus NO pasó el gate (un hallazgo ALTA), arreglado el
mismo día, pendiente de una segunda pasada de revisión.** (Ticket `opus` que toca RLS y
datos clínicos: revisión obligatoria antes de cerrar.) Sigue al pie de la letra el «Diseño
aprobado» del propio ticket. **`estado: en_curso` a propósito**: no se cierra a `hecho`
hasta que la segunda revisión lo confirme.

Entra `supabase/migrations/20260829210000_cadena_de_huellas.sql` (amplía
`notas_clinicas_versiones` con `paciente_id`/`posicion_cadena`, el disparador
`fn_sellar_version_nota()` que sella y encadena, `fn_vaciar_borrador_al_firmar()` y
`verificar_cadena_huellas(uuid)`) y `lib/huella/` (canonicalizador JCS+NFC propio, sobre
Zod, `firmar.ts`). Verificado con `npm run test:rls` (módulo nuevo
`scripts/rls/13-cadena-huellas.sql`, 178 aserciones en verde), `npm run test:huellas`
(`scripts/t005-concurrencia.sql`, dos conexiones reales) y a mano contra la base local con
`npm run verificar:huellas`. `npx supabase db reset`, `npm run lint`, `npm run
lint:migraciones` y `npm run build` limpios; `npx vitest run`: 295 pruebas, 31 ficheros.

**Los catorce hallazgos de la primera revisión con Opus (30-08-2026), y cómo se cerraron
— todos con reproducción del fallo antes y prueba de que ya no ocurre:**

- **ALTA · Tres de las nueve comprobaciones del disparador se saltaban con `null` JSON**
  (6.2 autor_id, 6.5 esquema_version, 6.7 creada_en/firmada_en; también el
  `abierta_en<=firmada_en` de 6.8). Causa: `->>` da SQL `NULL` ante un valor JSON `null`, y
  `NULL <> x` es `NULL`, que en un `if` es falso — la comprobación no saltaba nunca.
  Reproducido insertando un sobre con `"autor_id":null` y viendo que se sellaba igual
  (`huella is not null` → `t`). Arreglado cambiando a `(v_contenido -> 'campo') is distinct
  from to_jsonb(new.columna)`, que compara el valor JSONB completo y no colapsa a `NULL`.
  Reproducido de nuevo: las cuatro variantes (autor_id, esquema_version, creada_en,
  firmada_en nulos) lanzan ahora con su mensaje propio; un sobre bien formado sigue
  sellándose sin falsos positivos.
- **MEDIA · `normalizarNfc()` vaciaba un `Date`/`Map` en `{}` en silencio** antes de que
  `jcs.ts` pudiera rechazarlo (`typeof new Date() === 'object'` y `Object.keys(...) ===
  []`). Reproducido: `construirSobre({ cuerpo: { fecha: new Date(...) } })` no lanzaba.
  Arreglado añadiendo el mismo guarda de objeto plano (`esObjetoPlano()`) DENTRO de
  `nfc.ts`, antes de recorrer. Reproducido de nuevo: ahora lanza `ErrorNormalizacionNfc`
  con la ruta del culpable (`$.cuerpo.fecha`). Tres pruebas nuevas en `nfc.test.ts`.
- **MEDIA · U+0000 no se puede insertar de verdad**: `contenido_canonico::jsonb` (el
  `check` de la columna y el propio disparador) rechaza la secuencia de escape con
  `22P05` (`unsupported Unicode escape sequence`) — Postgres no admite ese carácter ni
  escapado dentro de un jsonb. El diseño decía «no es un problema»; es más exacto decir
  que falla alto y con un código concreto, no que «no pasa nada». Documentado en el
  comentario de la columna `contenido_canonico` y en el propio ticket (nota de corrección
  bajo el párrafo original). No se corrige el tipo de columna (fuera de alcance).
- **MEDIA · `t005-concurrencia.sql` no podía fallar nunca**: sus cuatro comprobaciones
  eran `select case … 'OK'/'FALLO'`, sin `raise`. Reproducido con una condición inyectada a
  propósito (`if true then` en la tercera aserción): el guion completo igual, exit 0.
  Arreglado con `do $$ … raise exception … $$` en las cuatro, más una tabla real
  `public.t005_resultado` que captura éxito/SQLSTATE de la segunda conexión (el `\!` no
  interpola `:VAR`, y tampoco dentro de un bloque `$$ … $$` — verificado con
  `do $$ begin raise notice ':X'; end $$;`, que imprime literalmente «:X»). Reproducido de
  nuevo con la misma condición inyectada: `npm run test:huellas` sale con **código 3** y
  señala la aserción exacta; revertida la condición, vuelve a salir con 0.
- **MEDIA · `fn_vaciar_borrador_al_firmar()` generaba auditoría de UPDATE espuria** en
  cada firma aunque no hubiera borrador. Arreglado con
  `and borrador_contenido is not null` en el `where` del `update`.
- **MEDIA · `--paciente` de `verificar-huellas.mjs` sin validar, interpolado en SQL de
  superusuario.** Reproducido: `--paciente "x' union select version() -- "` llega intacto
  al parser SQL (error de sintaxis visible en el mensaje, que ya revela la interpolación
  cruda); `--paciente` sin valor detrás verificaba TODAS las cadenas en silencio.
  Arreglado con el mismo patrón UUID que `lib/huella/sobre.ts`, validado antes de
  interpolar, y detección explícita de valor ausente/otra bandera. Reproducido de nuevo:
  los dos casos salen con código 2 y un mensaje de uso, sin tocar la base.
- **MEDIA · Evidencia declarada en el ticket que no existía**: decía que había negativas de
  `anotaciones_reservadas` y `motivo_cambio` (6.4/6.6) en el banco, y no las había.
  Añadidas las dos en `scripts/rls/13-cadena-huellas.sql` §C.
- **MEDIA · `posicion_cadena` filtra cuántas versiones de otros profesionales hay en la
  cadena de un paciente**, a quien solo tiene una versión propia visible. Es consecuencia
  del `security definer` y de numerar por paciente, no un bug de código; se acepta y se
  documenta en `docs/architecture.md` §Roles («Fuga documentada»).
- **BAJA 10 (subsumido en el ALTA) · `esquema_version` no tipada**: `"2"` (cadena) pasaba
  el cast a `smallint` igual que el número 2. Se cerró con el mismo `to_jsonb(...) is
  distinct from` de la comprobación 6.5.
- **BAJA 11 · Documentado, no corregido**: `to_char('MS')` trunca a milisegundos, que es
  EXACTAMENTE la precisión de `toISOString()` — sin pérdida frente al sobre real siempre
  que `creada_en` se pase explícito (que es lo que hace `firmar.ts` siempre). Comentario
  añadido junto al cálculo en la migración.
- **BAJA 12 · Negativas con `assert_lanza` en vez de `assert_lanza_codigo`**: cambiada la
  del criterio 9 (huella_anterior repetida) a exigir `23505` en concreto.
- **BAJA 13 · La comprobación ADR-031 comparaba dos conjuntos vacíos**, no las huellas
  reales. Añadida una comparación byte a byte (`string_agg(encode(huella,'hex'),...)`)
  antes y después de fusionar, capturada con `\gset`. Probado que SÍ puede fallar:
  sustituyendo el valor «después» por uno deliberadamente distinto, la aserción falla con
  el mensaje exacto (exit 3); revertido, vuelve a pasar.
- **BAJA 14 · Blancos duplicados en `13-cadena-huellas.sql`** (519 líneas para el contenido
  real): colapsados los saltos de línea sobrantes y fusionados los párrafos de comentario
  que quedaron partidos línea a línea por el generador original. 519 → 413 líneas, mismo
  contenido, mismas 178 aserciones en verde.

**Landmine nuevo, pagado dos veces en esta sesión**: escribir la secuencia de seis
caracteres `\u0000` dentro de una cadena de un fichero (comentario SQL o literal de
prueba TypeScript) a través de las herramientas de edición de este entorno puede acabar
grabando un **byte NUL crudo** en el fichero en vez de los seis caracteres ASCII. Un NUL
crudo en un `comment on column …` rompe `db reset` con `invalid message format (SQLSTATE
08P01)`; en un `.ts` no rompe nada en tiempo de ejecución pero dice mal lo que dice. Pasó
en el propio `tickets/T-005-cadena-huellas.md` (ya existía en el diseño aprobado, sin
relación con esta sesión), en la migración (al documentar el hallazgo MEDIA de U+0000, con
ironía) y en `lib/huella/jcs.ts`/`jcs.test.ts`. **Comprobación que hay que repetir tras
cualquier sesión que teclee `\u0000` literal**: `node -e "const b=require('fs').readFileSync(RUTA); let n=0; for(const x of b) if(x===0) n++; console.log(n)"` sobre cada fichero tocado — cero es lo correcto.

**Lo que hay que saber antes de tocar la cadena de huellas:**

1. **El sobre canónico tiene once claves exactas, `esquema_version = 2` desde el ADR-046**
   (la versión 1, sin el bloque de sesión, no existe en ninguna fila de ninguna base). El
   disparador `fn_sellar_version_nota()` las exige TODAS y RECHAZA cualquier clave de más
   o de menos — el día que el sobre crezca de verdad, sube `esquema_version` y el
   disparador tiene que aceptar las dos formas, cada una con la suya. No se toca a la
   ligera.
2. **`huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` y `numero_version` los
   calcula el disparador; un `INSERT` que los traiga no nulos lanza.** Esto rompió
   `scripts/rls/01-fijacion.sql` y `scripts/rls/04-baja.sql` (insertaban estos valores a
   mano desde T-001/T-003) y se han reescrito para usar
   `pg_temp.sobre_prueba(...)` (nuevo en `00-ayudantes.sql`), que construye el sobre a
   mano con las once claves. **Trampa real y ya pagada**: `pg_temp.sobre_prueba()` usa
   `p_cuerpo::text`, y el `::text` de un `jsonb` en Postgres imprime **un espacio tras los
   dos puntos** (`{"t": "cad-b"}`), a diferencia del canónico JCS real, que no lleva
   ninguno — si algo compara contra el texto sin ese espacio, no encuentra nada.
3. **`\!` de psql NO interpola variables `:VAR`** (a diferencia de una sentencia SQL
   normal): en `scripts/t005-concurrencia.sql`, la segunda conexión lleva los UUID
   literales escritos a mano, no `:NOTA2`/`:ANA`. Se descubrió porque la primera versión
   fallaba con «syntax error at or near ":"» — un fallo que además dejaba pasar la
   aserción siguiente por el motivo equivocado (NOTA2 «seguía sin versión», pero porque el
   INSERT ni siquiera había llegado a ejecutarse, no porque el cerrojo lo hubiera
   bloqueado). **Lección**: toda prueba negativa hay que preguntarse si seguiría en verde
   con el arreglo quitado — aquí no se preguntó a la primera y coló.
4. **El índice único GLOBAL sobre `huella` (T-001) sigue vivo** y hace que dos sobres
   idénticos byte a byte —mismo cuerpo, mismo autor, mismo instante— choquen en el génesis
   aunque sean de pacientes distintos. Toda fijación nueva que comparta cuerpo/autor entre
   pacientes tiene que variar `creada_en` (basta un segundo).
5. **`scripts/t001-esquema.sql`, `scripts/t002-rls.sql` y `scripts/t004-auditoria.sql`
   (guiones ad hoc, no en ningún `npm run`) han quedado rotos**: insertan
   `notas_clinicas_versiones` con `huella`/`huella_anterior`/`numero_version` a mano, y el
   disparador nuevo los rechaza. **No se han tocado, a propósito**: son evidencia congelada
   de tickets ya cerrados (T-001/T-002/T-004), no pruebas vivas, y arreglarlos es trabajo
   fuera del alcance de este ticket (constitución, regla 2). Si algún ticket futuro
   necesita volver a ejecutarlos, hay que reescribir esos `insert` igual que se hizo en
   `01-fijacion.sql`.
6. **`lib/supabase/tipos-bd.ts` se editó a mano** (Docker no estaba arrancado cuando se
   escribió el código) y luego se regeneró de verdad con `npm run tipos` una vez arrancado:
   el diff fue de **cero líneas de más** frente al parcheo manual — la única adición real
   fue la firma de `verificar_cadena_huellas` en `Functions`. Si un ticket futuro toca esta
   tabla, regenerar los tipos sigue siendo lo correcto; el parcheo a mano fue la excepción
   de esta sesión, no el patrón a seguir.
7. **La línea exacta que T-009 tiene que enganchar a la ejecución nocturna** (no se ha
   creado ni tocado nada en `.github/`, territorio de MiniMax): `npm run verificar:huellas
   -- --json`, código de salida **distinto de cero si hay una sola anomalía**, salida JSON
   con un objeto por anomalía (`paciente_id`, `posicion_cadena`, `version_id`, `nota_id`,
   `creada_en`, `motivo`).
8. **El SHA-256 vive solo en pgcrypto** (`extensions.digest`, nunca `digest` a secas —
   `search_path = ''`). `lib/huella/**` no importa `node:crypto` en ningún fichero de
   producción; solo `vectores.test.ts` lo usa, y es una prueba. Es lo que cierra el
   criterio de `blocking-prerender-*` (ADR-043) por construcción, no por vigilancia.
9. **El editor TipTap, la pantalla de notas y la Server Action con `"use server"` son fase
   1**, territorio de MiniMax (`app/**`). Este ticket entrega el mecanismo
   (`lib/huella/firmar.ts`, sin la directiva, fuera de `app/`) y su prueba por guion, tal
   como pedía el propio ticket.

**T-004 · Auditoría por triggers y solo adición en tres capas — hecho el 29-08-2026.**
Entra `supabase/migrations/20260829150000_auditoria_y_solo_adicion.sql`. Verificado con
`scripts/t004-auditoria.sql`: todas las aserciones en cierto. Las capas 2 y 3 ya las había
dejado T-001 en las cuatro tablas; aquí se comprueban tabla por tabla y se añade lo que
faltaba.

**Lo que hay que saber antes de tocar la auditoría:**

1. **`auditoria` registra qué pasó y quién, nunca qué decía.** Colgar la auditoría de todas
   las tablas sin recortar copiaba el **hash del PIN**, el **criptograma y el nonce del
   DNI** y el **cuerpo de la nota** a una tabla que **no está bajo el candado del ADR-026**
   y que el propio actor lee. Se recortan credenciales, criptogramas con sus nonces e
   índices, y el contenido que el candado protege. Las columnas `*_clave_version` **se
   quedan**: saber con qué versión de clave se escribió algo es para lo que sirve una
   auditoría. **El recorte va como argumento del disparador**, así que se ve en
   `pg_get_triggerdef` sin abrir el código, y el bucle de la migración **falla** si se
   nombra una columna que no existe.
2. **`fn_auditar()` ya no da por hecho que la clave se llama `id`.** Tres tablas no la
   tienen y `auditoria.registro_id` es NOT NULL: la versión vieja no habría dado un registro
   pobre, habría **reventado el `insert`** en la tabla auditada.
3. **Prolongar el desbloqueo no se audita; revocarlo sí.** Es la decisión de volumen que el
   ticket mandaba tomar: quién abrió el candado y cuándo ya está en el `INSERT`, y prolongar
   ocurre cada pocos minutos. La revocación es un hecho de seguridad y ocurre una vez.

**`registrar_evento_auditable()`** existe, está probada y fuerza `actor_id = auth.uid()`,
pero **quién la llama es de otros tickets**: T-006 el inicio de sesión, T-013 la búsqueda
que devuelve pacientes. Aquí solo entra la base de datos.

**El catálogo `tablas_solo_adicion` es una tabla, no una lista dentro de una función**,
para que CI pueda leerlo. `cobertura_solo_adicion()` devuelve una fila por tabla
desprotegida: **cero filas es el estado correcto**, y eso es lo que T-009 tiene que contar.

---

**T-002 · enmienda del ADR-051 (multi-centro) — implementada el 29-08-2026.** Entra
`supabase/migrations/20260829120000_perfiles_centros_multicentro.sql`: `perfiles_centros`
con dos índices únicos parciales, disparador de espejo, `centros_actuales()` y
`centro_principal(uuid)` nuevas, `centro_actual()` reescrita, los cuatro consumidores
reescritos, cuatro políticas y auditoría. Verificado con
`scripts/t002-enmienda-multicentro.sql`: **ninguna aserción en falso; los cinco errores de
la salida son las cinco aserciones negativas buscadas**. `lint`, `test` y `build`, verdes.

**Tres cosas que hay que saber antes de tocar centros:**

1. **«Vigente» es exactamente `hasta is null`, y es una decisión, no un descuido.** Un
   índice único parcial no puede usar `current_date` en su predicado —no es inmutable—, así
   que definir la vigencia por rango dejaba el índice y el tiempo de ejecución diciendo
   cosas distintas, con una ventana en la que caben dos principales. Se igualan las dos
   definiciones y un `check` prohíbe fechar el cierre en el futuro. Por eso cerrar una
   pertenencia surte efecto **en la misma sesión**, y por eso `desde` es dato histórico y no
   gobierna nada.
2. **`fn_crear_perfil_de_usuario()` también se enmendó, y no estaba en el ticket.** Escribía
   `perfiles.centro_id` desde `raw_user_meta_data`; con la enmienda esa columna es el
   **espejo**, así que cada usuario nuevo nacía con el espejo relleno y la fuente de verdad
   vacía —`centros_actuales()` a cero, y un técnico recién creado sin ver nada—. El relleno
   de la migración no lo tapa: solo corre una vez. **Regla que queda: nadie escribe
   `perfiles.centro_id` a mano; se escribe `perfiles_centros` y el espejo sigue solo.**
3. **El técnico sin centro se cierra por el `check`, no por una política.** Cerrar su última
   pertenencia pone el espejo a nulo y eso viola `perfiles_tecnico_exige_centro`, así que la
   operación **falla desde dentro del disparador de espejo**. Es lo buscado —sin centro no
   hay recorte, y sin recorte vería la organización entera—, pero el error nombra la
   restricción y no el disparador: no se busque el fallo donde no está.

Sigue pendiente **la revisión con Opus** del ticket entero y el punto 3 del guion manual en
navegador.

---

**T-002 · RLS: funciones auxiliares y políticas de los tres roles** — implementado el
22-08-2026. Entra
`supabase/migrations/20260822160000_rls_funciones_y_politicas.sql`: **60 políticas nuevas,
2 borradas, 12 funciones nuevas, 1 enmendada, 3 disparadores, 4 índices, 2 vistas y 2
cambios de privilegio**. Verificado con `scripts/t002-rls.sql` (fijación propia, todo en
una transacción con `rollback`; 11 errores en la salida y los once son aserciones
negativas buscadas).

**Tres cosas que este ticket descubrió y hay que saber antes de tocar la RLS:**

1. **La política de `notas_clinicas` NO puede consultar `notas_clinicas_versiones`
   directamente**, como pedía el diseño: la política de `versiones` consulta a su vez
   `notas_clinicas` y Postgres aborta con `infinite recursion detected in policy for
   relation "notas_clinicas"`. Reproducido antes de escribir la migración. La salida es la
   que el propio diseño prescribe para `es_profesional_asignado()`: una función
   `security definer`, `nota_tiene_version_conjunta(nota_id)`. La semántica no cambia.
2. **El corte por baja del ADR-032 NO llega solo a las tablas clínicas.** El diseño daba
   por hecho que enmendar `rol_actual()` bastaba, y no basta: las políticas clínicas no
   invocan `rol_actual()` **a propósito** —para que el administrador no tenga rama propia—
   y sus ramas `autor_id = <yo>` no miran el estado de nadie. Con el diseño literal, el
   criterio 8 fallaba: un profesional de baja **seguía leyendo sus propias notas**. Se
   cierra en `historia_desbloqueada()`, que es el único punto por el que pasan las ocho
   tablas clínicas, más un `rol_actual() is not null` al frente de las dos políticas de
   `alertas_documentacion`, que están fuera del candado. **Regla que queda**: toda política
   futura que conceda por `<columna> = auth.uid()` y no lleve candado necesita su propio
   `rol_actual() is not null`.
3. **`caduca_en` y `bloqueado_hasta` son a la vez parámetros de salida de
   `desbloquear_historia()` y columnas de `desbloqueos_historia`.** Sin alias de tabla,
   `column reference "caduca_en" is ambiguous` **en ejecución, no al crear la función**.

Lo que **sigue sin verificarse en navegador**: la enmienda de `rol_actual()` cambia
comportamiento existente (un perfil suspendido o de baja deja de ver todo, incluida la
pantalla de T-000). Comprobado a nivel de base, no de pantalla.

---

**T-001 · Esquema base** — implementado el 22-08-2026 y **corregido tras la primera
revisión**, que devolvió cuatro hallazgos altos y tres medios, todos reproducidos contra
la base y todos arreglados en la misma migración:

| # | Qué estaba mal | Cómo se cierra |
|---|---|---|
| Alto 1 | Carrera de fusión: dos fusiones concurrentes creaban una cadena de dos saltos | `for no key update` al recorrer la cadena |
| Alto 2 | El mínimo legal de retención no tenía suelo: bajar las dos columnas a 1 año pasaba | `check (anios_minimo_legal >= 5)`, constante legal |
| Alto 3 | La fila de retención de la organización se podía **mover** con un `update` | El disparador cubre `delete or update of centro_id` |
| Alto 4 | Una versión sellada se podía reatribuir a otro paciente sin romper la huella | `fn_congelar_cabecera_sellada()` |
| Medio 5 | El índice de la ventana de acceso no deduplicaba con `pestana` nula | `nulls not distinct` |
| Medio 6 | Un consentimiento otorgado podía no guardar el texto firmado | `consentimientos_otorgado_exige_texto` |
| Medio 7 | `es_zona_iana()` sin `execute` para `authenticated` | Concedido |

La **segunda revisión no encontró ningún hallazgo alto** y devolvió tres medios, también
cerrados:

| # | Qué estaba mal | Cómo se cierra |
|---|---|---|
| Medio 1 | La congelación de la cabecera sellada cubría `paciente_id` y `fecha_sesion` y dejaba fuera `autor_id` —que decide **quién puede leer** la nota— y `episodio_id` | Las cuatro columnas en el `update of` y en el `when` |
| Medio 2 | La prueba de la carrera de fusión hacía `rollback`, así que su aserción global **daba cero también con la migración vieja** | `commit`, y se asevera que `A` acaba apuntando a `D` |
| Medio 3 | `accesos_historia_vistas` no ejercía la capa 2: faltaba la novena pieza de «tres capas × tres tablas» | Bloques de `update` y `delete` con el privilegio recuperado, más control de que el disparador cuelga de esa tabla |

Los quince criterios automáticos siguen pasando, y el guion lleva ahora **una prueba nueva
por arreglo con su control positivo**. Sigue **sin ejecutar en navegador** el punto 3 del
guion manual (paseo vertical de T-000 sobre el esquema nuevo): comprobado a nivel de base,
no de pantalla.

> **El patrón de error de este ticket, que conviene no repetir en T-002 y T-003.** Tres
> pruebas distintas estuvieron en verde **por el motivo equivocado**: el `DELETE` del
> criterio 8, que fallaba en la clave ajena y no en el candado; dos bloques «como
> `authenticated`» que devolvían `UPDATE 0` porque con RLS activo y sin política ese rol ni
> ve la fila; y la aserción de la carrera de fusión, que no discriminaba entre la migración
> nueva y la vieja. **Toda prueba negativa necesita su gemela positiva sobre la misma fila**,
> y hay que preguntarse siempre si la prueba seguiría verde con el arreglo quitado.

**T-000 cerrado el 22-08-2026**: los ocho criterios pasan, incluido el recorrido manual en
navegador.

Lo que ha entrado con T-001:
`supabase/migrations/20260822094547_esquema_base_organizacion_paciente_historia.sql`
(22 tablas, 1 vista, 12 enums, 13 funciones, 17 disparadores, 7 índices de clave ajena),
`scripts/t001-esquema.sql` y `lib/supabase/tipos-bd.ts` regenerado. **Ni una política
RLS**: eso es T-002, y hasta entonces las tablas nuevas deniegan todo, que es el estado
correcto.

## Dónde estamos

Fase 0. Primer stack completo armado:

- Migración base: `20260815192424_base_perfiles_pacientes_auditoria.sql` con enum `rol_usuario`, tablas `perfiles`, `pacientes`, `auditoria`, funciones `rol_actual()` e `fn_auditar()`, RLS activo y grants.
- Siembra: dos usuarios `profesional_sanitario` (Ana, Bruno) con un paciente cada uno en `supabase/seed.sql`.
- Cliente Supabase: `lib/supabase/` (config, navegador, servidor, sesión, tipos generados con `npm run tipos`).
- Flujo autenticación: `/login` (correo + contraseña, Server Action) → `/pacientes` (lista de RLS + alta con `crearPaciente`).
- Cierre de sesión en `/pacientes`.
- Validación con Zod en servidor, esquemas compartidos.

**Criterios automáticos pasados** (verificados con `scripts/t000-rls.sql`):
1. `npx supabase db reset` verde sin errores.
2. `npm run lint` y `npm run build` limpios.
3. RLS en `pacientes`: profesional A ve solo sus filas.
4. Inserción con `profesional_id` ajeno es rechazada por RLS (42501).
5. Auditoría: 1 fila por insert con `actor_id` correcto.
6. `UPDATE` y `DELETE` en `auditoria` denegados incluso como `postgres`.
7. `/pacientes` sin sesión redirige a `/login` (307).

**Criterio manual pendiente** (criterio 8): Guion completo en navegador (login A → ver paciente → crear paciente → verificar lista → logout → login B → verificar aislamiento).

## Últimos cambios

- **Revisión con Opus de T-002, 29-08-2026 — un hallazgo ALTO.** Pendiente desde el 22-08.
  **El corte por baja del ADR-032 tenía dos puertas abiertas**, y las dos daban a datos de
  paciente:
  - **`auditoria_lectura_propia`** — `estado_anterior`/`estado_posterior` traen el nombre del
    paciente de cada fila que ese profesional tocó.
  - **`accesos_historia_lectura`** — la rama `perfil_id = auth.uid()` no mira el estado, y
    delata **a qué historias entró y cuándo**. La política sí menciona `rol_actual()`, pero
    **en la otra rama**: por eso una búsqueda por política, y no por rama, no lo ve.

  Reproducido: un profesional en `baja` veía **cero pacientes** —el corte funciona donde se
  aplicó— y a la vez su fila de auditoría **con el nombre del paciente dentro**. Se cierra
  anteponiendo `rol_actual() is not null` a las dos, en
  `20260829180000_revision_corte_por_baja.sql`, con nueve aserciones verdes en
  `scripts/t002-revision-corte-por-baja.sql`.

  **T-004 agrandó la primera puerta sin querer**: colgar la auditoría de las veinticinco
  tablas convirtió el rastro de una tabla en el de todas. El hallazgo es anterior; su alcance
  lo multiplicó ese ticket. **Lección que queda: al ampliar la cobertura de algo, hay que
  revisar quién lee lo ampliado.**

  **La regla, afinada**: no basta con que una política mencione `rol_actual()`. Hay que
  mirarla **rama por rama**: toda rama que conceda por `<columna> = auth.uid()` y no pase por
  el candado necesita el `is not null` delante.

  Lo demás salió limpio, y se comprobó **por catálogo** en vez de leyendo 1431 líneas:
  ninguna tabla sin RLS, ninguna política `UPDATE` con `USING` y sin `WITH CHECK`, ninguna
  `FOR ALL`, ninguna a `public`/`anon`, ninguna función `definer` sin `search_path`. Cuatro
  disparadores `definer` quedan ejecutables por `PUBLIC` y **no es un agujero**: Postgres
  rechaza invocarlos directamente, y se comprobó en vez de suponerlo.

- **Integración de los tres carriles a la vez, 29-08-2026.** Entran en `main` **seis ramas**
  sin un solo conflicto, en el orden del protocolo —base de datos, `lib/`, interfaz—:

  | Rama | Carril | Qué entra |
  |---|---|---|
  | T-004 | fábrica | Auditoría en 25 tablas, tres capas, catálogo y comprobador de cobertura |
  | T-017 | Kimi | `lib/identidad/` — NIF, CIF, IBAN, teléfono, código postal, colegiado |
  | T-018 | Kimi | `lib/fechas/` — zona, semana, intervalos, anomalías, formato. `@date-fns/tz` anclado |
  | T-019 | Kimi | `scripts/lint-migraciones.ts` y `npm run lint:migraciones` |
  | T-007a | MiniMax | Seis primitivas accesibles de `components/ui/` y la base de foco |
  | T-007b | MiniMax | Once piezas de pintura en `components/ui/piezas.tsx` |

  **Estado del conjunto**: `npm test` **188 pruebas en 22 ficheros**, `lint` y `build`
  limpios, `db reset` aplica las **cinco** migraciones, **sin deriva de tipos**, y los dos
  guiones SQL —enmienda de T-002 y T-004— **sin ninguna aserción en falso**.

  **El linter de migraciones de Kimi valida la migración de la fábrica**: `lint:migraciones`
  da limpias las cinco, incluida la de T-004. Es la primera vez que el trabajo de un carril
  comprueba el de otro, y es exactamente para lo que se cortó T-019.

- **Quién escribió qué en T-007, y por qué importa.** El corte **A** —las seis primitivas con
  trampa de foco— lo escribió la fábrica **después de tres vueltas fallidas con MiniMax por
  API**: entregó un diálogo que fallaba 2 de sus propias 4 pruebas, con moldes para callar al
  compilador y animaciones inexistentes; en la segunda vuelta borró la prueba de la trampa de
  foco; en la tercera metió un color literal y movió `role="dialog"` al velo. El corte **B**
  —las piezas de pintura, `div` con texto— lo escribió MiniMax **a la primera y bien**.
  **Regla que queda para repartir interfaz**: donde no hay comportamiento, MiniMax rinde;
  donde hay foco, ARIA y pruebas que no deben pasar por el motivo equivocado, lo escribe la
  fábrica.

- **Aviso de coordinación pagado una vez**: un renombrado de rama —`T-007a-primitivas` a
  `main`— pisó el `main` local y lo dejó dos commits atrás. No se perdió nada porque estaba
  empujado. **`git branch -m` sobre una rama que se llama `main` no avisa**; con tres
  carriles, el `main` de verdad es el de `origin`.

- **El plan pasa a tres carriles, 29-08-2026.** Lo ejecutan **Claude, MiniMax y Kimi** a la
  vez, y **el reparto es por fichero, no por dificultad**. El mapa entero está en
  `CARRILES.md`; cada carril tiene su punto de entrada (`CLAUDE.md` + `fabrica/ORDEN.md`,
  `MINIMAX.md` → `minimax/`, `KIMI.md` → `kimi/`) y su guardarraíl de alcance.
  - **La base de datos tiene un solo dueño.** De ahí sale que **T-006 y T-008 los ejecute
    el carril de Claude aunque sean `sonnet`**: dos carriles escribiendo migraciones las
    ordenan mal entre sí. El modelo del ticket no cambia; cambia quién lo ejecuta.
  - **T-007 y T-009 se parten en entregas** (`minimax/cortes/`). El motivo no es que sean
    largos: es que el grueso de los dos no toca la base de datos y no tiene por qué esperar
    a T-002 ni a T-003, y que una primitiva mal escrita debe costar una rama y no el
    armazón entero — la copian después T-012, T-013 y T-014. **Los tickets no cambian** y
    se cierran cuando entran todos sus cortes.
  - `minimax/verificar.mjs` es la **versión genérica** del guardarraíl: deduce el carril del
    nombre de su carpeta y acepta cortes con letra (`T-007a`). `kimi/verificar.mjs` es su
    gemelo antiguo. **Un arreglo hay que hacerlo dos veces** hasta que se unifiquen, y eso
    conviene hacerlo cuando el carril de Kimi quede libre.
  - El carril de MiniMax **sí lee `docs/interfaz.md`** —es la especificación de sus
    pantallas—; el de Kimi no lee `docs/` en absoluto. **Ninguno de los dos escribe en
    `docs/`**: el material sube por la sección §Para `docs/state.md` de su informe y lo
    transcribe el arquitecto.

- **T-016 integrado, 27-08-2026.** Primer ticket del carril paralelo dentro de `main`.
  El proyecto ya tiene corredor de pruebas —**Vitest 4 + jsdom + Testing Library**— y
  `npm test` cierra en verde con 15 pruebas: los dos esquemas Zod que ya existían
  (`app/login/esquemas.ts` y `app/(app)/pacientes/esquemas.ts`) y la plantilla de
  teclado que T-007 reutiliza por primitiva. Las siete dependencias entran **ancladas de
  versión** y ninguna es de producción. Informe con la salida real de cada criterio en
  `kimi/informes/T-016.md`; lo que se dejó anotado, en `kimi/hallazgos/T-016.md`.

- **Navegación a cuatro módulos y multi-centro, 26-08-2026.** Del esquema de interfaz del
  propietario salen dos ADR más, y uno de ellos reabre T-002.
  - **ADR-050** — siete módulos pasan a **cuatro**: Agenda, Pacientes, Facturación,
    Ajustes. `Inicio` era la agenda del día descrita otra vez y `Clínica` era una bandeja
    que el maestro ya ponía en el panel lateral de Inicio: los dos se vuelven bloques
    **dentro de Agenda**. `Usuarios` baja a Ajustes › Centros y usuarios, donde su permiso
    ya coincidía. **`/` redirige a `/agenda`**, no a `/pacientes`. El módulo sigue
    llamándose **Agenda**, no Calendario: es la palabra de la matriz y de `modulos.ts`.
  - **ADR-051** — un profesional puede pasar consulta en **varios centros**, con vigencia y
    uno principal. Nace `perfiles_centros`; `perfiles.centro_id` sobrevive como **espejo
    del principal** mantenido por disparador (migración hacia delante, no destructiva);
    `centro_actual()` se conserva para el principal y aparece **`centros_actuales()`**
    (`setof uuid`) para las políticas.
  - ⚠ **T-002 vuelve a `en_curso`** con una enmienda al final del ticket. Entra **antes**
    de la revisión con Opus: revisar políticas que vamos a cambiar es trabajo tirado, y hoy
    no hay ni una fila real dentro. Se reescriben con `centros_actuales()` la rama del
    técnico en `pacientes_lectura`, la de `alertas_documentacion`, la vista
    `pacientes_indicador_riesgo` y `fn_rellenar_centro_paciente` —que usa el **principal**,
    porque el centro del paciente decide su retención durante veinticinco años—.
  - **Corrección de un error de redacción del ADR-051**, avisado por el propietario y ya
    arreglado: se llegó a escribir que cerrar la pertenencia a un centro le quita pacientes
    al profesional. **Es falso.** El profesional lee **los suyos** vía
    `es_profesional_asignado()`, que mira `pacientes.profesional_id` y **no consulta el
    centro**. `centros_actuales()` acota **solo al técnico administrativo**. Ampliar el
    alcance de un profesional no es cosa de centros: es que el administrador **le asigne el
    paciente** o lo dé de alta en el episodio. T-002 lleva una prueba dedicada a
    demostrarlo: abrir y cerrar pertenencias **no cambia ni una fila** de lo que lee un
    profesional.
  - **Choque 13** añadido a `interfaz.md` (son trece): Facturación no se parte en «por
    centro» y «por profesional»; es una pantalla con selector que solo ve el administrador.
  - Rechazado del esquema, por chocar con lo cerrado: el conmutador claro/oscuro (ADR-042
    lo deja para v2), los consentimientos dentro de la historia (ADR-048 los sacó hoy
    mismo), y «Observaciones y otros» como cajón de sastre —que además dejaba **Informes**
    sin sitio, y el art. 15 de la Ley 41/2002 lo pone en el contenido mínimo—.
  - Anotado para cuando llegue Ajustes: el **asignador de profesionales a centros** es una
    lista con selector, no dos contenedores con tarjetas. El arrastre es acelerador
    opcional (WCAG 2.2 SC 2.5.7 exige alternativa sin arrastrar; a 360 px no existe), y
    cambiar el centro de un **técnico** pide confirmación explícita y auditoría.
- **ADR-049 · Clasificación regulatoria, 26-08-2026.** Revisando el FOCAD 286 del Consejo
  General de la Psicología aparecen tres reglamentos europeos que el maestro no cubre —el
  maestro reconcilia «cuatro cuerpos normativos» y ninguno es estos—: **MDR (UE) 2017/745**,
  **AI Act (UE) 2024/1689** y **EEDS, Reglamento (UE) 2025/327**.
  - **Psicogestión no es producto sanitario**, y ahora consta por escrito con su motivo.
    La clasificación la hace el fabricante y responde de ella.
  - **Tres funciones cruzan la línea** y exigen ADR previo: corregir una prueba, calcular un
    nivel de riesgo, y triar o proponer tratamiento. ⚠ **La primera está dentro del plan**:
    `interfaz.md` describe Evaluaciones como «pruebas, **corrección** y adjuntos» y la fase 2
    incluye análisis de archivos. Quien redacte ese ticket **se para y escala**.
  - **Sin IA en v1.** La sugerencia de hora es determinista a propósito y deja el AI Act
    fuera entero. Si algún día entra IA, nunca sobre contenido clínico saliendo de la
    instancia (choca con la decisión 1 y con el ADR-038).
  - **El EEDS se vigila, no se implementa.** Psicogestión **es** un sistema de historia
    clínica electrónica: le tocarán interoperabilidad y formato europeo de intercambio.
    El calendario **se confirma contra el texto del reglamento**, no contra el FOCAD, que lo
    cita en un párrafo. Dos hábitos que sí se adoptan ya porque hoy salen gratis: toda
    exportación clínica por la capa de `exportaciones` con formato versionado, y todo código
    clínico guardado con su sistema y su versión.
  - `architecture.md` gana la sección **§Clasificación regulatoria del producto**.
- **Fase 1 abierta por el recorrido de nota en presencial, 26-08-2026.** Cuatro ADR
  cerrados y seis tickets redactados (T-010 a T-015). No se ha implementado nada: fase 0
  manda, y se ejecutan después de T-007.
  - **ADR-045** — `citas.estado` son **cinco** valores (`programada`, `confirmada`,
    `realizada`, `cancelada`, `no_asistida`) y **«en curso» se calcula**, con
    `esta_en_curso()`. Persistirlo exigía reescribir filas auditadas cada minuto.
  - **ADR-046** — el sobre canónico crece con `cita_id`, `abierta_en`, `firmada_en` y
    `redactada_en_sesion`, **dentro de la huella**. Sube `esquema_version`;
    `algoritmo_version` **no**. ⚠ **T-005 no se puede escribir sin leerlo**: si el
    canonicalizador nace con el sobre viejo, añadirlo después abre una era de algoritmo y
    dos formatos para siempre.
  - **ADR-047** — el aviso de sesión es **no modal** (franja + ancla en cabecera) y el
    estado **late, no parpadea**: ciclo ≈2 s, un solo elemento animado a la vez,
    `prefers-reduced-motion` lo detiene, color nunca solo. Es lectura estricta del
    ADR-041, no una excepción; un parpadeo real haría fallar el verificador de T-009.
  - **ADR-048** — «Documentos y consentimientos» sale de Historia clínica y pasa a ser
    **pestaña de la ficha, fuera del candado**, que es lo que las políticas de T-002 ya
    hacían. Historia clínica se queda con **cuatro** sub-pestañas. El enum
    `pestana_historia` **no se toca**: su valor `documentos` queda para adjuntos clínicos.
  - Destilados actualizados en el mismo movimiento: `interfaz.md` §Pacientes reescrita,
    **choque 12** añadido (son doce, no once — corregido también en `architecture.md`
    §Roles) y dos entradas nuevas en §Lo que el prototipo no cubre. `PLAN.md` §Fase 1
    sustituida por los seis tickets con su grafo de dependencias.
  - **La deuda de `notificaciones` que T-002 dejó anotada se recoge en T-015**, junto al
    escalado 0 h · 24 h · 72 h sobre `alertas_documentacion`. La política de `insert` de
    `alertas_documentacion`, que T-002 tampoco escribió, la recoge **T-010**.
- **T-002 cerrado, 22-08-2026.** La matriz de roles deja de ser una tabla en un documento:
  62 políticas en `public` (60 nuevas + las dos de T-000 que se conservan,
  `perfiles_lectura_propia` y `auditoria_lectura_propia`). Deudas de T-001 saldadas: el
  disparador de alta de perfil sobre `auth.users`, el relleno de `pacientes.centro_id`, la
  vista del indicador de riesgo, el `with check` de `accesos_historia_vistas` y los cuatro
  índices que las políticas ponen en un `using`.
- **Fase 0 redactada entera, 22-08-2026.** Los nueve tickets T-001 a T-009 existen ya en
  `tickets/`, escritos contra los destilados y contra la tabla de reparto de ADR de
  `PLAN.md`. Dos fronteras que quedaron fijadas al redactarlos y conviene no volver a
  discutir: **T-001 levanta Organización, Paciente identificativo y Paciente clínico, y
  deja fuera Agenda, Económico, Firmas y Mensajería** —con dos excepciones justificadas,
  `alertas_documentacion` y `zona_horaria` en organización y centro—; y **T-003 tiene
  fijación de datos propia**, independiente del seed de T-008, para que una prueba de RLS
  no dependa de una siembra que alguien retoque.
- **Revisión del propietario, 22-08-2026.** Tres devoluciones del formulario de decisiones:
  - **ADR-032 enmendado**: no todos los pacientes son de la organización. El profesional
    suele ser **autónomo colaborador**, y sus pacientes propios se los lleva.
    `pacientes.titularidad` (`organizacion` por defecto, o `profesional`), la fija el
    administrador. Decide **solo qué pasa en la baja**, no quién factura: el NIF sigue siendo
    uno por instancia, y quien emita con el suyo es otro cliente — misma frontera dura que
    los centros. Al traspasar: exportación cifrada para el profesional, **el original se
    conserva** bajo el reloj de retención, y el saliente pierde el acceso igual.
  - **ADR-040 cambiado**: **todo a mano, sin librería de componentes**. Ni shadcn, ni Radix,
    ni Base UI. Contra la recomendación y contra el maestro, y escrito así con su fecha.
    Consecuencia obligatoria: las primitivas con comportamiento se escriben **una vez** en
    `components/ui/` con lista de comprobación como criterio de aceptación, y el verificador
    del ADR-041 pasa a ser la única red.
  - **ADR-044 cambiado**: **todo funciona desde 360 px**, sin vista degradada ni avisos de
    «mejor en ordenador». El editor de notas y el calendario semanal se diseñan dos veces.
- **ADR-035 a ADR-044 · Las diez que faltaban antes de construir** (22-08-2026). Cinco de
  núcleo y cinco de interfaz, todas bloqueando fase 0. Las tres que más pesan:
  **canonicalización de la huella** (el maestro fija TipTap y JSON, pero «canonicalización»
  aparecía cero veces — sin fijarla, un `npm update` cambia una huella y el verificador
  nocturno no puede distinguirlo de una manipulación); **dónde vive el borrador**, que no
  puede ser una tabla de solo adición; y la **contradicción shadcn/Radix**, que estaba
  escrita en el maestro y desmentida de pasada en este fichero sin que nadie la registrara.
- **Contradicción resuelta**: el maestro fija «Tailwind + shadcn/ui sobre Radix» y este
  fichero decía «Sin shadcn ni Base UI». Lo cierra el **ADR-040**: **Radix directo** para lo
  que tiene comportamiento, vestido con los tokens del ADR-025; shadcn descartado porque su
  juego de tokens pelearía con el destilado del prototipo; a mano lo que es pintura.
- **WCAG 2.2 AA subido al destilado** (ADR-041). Estaba en el maestro como objetivo
  verificado en el pipeline y en ningún destilado, junto con el validador de contraste de la
  personalización de color. Ahora en `interfaz.md` §Accesibilidad.
- **`cacheComponents` se activará en T-007** (ADR-043). Hoy `next.config.ts` está vacío. Ver
  Next.js 16 reminders: la bandera va en la raíz, no bajo `experimental`.
- **ADR-034 · Zona horaria.** Cae del invariante 4 y no era decisión nueva, sino ese
  invariante aplicado al reloj: la serie guarda **hora local + zona IANA**, la cita guarda
  **instante**. La zona vive en el centro heredando de la organización (patrón del
  ADR-033); las anomalías de marzo y octubre se materializan de forma determinista y
  **marcadas como desviación**; nada se recalcula solo. Verificado en el paquete instalado:
  date-fns 4 lleva zonas en **`@date-fns/tz`**, no en `date-fns-tz` — ver Aprendizajes.
- **ADR-027 a ADR-033 · Siete decisiones de fase 0, cerradas de una vez.** Salieron de
  barrer el maestro buscando lo que no menciona. Las tres primeras eran las caras:
  **anotaciones subjetivas** del art. 18.3 («subjetiv» no aparecía ni una vez en el
  maestro, y sin campo propio desde la primera migración el derecho de acceso del paciente
  no se puede atender), **menores y representantes legales** (cero menciones de tutor o
  patria potestad) y el **modo de cifrado del DNI**, que el maestro daba por hecho sin
  decir cómo se busca luego. Después: **pareja y familia**, **fusión de duplicados**
  —prometida en el importador y sin mecánica—, **baja del profesional** y **centros**.
  Reparto por ticket en la tabla de `PLAN.md`.
- **`centros` sale de Hallazgos anotados**: estaba abierto desde el 20-08 y lo cierra el
  ADR-033. La retención cuelga del centro; el centro acota solo al técnico administrativo.
- **Copias de seguridad subidas al destilado** (`architecture.md` §Copias de seguridad).
  Estaban resueltas en el maestro —PITR 7 días, volcado diario cifrado 90 días, volcado
  mensual con huella 7 años, y prueba de restauración trimestral con acta— y no estaban en
  ningún destilado, así que para un agente que solo lee los destilados no existían.
- **ADR-026 · Candado de la historia clínica**: PIN personal de seis dígitos, desbloqueo
  de sesión con ventana de 15 min, hecho cumplir **en RLS** vía `historia_desbloqueada()`.
  Reparte trabajo en T-001 (tablas), T-002 (política), T-003 (prueba negativa) y T-006
  (alta del PIN). Verificado sobre la base local: `pgcrypto` ya instalado
  (`extensions.crypt`), `pgsodium` disponible **sin instalar** y en retirada por Supabase
  — el hash va con bcrypt, y lo que sostiene la seguridad es el bloqueo por intentos, no
  la función de derivación. Ver también `architecture.md` §Candado.
- **`docs/interfaz.md`**: la pestaña «Historia clínica» de la ficha pasa a tener cinco
  sub-pestañas (Historial clínico · Notas clínicas · Evaluaciones · Informes · Documentos)
  y aparece el **choque 11**: la historia tenía dos puertas en el prototipo (ficha y
  módulo `Clínica`) y ahora tiene una sola. Consecuencia de modelo: la bandeja y las
  métricas de Inicio se alimentan de `alertas_documentacion`, no de `notas_clinicas` ni

- Sistema de diseño adoptado desde la maqueta de v0: tokens, fuentes, armazón y las dos
  pantallas reales (`/login`, `/pacientes`) revestidas. Ver sección «Sistema de diseño»
  y ADR-025. `lint` y `build` verdes; la verificación manual del criterio 8 de T-000
  sigue pendiente y ahora se hará sobre la interfaz nueva.
- **`docs/interfaz.md`**: el prototipo destilado a especificación —los cuatro módulos, el
  vocabulario de componentes y diez choques con la matriz de roles, resueltos. Referenciado
  desde `CLAUDE.md`, `architecture.md` §Roles y la plantilla de tickets, que ahora exige
  dos criterios de aceptación nuevos en todo ticket de pantalla.
- T-000 implementado: migraciones, RLS, auditoría, componentes servidor, Server Actions, siembra.
- Patrón de autorización dentro de cada acción (no herencia del Proxy).
- Uso de `useActionState` + Zod en servidor; deuda `react-hook-form` → T-007.

## Sistema de diseño

**La interfaz se especifica en `docs/interfaz.md`** — módulos, vocabulario de componentes
y, lo importante, los diez sitios donde el prototipo choca con la matriz de roles, ya
resueltos. La relación entre prototipo y proyecto es el **ADR-025**. Aquí solo va dónde
vive cada cosa en el código:

| Qué | Dónde |
|---|---|
| Tokens de color y radios | `app/globals.css` |
| Fuentes (Geist + DM Serif Display) | `app/layout.tsx` |
| Armazón: barra lateral y cabecera | `components/armazon/` |
| Lista de módulos y su `disponible` | `components/armazon/modulos.ts` |
| Primitivas de formulario | `components/ui/button.tsx`, `components/ui/field.tsx` |
| Prototipo congelado | `app/prototipo/page.tsx` → `/prototipo` |

Sin shadcn ni Base UI: el prototipo no los usaba. Dependencias nuevas: `lucide-react`,
`clsx`, `tailwind-merge`.

`/prototipo` está **exento de ESLint** y es **ruta pública en `proxy.ts`**, para poder
mirarlo sin sesión ni base de datos. **Antes de producción: protegerlo o borrarlo.**

Las rutas con sesión viven en el grupo `app/(app)/`, que **no añade segmento a la URL**:
`/pacientes` sigue siendo `/pacientes`. `cerrarSesion` pasó de
`app/pacientes/acciones.ts` a `app/(app)/acciones.ts` y ahora vive en la barra lateral.

## Repositorio

`https://github.com/epsicori/psicogestion` — privado, rama `main` sincronizada.

## Bloqueos

Ninguno. Verificación manual pendiente.

## Siguiente paso

> **Fase 0, al día.** Integrado en `main` (29-08-2026): T-000, T-001, T-002 con su enmienda,
> T-004, T-016 a T-019 y los cortes A y B de T-007. **Lo que falta de fase 0 es T-003, T-005,
> T-006, T-008 y T-009**, más los cortes C y D de T-007.
>
> **La revisión con Opus de T-002 está hecha (29-08)** y cerró un hallazgo alto. Lo que
> queda de ese ticket es **el punto 3 del guion manual en navegador** —un perfil
> `suspendido` deja de ver `/pacientes`—, que **no se ha ejecutado nunca** contra la
> aplicación de verdad. Es la única comprobación de fase 0 que sigue viviendo solo sobre el
> papel.
>
> **Después: T-003** (banco de pruebas de RLS), que ahora tiene un caso obligatorio más — el
> corte por baja sobre `auditoria` y `accesos_historia`—, y **T-005**, que no se puede
> escribir sin haber leído el ADR-046.
>
> **Y una deuda de verificación que arrastran los dos cortes de T-007**: 360 px y
> `prefers-reduced-motion` **no se han comprobado en navegador**. jsdom no tiene disposición
> ni consulta de medios. Consta en los dos informes; lo cierra T-009·B con el verificador de
> accesibilidad, o antes una comprobación manual.

> **Paso 0 (superado el 29-08): comitear y empujar `main`.** Hoy el árbol de trabajo tiene sin
> comitear los ADR-045 a 053, los cuatro módulos del ADR-050, los tickets T-010 a T-015, la
> migración de T-002 y `scripts/t002-rls.sql`. **Dos de los tres carriles ramifican de
> `main`** y construirían contra decisiones derogadas: MiniMax leería un `interfaz.md` con
> siete módulos y dibujaría la navegación vieja. No es hipotético, es lo primero que haría.

**Con `main` al día, los tres carriles arrancan a la vez y sin bloquearse** — Claude por la
enmienda de T-002, MiniMax por el corte T-007·A y Kimi por T-018. El reparto completo, en
`CARRILES.md`.

**Y hay una rama esperando antes que todo eso: `T-017-identificadores-espanoles`**, en el
*worktree* `../Psicogestion-kimi`, ya con informe y hallazgos. Siete módulos en
`lib/identidad/` —NIF, IBAN, teléfono, código postal, colegiado, esquemas— con sus pruebas.
Alcance limpio salvo `eslint.config.mjs`, que **no es una salida de carril**: viene del
commit `3797cb0`, cierre de T-016 (ignorar `coverage/`), arrastrado en la misma rama. Entra
tal cual; conviene saberlo solo para no buscarle a T-017 un motivo que no tiene.

**La enmienda de T-002 está hecha (29-08-2026)**; lo que queda de este bloque es **la
revisión con Opus** y el punto 3 del guion manual. Después, **T-004**, que no depende de
T-002 y ya se podía empezar. El texto que sigue es el porqué del orden, y se conserva.

**La enmienda de T-002 (ADR-051, multi-centro), y después la revisión con Opus.** El orden
importa: `perfiles_centros`, `centros_actuales()` y la reescritura de las cuatro políticas
que hoy usan `centro_actual()` entran **antes** de revisar, porque revisar un juego de
políticas que vamos a cambiar es trabajo tirado y ahora mismo no hay ni una fila real
dentro. Después, el punto 3 del guion manual en navegador —un perfil puesto en `suspendido`
deja de ver `/pacientes`— y **T-003**.

**Nota para T-003**: la lista de políticas está en `pg_policies`, y el catálogo comentado,
en la sección 10 del «Diseño aprobado» de `tickets/T-002-rls-politicas.md`. Y **T-003 debe
FIRMAR la nota conjunta en su fijación de datos**: la rama de participación exige
`alcance = 'conjunta'`, que solo existe en la versión sellada, así que una prueba positiva
sobre un borrador saldría verde por el motivo equivocado.

T-004 se puede paralelizar con T-003; T-006, T-007 y T-008 entre sí.

**Aviso para T-005**: el sobre canónico ya no es el de `architecture.md` §Invariante 1. El
**ADR-046** le añade `cita_id`, `abierta_en`, `firmada_en` y `redactada_en_sesion`, y el
canonicalizador tiene que nacer con ellos. Escribirlo con el sobre viejo obliga a convivir
con dos formatos para siempre, porque lo viejo **jamás se recalcula**.

**Fase 1 ya redactada** en `tickets/T-010` a `T-015` y en `PLAN.md` §Fase 1. No se toca
hasta cerrar fase 0. El orden es `T-010 → T-011 → T-014 → T-015`, con `T-013 → T-012` en
paralelo, y **revisión con Opus en los seis**.

**Carril paralelo abierto el 27-08-2026**: `T-016` a `T-020` en `PLAN.md` §Carril paralelo.
Cinco tickets `sonnet` que **no tocan `supabase/`, ni RLS, ni pantalla**, pensados para
ejecutarse fuera de la fábrica y a la vez que la fase 0. **`T-016` está hecho e integrado
en `main`** (27-08-2026): ya hay corredor de pruebas, que era justo lo que T-007 y T-009
daban por hecho. Siguen `T-017`, `T-018` y `T-019` en cualquier orden, y `T-020`
detrás de `T-018`. Ninguno pasa
por diseño ni por revisión con Opus. Las reglas del carril —rama por ticket, zona
prohibida, dependencias ancladas— están en esa misma sección de `PLAN.md`.

## Hallazgos anotados

Detectados fuera del alcance de su ticket (constitución, regla 2). Se anotan aquí y se
recogen cuando llegue la fase que los toca.

### Lo que T-002 dejó anotado y no tocó

- **`enable_signup = true` en `supabase/config.toml`** debe pasar a `false` en el ticket de
  usuarios (T-006). Hoy no es un agujero porque el disparador de alta de perfil es **fallo
  cerrado** —sin `rol` válido en `raw_user_meta_data` el alta de `auth.users` falla—, pero
  depender de eso es depender de una sola línea.
- **El acceso del representante legal (ADR-028) sale de T-002 por decisión del
  propietario.** No es implementable en RLS: un representante no es un `auth.users` ni
  tiene perfil, y el portal del paciente es v2 (decisión 13). No hay sujeto al que aplicar
  una política. **Se traslada al ticket que cree la salida dirigida al paciente** (derecho
  de acceso / exportación), que es donde tendrá sujeto y prueba.
- **El acceso de emergencia del administrador sale de T-002**, confirmado por el
  propietario. Cuando entre, entra por **función `security definer`** con justificación y
  aviso al titular, **jamás por política**: `authenticated` tiene `insert` sobre
  `accesos_historia`, así que una política del tipo «lee si hay emergencia vigente» sería
  auto-servicio de privilegios — cualquiera se escribiría su propia fila.
- **No existe tabla `notificaciones`.** El ADR-026 pide, además de la entrada en
  `auditoria`, **notificación al titular** cuando su PIN se bloquea por intentos. T-002
  escribe la auditoría y deja la notificación pendiente de que exista la tabla.
- **`pacientes.centro_id` nulo es fallo cerrado**, enmendando lo que este fichero proponía
  («resolver el nulo como toda la organización»). La organización puede ser multicentro, y
  ahí un paciente sin centro se filtraría a **todos** los técnicos, que es justo el rol que
  esa columna gobierna. La política del técnico es una igualdad simple; con nulo da `null`,
  o sea, no visible. Como el relleno asigna centro a todos cuando solo hay uno, el caso
  solo puede darse en una instancia multicentro — donde debe darse. Coste: un paciente sin
  centro es invisible para recepción hasta que el administrador se lo asigne.
- **`organizacion` no tiene `grant insert` para `authenticated`**, así que la fila única la
  crea la instalación y no una pantalla. Si el ticket de ajustes quiere crearla desde la
  aplicación, necesita el grant además de la política.
- **`accesos_historia`, `accesos_historia_vistas` y `preferencias_usuario` conceden por
  `<columna> = auth.uid()` sin candado y sin `rol_actual()`**, así que un perfil de baja
  sigue viendo sus propios registros de acceso y sus preferencias. No es dato clínico y
  ningún criterio lo pide, pero si se quiere el corte «entero» del ADR-032 hasta el último
  rincón, ese es el sitio.

### Umbral de volumen de `wa.me` — muerde a partir de ~7 profesionales

La decisión 11 fija `wa.me` como canal y sitúa el umbral de migración en **~40 envíos al
día**. Contra el segmento declarado (consultas de 3 a 20 profesionales), con dos
recordatorios por cita (24 h y 1 h):

| Tamaño | Citas/día | Envíos/día |
|---|---|---|
| Consulta propia | ~6 | ~12 |
| 3 profesionales | ~18 | ~36 |
| 7 profesionales | ~42 | ~84 |
| 20 profesionales | ~120 | ~240 |

En v1 no se cruza —el primer usuario es la consulta propia, decisión 22— pero **la mitad
superior del segmento sí lo cruza**. No es motivo para adoptar la API de WhatsApp: primero
se agota la ergonomía, que baja los envíos reales antes que el coste por envío.

**Mitigaciones, en este orden, cuando entre la mensajería:**

1. **Un solo recordatorio por cita**, el del día anterior. El de 1 h se activa por
   paciente, nunca por defecto: duplica el trabajo de recepción y aporta poco.
2. **No enviar a citas ya confirmadas.** El de 1 h, si existe, solo sobre las que siguen
   sin respuesta.
3. **Agrupar por paciente**: dos citas el mismo día son un mensaje, no dos.
4. **Cola del día con avance automático** (maestro: «una única pantalla con la cola del
   día convierte la tarea en tres minutos de recepción»): al volver de WhatsApp la
   pantalla ya está en el siguiente. Un clic por mensaje, no una navegación por mensaje.

Con las cuatro, 240 envíos brutos caen al orden de 60-80 clics. Si aun así un cliente real
lo cruza, la salida es el **ADR-023**, no contratar a Meta.

### `centros`: cerrado en el ADR-033 — resuelto, no pendiente

Estuvo aquí como hallazgo abierto desde el 20-08-2026. **Se cerró el 21-08-2026 en el
ADR-033** y ya no se decide en T-001: se implementa. En resumen, para no tener que abrir el
ADR cada vez:

- `politicas_retencion` **cuelga del centro**, con la organización como valor por defecto
  heredable. Motivo: los mínimos legales varían por CCAA (cinco años de norma general, hasta
  quince en Cataluña), así que dos centros pueden tener dos mínimos.
- El centro **acota al técnico administrativo y a nadie más**. El profesional sigue a sus
  pacientes entre centros; el administrador ve todos.
- Disponibilidad y festivos por centro; series de facturación por centro opcionales bajo el
  mismo NIF.
- **Frontera dura**: un «centro» con NIF propio no es un centro, es otra instancia y otro
  cliente. Dos NIF en una instancia rompen las decisiones 1 y 2 a la vez.
- **Coste**: 0 €/mes de infraestructura y 1-2 h de configuración. No se cobra cuota por
  centro — duplicaría el cobro del crecimiento que ya captura el tramo por usuario.

### Lo que T-016 dejó anotado y no tocó

- **Aviso de Vite en cada pasada de Vitest** (`vitest.config.ts`): «ESM syntax in a file
  loaded as CommonJS», porque `configLoader: 'native'` será el valor por defecto en una
  major futura de Vite. No es un fallo —los 15 tests van en verde—, pero su arreglo pide
  `"type": "module"` en `package.json` o renombrar la config, y eso toca a Next y al
  resto de herramientas. Se decide cuando el aviso se vuelva error.
- **`npm run lint` avisa dentro de `coverage/`**: `eslint.config.mjs` no excluye la
  carpeta de cobertura, así que en cuanto alguien corre `npm run test:cobertura` aparece
  un warning sobre `coverage/block-navigation.js`, que es código generado por v8. Sale
  con exit 0, pero es ruido: añadir `coverage/**` a los `ignores` del linter cuando se
  toque ese fichero.
- **`vite-tsconfig-paths` sobra a medio plazo**: Vitest avisa de que Vite ya resuelve los
  alias de `tsconfig` con `resolve.tsconfigPaths: true`. Una dependencia menos, cuando
  toque revisar la configuración.

## Aprendizajes

### Pruebas unitarias — dónde viven y cómo se corren

- **El fichero de prueba vive junto al módulo que prueba**: `app/login/esquemas.ts` →
  `app/login/esquemas.test.ts`. No hay carpeta `__tests__` paralela y no se creará.
- `npm test` es una sola pasada y sale (`vitest run`); `npm run test:watch` para
  desarrollar y `npm run test:cobertura` para el informe v8. **La cobertura se mide y no
  se exige**: no hay umbral configurado en ningún sitio, y es a propósito.
- Entorno `jsdom`, `globals: true`, alias `@/…` vía `vite-tsconfig-paths`. Las
  exclusiones salen de `eslint.config.mjs`; no se duplican en dos sitios.
- `components/ui/teclado.test.tsx` es la **plantilla de teclado de T-007**: tabular al
  disparador, abrir, cerrar con Escape, comprobar que el foco vuelve. Se copia por
  primitiva; no se generaliza en un helper.

### Invariante de solo adición — tres capas obligatorias

1. **TRUNCATE es agujero de RLS**: no lo interceptan políticas ni `FOR EACH ROW` triggers. Afecta a `auditoria`, `notas_clinicas_versiones`, `facturas`, `accesos_historia`. Cada tabla de solo adición necesita `BEFORE TRUNCATE ... FOR EACH STATEMENT trigger` + `revoke all on table` + `before update/delete trigger`.
2. **Supabase regala privilegios sin pedir**: `alter default privileges in schema public revoke all on tables from anon, authenticated, service_role` neutraliza TRUNCATE, TRIGGER y REFERENCES que los roles nacen con. Regla: toda tabla nueva se inspecciona con `\dp` en Studio, no se asumen permisos.

### Siembra de auth.users

- Campos `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new` deben ser `''` (no NULL). NULL causa 500 en login (`Database error querying schema` desde GoTrue).
- Causa no es `auth.identities` (si esa fila existe y está bien, el problema es solo en `auth.users`).
- Única prueba válida: `curl` real al endpoint de token, no `db reset` o `lint`/`build`.

### Fechas y horas

- **date-fns 4 lleva zonas horarias en `@date-fns/tz`** (`TZDate`, `tz`). **No es
  `date-fns-tz`**: ese es el paquete de terceros para date-fns 2 y 3, y es lo que el modelo
  trae aprendido. Verificado en `node_modules/date-fns/docs/timeZones.md` del paquete
  instalado (4.4.0). Ninguno de los dos está instalado todavía; entra con el calendario.
- Las horas se formatean **en servidor**, en la zona del centro, y bajan como cadena
  (ADR-034). Es la misma regla que ya obligaba a calcular el saludo y la fecha del armazón
  en servidor: `new Date()` en cliente rompe la hidratación.

### Patrones de proyecto

- `(select auth.uid())` entre paréntesis → InitPlan evaluado 1 vez por sentencia, no por fila.
- `getUser()` para autorizar, nunca `getSession()` (la sesión no se valida contra servidor).
- `exigirSesion()` dentro de cada Server Action, el Proxy es guardia optimista.
- `profesional_id` de la sesión, jamás del formulario.
- `redirect` fuera de `try`; `revalidatePath` actualiza lista sin reload cliente.

### Deuda consciente

- T-000 usa `useActionState` + `required` nativo; `react-hook-form` entra en T-007 con sistema de diseño.
- Entorno: puerto 3000 ocupado, Next arranca en 3002.
- `db reset` y `npm run tipos` van siempre juntos.

### Next.js 16 reminders

- **Cache Components**: la bandera es `cacheComponents: true` en la **raíz** de
  `next.config.ts`, no bajo `experimental`. Verificado en
  `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`. Aún sin activar;
  entra en T-007 (ADR-043).
- **El trabajo asíncrono sin cachear debe ir en `<Suspense>`** o bloquea el prerenderizado
  (`blocking-prerender-dynamic` en el overlay de desarrollo). El sustituto viaja en el
  armazón estático y el contenido llega en flujo.
- **`crypto`, `Date.now()` y los aleatorios disparan `blocking-prerender-*`.** Por eso la
  cadena de huellas (ADR-035) y el formateo de horas (ADR-034) viven en Server Actions y en
  la base, nunca en el render.
- **`use cache: private`** existe y guarda en memoria del navegador. La documentación la
  ofrece para requisitos de cumplimiento; **aquí está prohibida para datos clínicos**
  (ADR-043): dejaría contenido al alcance después de cerrarse el candado del ADR-026.
- Middleware es `proxy.ts` (no `middleware.ts`).
- `cookies()` es async.
- `revalidateTag` exige segundo argumento; `revalidatePath` más seguro.
- `next lint` desapareció; `npm run lint` independiente de `npm run build`.

### Postgres — trampas pagadas en T-002

- **Dos políticas que se consultan mutuamente son recursión, y Postgres lo detecta en
  ejecución**: `infinite recursion detected in policy for relation "…"`. Pasa en cuanto la
  política de A hace `exists (select … from B)` y la de B hace `exists (select … from A)`.
  La salida es una función `security definer` en uno de los dos lados. Un `exists` sobre
  otra tabla dentro de una política **corre bajo la RLS de esa tabla**, y eso a veces es lo
  que se quiere (`accesos_historia_vistas`) y a veces es el bug.
- **Un `out` parameter con el mismo nombre que una columna es ambiguo en plpgsql, y falla
  en EJECUCIÓN, no al crear la función.** `desbloquear_historia()` devuelve `caduca_en` y
  `bloqueado_hasta`, que son columnas de `desbloqueos_historia` y de `pines_historia`.
  Regla: en una función que devuelve `table (…)`, **toda tabla del cuerpo lleva alias**.
- **No existe el agregado `min(uuid)`.** Para «el único centro activo» hay que contar
  primero y leer después, no `select count(*), min(id)`.
- **Un disparador que consulta `rol_actual()` bloquea a la propia migración**, porque la
  migración corre sin JWT y `auth.uid()` es nulo. Por eso el relleno de
  `pacientes.centro_id` va **antes** de crear el disparador de columnas reservadas. Alternativa
  descartada: exonerar «sin sesión», que es un agujero para cualquier rol no autenticado.
- **Un `update … set col = <valor ajeno>` que devuelve `UPDATE 0` no prueba nada**: puede
  ser la RLS ocultando la fila y no la guarda que se quería probar. Toda guarda de columna
  necesita su prueba **sobre una fila que el usuario SÍ puede actualizar** — es el patrón
  de error de T-001 otra vez, y volvió a aparecer aquí.
- **`set local role authenticated` no cambia `auth.uid()`**: eso sale de
  `request.jwt.claims`. Se necesitan las dos cosas, y en los guiones conviene `reset role`
  + `reset request.jwt.claims` entre bloques o el siguiente hereda la sesión del anterior.
  Un bloque «sin desbloqueo» que hereda la ventana abierta del bloque anterior es
  exactamente una prueba verde por el motivo equivocado.
- **Las sentencias que deben fallar dentro de una transacción larga se envuelven en
  `savepoint` / `rollback to savepoint`**, o el primer error aborta el resto del guion.

### Postgres — trampas pagadas en T-001 (léelas antes de tocar RLS o cerrojos)

- **`postgres` NO es superusuario en Supabase local** (`pg_user.usesuper = f`). Por eso el
  `revoke` de la capa 1 del cerrojo de solo adición le muerde de verdad… y por eso muerde
  también donde no se esperaba (los dos puntos siguientes).
- **Una tabla de solo adición no puede ser el destino de una clave ajena.** Insertar en la
  hija dispara una comprobación referencial que corre como propietario y necesita
  `SELECT … FOR KEY SHARE` sobre el padre, lo que exige `UPDATE` o `DELETE` sobre él.
  Revocados esos dos, **nadie puede insertar en la hija**. Por eso
  `accesos_historia_vistas.acceso_id` no lleva clave ajena, igual que
  `auditoria.actor_id` en T-000. Si en fase 1 aparece otra hija de una tabla sellada,
  misma regla: referencia sin clave ajena.
  **Consecuencia que hay que tapar en T-002**: sin clave ajena, la base ya no garantiza
  que `acceso_id` apunte a un acceso existente, y un huérfano aquí **no se puede borrar**
  (la tabla es de solo adición). Así que la política de `insert` de
  `accesos_historia_vistas` **debe llevar un `with check` que exija que el acceso exista
  y sea visible para quien escribe**. Es lo único que queda sujetando esa integridad.
- **`DELETE` sobre `perfiles` y sobre `pacientes` es imposible para cualquier rol,
  SIEMPRE**, no solo cuando la fila tiene datos clínicos. La comprobación referencial de
  `notas_clinicas_versiones` y `accesos_historia` pide el bloqueo **aunque no haya ni una
  fila que comprobar**, y el privilegio para tomarlo no existe. Reproducido con la base
  entera vacía —`versiones = 0`, `accesos = 0`— sobre un paciente recién insertado:
  `ERROR: permission denied for table accesos_historia`. Es coherente con «la baja no
  borra», pero **el `on delete cascade` desde `auth.users` ya no funciona nunca**: borrar
  un usuario de Auth fallará con `42501`. A tener en cuenta en **T-006** (alta y baja de
  usuarios: la baja es `estado = 'baja'`, jamás un `delete`) y en **T-008** (siembra: usar
  `db reset`, nunca borrar usuarios).
- **Dos fusiones concurrentes se cruzaban y creaban una cadena de dos saltos.** El
  recorrido de `fn_normalizar_fusion_paciente()` leía el destino sin bloquearlo, así que
  T1 (`A→B`) y T2 (`B→D`) se cruzaban y dejaban `A→B, B→D` — justo el «un solo salto» del
  que cuelga la RLS de T-002. Se arregla con `for no key update` en el recorrido, y es
  `for no key update` y no `for update` para no chocar con las comprobaciones de clave
  ajena, que toman `for key share`. Probado con dos conexiones y `lock_timeout`.
- **Un `grant select (columnas)` no sirve para acotar por rol en Supabase.** Los tres
  roles del dominio comparten el MISMO rol de base de datos, `authenticated` —el rol vive
  en `perfiles.rol`, no en el rol de Postgres—, así que un grant por columnas o se lo da a
  los tres o a ninguno. **T-002: el indicador binario de `valoraciones_riesgo` necesita
  una VISTA aparte** que exponga solo `(paciente_id, indicador, valorado_en)` con su
  propia RLS. El comentario de la migración que decía lo contrario ya está corregido.
- **El privilegio `EXECUTE` de una función de disparador se comprueba al CREAR el
  disparador, no al dispararlo.** Por eso las `fn_*` no llevan `grant`. La excepción es la
  función que otra función de disparador *security invoker* llama en tiempo de ejecución:
  `fn_validar_zona_horaria()` llama a `es_zona_iana()`, que se comprueba en cada disparo y
  con el rol que escribe. **Ya está concedido** (`grant execute on function
  public.es_zona_iana(text) to authenticated`), así que T-002 no tiene que acordarse: si
  no estuviera, cada alta de centro moriría con `permission denied for function`.
- **Validar una zona horaria con «existe en `pg_timezone_names`» no basta**: el catálogo
  contiene `CET`, `UTC` y `Etc/GMT+2`, prohibidos por el ADR-034. La regla real, ya
  implementada en `es_zona_iana()`: existe **y** contiene `/` **y** no empieza por
  `posix/` **ni** por `Etc/`. Y va en disparador, no en `check`: una `check` no admite
  subconsulta y envolverla en una función `immutable` rompería una restauración.
- **Los privilegios por defecto de secuencias** seguían concediendo `UPDATE` a `anon`,
  `authenticated` y `service_role` pese al `alter default privileges … on tables` de
  T-000. `UPDATE` sobre una secuencia habilita `setval()`, con el que se provoca una
  colisión de clave primaria en una tabla de solo adición. T-001 lo cierra con
  `alter default privileges … on sequences` **y** un `revoke all on all sequences` para
  las que ya existían.
- **Una guarda de dominio tiene que ser una restricción de tabla, no una comparación
  entre dos columnas que el usuario puede editar.** El suelo de retención comparaba
  `anios_historia_clinica >= anios_minimo_legal` con las DOS columnas editables y
  `grant update` a `authenticated`: bajar ambas a 1 año pasaba. El suelo real es
  `check (anios_minimo_legal >= 5)`, una constante legal (art. 17.1). Una CCAA puede
  exigir más y la columna se puede SUBIR; bajar del suelo ya no se puede desde ninguna
  pantalla.
- **Un veto de borrado no es un veto de movimiento.** La fila de retención de la
  organización estaba protegida contra `delete` pero no contra
  `update ... set centro_id = <centro>`, que la sacaba de la herencia sin borrar nada y
  hacía que todos los centros cayeran **en silencio** a los 25/5 constantes del
  `coalesce`. El disparador cubre ahora `before delete or update of centro_id`.
- **Una cabecera mutable junto a una tabla sellada necesita saber qué se congela.**
  `notas_clinicas.paciente_id` y `.fecha_sesion` eran editables después de firmar, y como
  el sobre canónico del ADR-035 no incluye ni el paciente ni la nota, una versión sellada
  se podía reatribuir a otro paciente **sin romper la cadena de huellas**: el verificador
  de T-005 lo habría dado por bueno. Las congela `fn_congelar_cabecera_sellada()` en
  cuanto existe la versión 1. La cabecera sigue siendo mutable **para el borrador**.
- **En un índice único, dos nulos NO chocan salvo con `nulls not distinct`.** La ventana
  de acceso `(desbloqueo_id, paciente_id, pestana)` con `pestana` nulable dejaba entrar
  dos filas por dos `insert ... on conflict do nothing`, y rompía «una apertura, N vistas»
  justo en `exportacion`, `informe` y `emergencia`, que son los accesos sin pestaña.

### Fusionar pacientes ahora puede dar interbloqueo — el importador debe reintentar

Modo de fallo **nuevo**, introducido al cerrar la carrera de fusión de T-001. El
disparador `fn_normalizar_fusion_paciente()` toma `for no key update` sobre la fila
destino, y el propio `UPDATE` toma el mismo bloqueo sobre la fila que se fusiona. Dos
fusiones cruzadas simultáneas —`A→B` y `B→A`— los piden en orden opuesto:

```
ERROR: deadlock detected
CONTEXT: while locking tuple (0,42) in relation "pacientes"
```

**Es el precio correcto**: aborta en vez de corromper. Pero antes no existía, y el error
que ve quien lo provoca es `40P01`, **no** el mensaje del ADR-031. Dos consecuencias que
hay que recoger cuando llegue su ticket:

- **El importador de fase 1 fusiona en lote y tiene que reintentar** ante `40P01`. Sin
  reintento, una importación grande fallará a medias sin motivo aparente.
- Mientras una fusión está abierta, cualquier `UPDATE` de la ficha superviviente —editar
  el nombre, asignar centro— **espera al commit**. Las fusiones son transacciones cortas,
  así que la contención es menor; queda escrito para que no sorprenda.

*Por qué `for no key update` y no `for update`*: `for update` conflictúa con el
`for key share` que toman las comprobaciones de clave ajena, así que cada fusión abierta
habría bloqueado el alta de notas, episodios y accesos de ese paciente. `for no key
update` conflictúa exactamente con lo que hay que serializar y con nada más.

### El suelo de retención es el estatal, no el autonómico

`politicas_retencion` lleva `check (anios_minimo_legal >= 5)`, que es el mínimo del
art. 17.1. **Una CCAA con quince años —Cataluña— sigue pudiendo configurarse a cinco**:
la base no lo impide porque el suelo autonómico es **dato, no esquema**.
`centros.provincia` existe precisamente para resolverlo. Va al ticket de ajustes, no a
una migración.

### Índices de claves ajenas: lo hecho y lo pendiente

T-001 crea los **siete** que muerden ya, por ser los que T-002 va a poner en el `using` de
una política —una política sin índice detrás es un recorrido secuencial **por fila**— más
el de la fusión: `episodios_asistenciales.profesional_id`,
`episodio_participantes.paciente_id`, `notas_clinicas.autor_id`, `notas_clinicas.episodio_id`,
`pacientes.fusionado_en` (parcial, y es el que evita que `fn_repuntar_fusionados()` recorra
la tabla entera en cada fusión), `pacientes.centro_id` y `perfiles.centro_id`.

**Las ~23 claves ajenas restantes siguen sin índice, a propósito**: son columnas de autoría
y trazabilidad (`creado_por`, `valorado_por`, `diagnosticado_por`, `subido_por`,
`actualizado_por`, `traspasado_a`, `fusionado_por`…) por las que todavía no filtra ninguna
consulta, y un índice que nadie usa solo encarece cada escritura. Se añaden cuando exista
la consulta que los justifique — y la que primero aparecerá es la de «qué firmó este
profesional» cuando entren las firmas de fase 1.

### `pacientes.centro_id` nace nulo: T-002 necesita relleno

La columna se añadió nulable (regla de forma: nada `not null` sin `default`, para no romper
el alta de T-000) y `crearPaciente` no la escribe, así que **hoy todos los pacientes tienen
`centro_id` nulo** (verificado: `pacientes_totales = 2, con_centro = 0`). Criterio de
relleno acordado para T-002, en este orden:

1. Si el `profesional_id` del paciente tiene `centro_id`, ese.
2. Si no, el único centro activo, cuando solo haya uno.
3. Si hay varios y no se puede decidir, **se deja nulo y se resuelve como «toda la
   organización»** en la política. Nunca se inventa un centro: un `centro_id` equivocado
   acota mal al técnico administrativo, que es exactamente el rol que ese campo gobierna.

El relleno va en la migración de T-002, no en la aplicación, y después la columna se puede
volver obligatoria para las altas nuevas si el ticket lo pide.

### Fuera del alcance de T-001, para cuando llegue su fase

- **Catálogo precargado de CIE-10-ES**: `diagnosticos` tiene las columnas, pero el
  catálogo no entra en fase 0. Es del ticket de historia clínica de fase 1.
- **Bucket de Storage y sus políticas**: `evaluacion_archivos.ruta` e `informes`,
  `consentimientos`, `representantes_paciente` guardan rutas, pero **T-001 no crea ningún
  bucket ni ninguna política de Storage**. Queda para el ticket de documentos.
- **`dni_indice` único frente al importador**: dos fichas del mismo paciente no pueden
  tener ambas identificación con el mismo documento (consecuencia aceptada del ADR-029).
  El importador de v1 se topará con ello el primer día; la salida es fusionar (ADR-031).
- **Punto abierto (d) del diseño de T-001**: `consentimiento_firmantes` y
  `accesos_historia_vistas` están aprobadas y **hay que subirlas a `docs/architecture.md`
  §Dominios de datos** al cerrar el ticket.

### T-003 · `architecture.md` §Candado enumera ocho tablas; el catálogo dice nueve (o siete)

Al escribir la matriz del banco de RLS (`scripts/rls/02-matriz-roles.sql`,
`03-candado.sql`) contra las políticas reales de T-002, aparecen dos discrepancias con la
lista de `docs/architecture.md` §Candado, que hoy enumera *episodios_asistenciales,
diagnosticos, valoraciones_riesgo, notas_clinicas, notas_clinicas_versiones, evaluaciones,
evaluacion_archivos, informes*:

- **`episodio_participantes` TAMBIÉN pasa por `historia_desbloqueada()`** (verificado en
  `pg_policies`: sin desbloqueo, PRO2 no lee la participación de su propio paciente P2 en
  el episodio de PRO1 — el control está en `03-candado.sql`), y la lista no lo nombra.
- `diagnosticos` y `valoraciones_riesgo` sí están en la lista, pero conviene anotar que
  `valoraciones_riesgo` tiene ADEMÁS una vía fuera del candado —la vista
  `pacientes_indicador_riesgo`, que expone solo el indicador binario al técnico— que la
  lista tampoco menciona.

No se toca el esquema ni la política: es una discrepancia de documentación. Queda para
quien actualice `docs/architecture.md` §Candado (o el próximo ticket que la toque) añadir
`episodio_participantes` a la lista y anotar la vía de la vista.

### T-003 · Revisión con Opus: tres hallazgos aceptados sin cambio, con su porqué

De los seis hallazgos de severidad media/baja de la revisión del 29-08 (los tres de
severidad alta y tres de media se corrigieron en el propio ticket), quedan tres de
severidad baja, aceptados a propósito:

- **La matriz cuenta filas exactas** (`centros = 2`, `alertas_documentacion = 4`) sobre una
  fijación que hoy es la única fuente de datos. Cuando **T-008** (seed determinista) exista,
  esas cuentas exactas pueden romperse si el seed también inserta centros o alertas. La
  salida será clara —un `ASERCIÓN FALLIDA` con el número real— así que no hace falta
  blindarlo ahora; queda anotado para quien escriba T-008: si el banco de RLS rompe al
  correr después del seed, es esto.
- **`11-cobertura.sql` filtra `schemaname = 'public'`**: una política sobre
  `storage.objects` (el bucket de documentos, cuando exista) quedaría fuera del
  comprobador. No entra en T-003 porque **T-001 no crea ningún bucket de Storage
  todavía** (ver más arriba, «Fuera del alcance de T-001»); el ticket que cree el primer
  bucket con políticas debe ampliar el filtro de `11-cobertura.sql` a los esquemas que
  correspondan.
- **La fecha de nacimiento del menor de la fijación** (`current_date - interval '15
  years'`) es relativa a hoy, no un literal. Correcto la inmensa mayoría de los días; el
  caso límite es ejecutar el banco un 29 de febrero, donde el aniversario se desplaza. Se
  deja así porque fijarlo como literal congelaría la edad del menor y el banco dejaría de
  representar "hoy" — el problema que se quería evitar en primer lugar.

### T-003 · Cerrado tras dos pasadas de revisión con Opus

La primera pasada encontró 3 hallazgos ALTA (política "cubierta" solo por nombre en 22
casos; administrador sin prueba negativa en el contenido clínico; una nota individual sin
gemela positiva) y varios MEDIA/BAJA — todos reales, corregidos en `c27905a`.

La reverificación de esa corrección encontró que dos de las propias correcciones eran
solo aparentes (H1: una colisión de clave primaria enmascaraba el rechazo real de RLS en
`preferencias_usuario`; H2: la prueba del administrador contaba con el candado cerrado, sin
distinguir esa causa de "no hay rama de administrador") más cuatro MEDIA/BAJA (políticas de
modificación sin ejercer; dos negativas de alta que un futuro índice único podría
enmascarar; dos ramas de un `OR` sin aislar). Corregidas en `621e4f8`.

Cada corrección de la segunda pasada se verificó reproduciendo la fuga exacta que el
revisor había demostrado —mutando la política en la migración, viendo el banco ponerse
rojo con el mensaje correcto, y restaurando— antes de darla por cerrada. `npm run
test:rls` verde (13 módulos, ~140 aserciones), `npm run lint` y `npm run build` limpios.
