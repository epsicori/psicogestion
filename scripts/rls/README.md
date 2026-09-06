# Banco de pruebas de RLS

`npm run test:rls` — ejecuta este banco contra la base local (`npx supabase db reset`
antes, si se quiere partir de cero). Sale con código 0 si todo pasa, distinto de cero si
alguna aserción falla, y la salida nombra el rol y la tabla de la que se trataba.

## Cómo funciona

`scripts/test-rls.mjs` localiza el contenedor de la base con `docker ps` (nunca de
memoria: si el proyecto cambia de nombre, `supabase_db_<nombre>` cambia con él), concatena
en el host todos los `scripts/rls/*.sql` en orden alfabético —el contenedor no tiene el
árbol del repositorio montado, así que un `\i` dentro de él no encontraría los ficheros— y
manda el resultado por `stdin` a `psql -v ON_ERROR_STOP=1`, envuelto en un único
`begin ... rollback`: todos los módulos comparten una sola conexión (y por tanto un solo
`pg_temp`) y ninguno deja rastro en la base.

Cada aserción rota es un `raise exception` (`pg_temp.assert` / `pg_temp.assert_lanza`,
definidos en `00-ayudantes.sql`), y con `ON_ERROR_STOP=1` eso basta para que `psql` —y por
tanto el proceso de Node— salga con código distinto de cero. Nadie tiene que leer la salida
para saber si el banco pasó.

## Los módulos

| Fichero | Qué prueba |
|---|---|
| `00-ayudantes.sql` | `assert`, `assert_lanza`, `contar()`, `como()` / `reset_sesion()` |
| `01-fijacion.sql` | Los datos propios del banco (independientes del seed de T-008) |
| `02-matriz-roles.sql` | Tabla × rol: la matriz de `docs/architecture.md` §Roles |
| `03-candado.sql` | ADR-026 — desbloqueo, `bloquear_historia`, ventana caducada |
| `04-baja.sql` | ADR-032 — el profesional de baja no lee, su autoría sigue registrada |
| `05-vinculo.sql` | ADR-031 — un solo salto de fusión, siempre |
| `06-centro.sql` | ADR-033/051 — el técnico acotado, el profesional no, retención nunca nula |
| `07-capacidad.sql` | ADR-028 — capacidad de consentimiento en tres fechas, sin bandera |
| `08-identificacion.sql` | ADR-029 — el índice único rechaza el alta doble |
| `09-accesos.sql` | ADR-037 — listar no es acceso, abrir sí, dos aperturas cuentan una |
| `10-solo-adicion.sql` | Invariante 2 — `update`/`delete`/`truncate` fallan en las tres capas |
| `11-cobertura.sql` | Toda política de `pg_policies` tiene una entrada declarada, y viceversa |
| `12-resto-de-tablas.sql` | `evaluaciones`, `evaluacion_archivos`, `informes`, `consentimiento_firmantes`, `preferencias_usuario`, `perfiles`, `perfiles_centros`, `politicas_retencion` — las tablas que la matriz y las baterías no ejercían bajo ningún rol |
| `13-cuentas.sql` | T-006a — invitación, baja, TOTP y códigos de recuperación; las dos guardas ALTA del segundo factor reciente |
| `14-cadena-huellas.sql` | T-005 — sellado, encadenado, los tres pares del vector congelado con pgcrypto, las negativas de `fn_sellar_version_nota()`, la manipulación con los cerrojos levantados (una intermedia, y el criterio «no reserializa» en sus dos sentidos) y ADR-031 (fusionar no altera ninguna huella) |
| `15-agenda.sql` | T-010 — los cinco estados y su orden (contrato con T-020), ISODOW documentado, la zona de la serie, el rango bloqueante con su descanso y su restricción de exclusión por nombre, el congelado frente al cambio de ajuste, esta_en_curso(), el recorte de nota_operativa en la auditoría, la alerta de nota sin firmar y la vista del técnico |

## Cómo se añade una prueba

Un ticket futuro que añade o modifica una política de RLS amplía este banco, no escribe un
guion suelto:

