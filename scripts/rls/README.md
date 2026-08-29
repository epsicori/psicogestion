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
