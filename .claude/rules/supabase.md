---
paths:
  - "supabase/**"
  - "scripts/**/*.sql"
  - "lib/supabase/**"
---

# Postgres y Supabase — trampas ya pagadas (se cargan al tocar migraciones o SQL)

Cada línea salió de un ticket. Antes de escribir una migración, léelas enteras.

## Solo adición (constitución, regla 6): tres capas o no hay invariante
- `TRUNCATE` no lo interceptan ni las políticas RLS ni los disparadores `FOR EACH ROW`. Toda tabla de solo adición lleva `BEFORE TRUNCATE ... FOR EACH STATEMENT` + `revoke all on table` + disparador `before update or delete`. (T-004)
- Supabase concede TRUNCATE, TRIGGER y REFERENCES a las tablas nuevas sin pedirlo: `alter default privileges in schema public revoke all on tables from anon, authenticated, service_role`, y lo mismo para **secuencias** (`UPDATE` sobre una secuencia habilita `setval()` y con él una colisión de clave primaria). Toda tabla nueva se inspecciona con `\dp`. (T-001)
- `postgres` **no** es superusuario en Supabase local: los `revoke` le muerden también a él.
- Una tabla de solo adición **no puede ser destino de una clave ajena**: la comprobación referencial pide `FOR KEY SHARE`, que exige UPDATE/DELETE sobre el padre. Referencia sin FK + `with check` en la política de insert que exija que el padre exista. (T-001, T-002)
- `DELETE` sobre `perfiles` y `pacientes` es imposible para cualquier rol, siempre: la baja es `estado = 'baja'`, jamás un delete; `on delete cascade` desde `auth.users` no funciona (42501). Siembra con `db reset`, nunca borrando usuarios. (T-001)
- Una cabecera mutable junto a una tabla sellada necesita saber qué se congela: `fn_congelar_cabecera_sellada()` en cuanto existe la versión 1. (T-001)

## Permisos y RLS
- `grant select (columnas)` no acota por rol: los tres roles del dominio comparten el rol `authenticated`. Lo que un rol no debe ver va en una **vista aparte con su propia RLS**. (T-001)
- Un grant de **tabla entera** deja al llamante elegir columnas que no debería (`algoritmo_version`, `posicion_cadena`…): lo que decide el sistema lo fija un disparador y una guarda 42501. (T-005)
- Dos políticas que se consultan mutuamente son recursión (`infinite recursion detected in policy`): una función `security definer` en uno de los dos lados. Un `exists` sobre otra tabla dentro de una política corre bajo la RLS de esa tabla. (T-002)
- `(select auth.uid())` entre paréntesis: InitPlan una vez por sentencia, no por fila.
- Un disparador que consulta `rol_actual()` bloquea a la propia migración (corre sin JWT): los rellenos van **antes** de crear el disparador. Nunca exonerar "sin sesión". (T-002)
- El privilegio `EXECUTE` de una función de disparador se comprueba al crear el disparador, no al dispararlo; la excepción es la función que otro disparador *security invoker* llama en ejecución (`es_zona_iana()`): esa sí necesita `grant`. (T-001)
- Una guarda de dominio es una restricción de tabla con constante (`check (anios_minimo_legal >= 5)`), no una comparación entre dos columnas editables. Un veto de borrado no es un veto de movimiento: cubrir `update of centro_id`. (T-001)
- En un índice único dos nulos no chocan salvo `nulls not distinct`. (T-001)
- Fusiones concurrentes: `for no key update` en el recorrido (no `for update`, que choca con `for key share`); el interbloqueo 40P01 es el precio correcto y el importador debe reintentar. (T-001)