1. **Copia el bloque de al lado.** La matriz (`02-matriz-roles.sql`) y las baterías
   temáticas (`03` a `10`) son bloques explícitos por tabla y rol —no hay bucle genérico
   que recorra el esquema—, así que añadir un caso es copiar el bloque más parecido y
   cambiar la tabla, la columna o el rol. Sigue la convención: `pg_temp.como(:ROL)` para
   entrar en la sesión, una o más `pg_temp.assert(...)`, `pg_temp.reset_sesion()` para
   salir.
2. **Toda aserción negativa lleva su gemela positiva** sobre la misma fila con el rol que
   sí debe verla. Un «cero filas» sin esa gemela no distingue una política correcta de una
   que deniega todo, o de una tabla vacía.
3. **Añade el nombre de la política nueva al array de `11-cobertura.sql`.** Si no lo haces,
   el módulo de cobertura falla y dice cuál falta. Si la política desaparece más adelante
   (comentada o borrada) y el nombre se queda en el array sin que nadie lo quite, también
   falla — con el nombre, en el otro sentido.
4. **Si hace falta un dato nuevo en la fijación** (un paciente, un episodio, un perfil),
   añádelo a `01-fijacion.sql` con un UUID que siga el patrón de los ya existentes
   (`xNNNNNNN-0000-4000-8000-…`, con el prefijo de letra según el tipo de entidad) — nunca
   un UUID aleatorio, para que un guion que falla se pueda repetir señalando la misma fila.
5. **Nunca dependas del reloj de verdad.** Si la prueba necesita una ventana caducada
   (como el candado del PIN), se manipula la fecha directamente en la fila, como hace
   `03-candado.sql`; nunca se espera con `pg_sleep`.
6. **Si al probar aparece una política que falta o está mal**, no se arregla aquí: se
   anota en `docs/state.md` y el arreglo va al ticket que la creó. Este banco prueba, no
   parchea.
7. **El estado se filtra entre módulos, a propósito y en orden alfabético de fichero.**
   Todo el banco corre en UNA transacción (`scripts/test-rls.mjs` envuelve la
   concatenación en `begin … rollback`), así que lo que un módulo cambia —`04-baja.sql`
   pone a `PROBAJA` en baja y reasigna `PBAJA` a `PRO1`; `06-centro.sql` añade centros a
   `TEC1` y `PRO1`— sigue así para los módulos que corren después, y nada lo deshace.
   Un módulo nuevo que se inserte ALFABÉTICAMENTE ANTES de uno existente (por ejemplo
   `05a-…`) puede heredar un estado que el diseño original no prevé. Si eso pasa, la
   salida por defecto es añadir el módulo AL FINAL (el siguiente número, `16-…`), no
   intercalarlo; si de verdad tiene que ir en medio, hay que releer los módulos
   posteriores para confirmar que ninguno asume el estado anterior.
8. **Da de alta el dato bajo la sesión del rol que corresponde (`pg_temp.como(...)`), no
   como `postgres`.** Un insert como superusuario no ejerce la política `_alta` de esa
   tabla —ni su `with check`— aunque el dato quede fijado igual de bien; si además la
   comprobación es negativa, usa `pg_temp.assert_lanza` (o `assert_lanza_codigo` si el
   rechazo tiene que venir de una comprobación concreta, no de cualquier disparador que
   se dispare antes en la misma fila) EN SESIÓN, nunca fuera de ella.
9. **Si el dato nuevo incluye una versión de `notas_clinicas_versiones` (T-005),
   `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` y `numero_version` no se
   insertan a mano: los calcula el disparador `fn_sellar_version_nota()`.** Se inserta
   `contenido_canonico` con `pg_temp.sobre_prueba(...)` (00-ayudantes.sql), que construye
   el sobre canónico de once claves. **Cuidado con una trampa real**: el índice único
   *global* sobre `huella` (T-001) hace que dos sobres idénticos byte a byte —mismo
   cuerpo, mismo autor, mismo instante— choquen en el génesis aunque sean de pacientes
   distintos. Cuando dos fixtures comparten cuerpo y autor, varía `creada_en` entre ellas
   (basta un segundo de diferencia).