## SQL y plpgsql
- Un parámetro `out` con el mismo nombre que una columna es ambiguo **en ejecución**: en una función que devuelve `table (…)`, toda tabla del cuerpo lleva alias. (T-002)
- No existe `min(uuid)`: contar primero y leer después. (T-002)
- `jsonb_object_keys()` deduplica claves repetidas; para contar claves de un sobre canónico, `json_object_keys(x::json)`. `->>` de un `null` JSON da `NULL` y `NULL <> x` es falso en un `if`: comparar con `is distinct from`. (T-005)
- U+0000 no se puede insertar en `jsonb` (`22P05`); un escape escrito con las herramientas de edición puede grabar un NUL crudo y romper `db reset` (`08P01`). (T-005)
- Zona horaria válida: existe en `pg_timezone_names` **y** contiene `/` **y** no empieza por `posix/` ni `Etc/` (`es_zona_iana()`), en disparador y no en `check`. (T-001)

## Siembra y tipos
- `auth.users`: `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new` deben ser `''`, no NULL, o el login da 500. La única prueba válida es un `curl` real al endpoint de token. (T-008)
- `npx supabase db reset` y `npm run tipos` van siempre juntos; `lib/supabase/tipos-bd.ts` se genera, nunca se edita, y CI lo compara. Dos ramas que lo regeneran por separado no se fusionan a mano: se regenera tras el `db reset`. (T-009)
- Migraciones siempre hacia delante y nunca destructivas en un solo paso; CI las aplica desde cero **y** de forma incremental (`migration up`).
- El linter de migraciones (`npm run lint:migraciones`) es la regla 6 comprobada por máquina: si falla, no se discute, se corrige.
- **Para saber qué hace hoy una función, la migración que la crea no basta**: hay que buscar cada redefinición posterior (`grep -ln nombre_funcion supabase/migrations/*.sql | tail -1`). El bloqueo del PIN se escribía como `operacion = 'UPDATE'` en `20260822160000` y hoy son `PIN_FALLIDO` y `PIN_BLOQUEADO` por dos migraciones posteriores; una aserción escrita contra la primera falla y parece un bug del producto. (T-006)
- **Una prueba de banco que construye a mano el estado que la aplicación tendría que construir prueba el esquema, no el producto.** `09-accesos.sql` insertaba el acceso y sus vistas a mano, con `desbloqueo_id` nulo, y llevaba meses en verde mientras NO EXISTÍA ninguna función que devolviera el id del desbloqueo vigente: el índice parcial `where desbloqueo_id is not null` quedaba desactivado en silencio y «una apertura, N vistas» era falso. Un criterio que dice «la Server Action hace X» se cierra llamando a lo que llamaría la Server Action. (T-013a)
- **`on conflict` sobre un índice PARCIAL exige repetir su predicado** (`on conflict (a,b,c) where <predicado>`), o Postgres no lo infiere y la sentencia falla en ejecución. Y si el índice lleva `nulls not distinct`, la búsqueda de la fila que el conflicto rechazó va con `is not distinct from`, nunca con `=`. (T-013a)
- **`security definer` se salta la RLS de su propio dueño** salvo `force row level security`, que aquí no se usa: toda función definer que escriba repite a mano lo que exigiría la política, y lo que la política no puede exigir se añade explícito. Comprobar el rol ANTES del candado: un desbloqueo propio y vigente abre *mi* historia, no *cualquier* historia. (T-013a)
- **Mensajes de error con fragmento único**: dos comprobaciones que lanzan el mismo SQLSTATE con textos donde uno es prefijo del otro hacen que `assert_lanza_codigo_msg` pierda precisión. Al añadir un mensaje que empieza como uno viejo, se revisan las aserciones del viejo y se les da un fragmento que solo case con él: `no coincide con la columna autor_id` (6.2) frente a `no coincide con el autor de la cabecera` (6.14). (T-012c H1, H2)
- **Permisos antes que cotejo en disparadores de firma**: un disparador `before insert` con `security definer` que lee una tabla ajena debe comprobar primero que el usuario tiene permiso de escritura (réplica de la política de alta). Solo después coteja datos. El orden de excepciones debe ser independiente de cuál dato contiene el registro. Cierra el oráculo de existencia. (T-012c, ADR-071.5)
- **`to_char(fecha,'YYYY-MM-DD')` pierde la era**: `2026-08-29 BC` y `2026-08-29` salen iguales. Todo cotejo que serialice fechas añade `|| case when fecha < date '0001-01-01' then ' BC' else '' end` o compara como `date`. (T-012c H4)
