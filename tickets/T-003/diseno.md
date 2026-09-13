## Diseño aprobado · 29-08-2026

### 0 · El arnés: SQL con `assert()`, no inspección visual de la salida

Los guiones de T-000/T-001/T-002/T-004 comprueban por **inspección visual**: alguien mira
si los `f` que aparecen son los esperados. Vale para un guion que se ejecuta una vez y lo
lee una persona; **no vale para un banco que corre en CI sin nadie delante** (criterio
explícito del ticket).

Se define `assert(condicion boolean, mensaje text)` — `raise exception` si es falsa — y
`assert_lanza(consulta text, mensaje text)` para las negativas que hoy se comprueban
dejando que psql muestre un error: ejecuta la consulta en un bloque con captura de
excepción y **falla si NO lanza**. Con `-v ON_ERROR_STOP=1`, cualquier aserción rota hace
que **psql salga con código distinto de cero**, sin que nadie tenga que leer la salida.

### 1 · Ficheros, modulares por batería

Los módulos viven en `scripts/rls/*.sql` y se **concatenan en el host** antes de mandarlos
por `stdin` a `psql`: el contenedor de la base no tiene el árbol del repositorio montado,
así que `\i` dentro del contenedor no encontraría los ficheros. `scripts/test-rls.mjs`
hace la concatenación, localiza el contenedor con `docker ps` (nunca de memoria, por si el
proyecto cambia de nombre) y propaga el código de salida de `psql`.

| Fichero | Batería |
|---|---|
| `00-ayudantes.sql` | `assert`, `assert_lanza`, `contar(consulta)` |
| `01-fijacion.sql` | Los datos: ver §2 |
| `02-matriz-roles.sql` | Tabla × rol, la matriz de `architecture.md` §Roles |
| `03-candado.sql` | ADR-026 |
| `04-baja.sql` | ADR-032 |
| `05-vinculo.sql` | ADR-031 |
| `06-centro.sql` | ADR-033, y la enmienda del ADR-051 |
| `07-capacidad.sql` | ADR-028 |
| `08-identificacion.sql` | ADR-029 |
| `09-accesos.sql` | ADR-037 |
| `10-solo-adicion.sql` | Invariante 2, las cuatro tablas |
| `11-cobertura.sql` | El comprobador de políticas sin prueba |
| `12-resto-de-tablas.sql` | Tablas que la matriz no ejercía bajo ningún rol (hallazgo de la revisión con Opus del 29-08) |
| `README.md` | Cómo se añade una prueba |

`npm run test:rls` → `node scripts/test-rls.mjs`.

### 2 · Fijación de datos

Dos centros (`CA`, `CB`); `ADM` sin centro; `PRO1` principal `CA`, `PRO2` principal `CB`;
`TEC1` en `CA`, `TEC2` en `CB`. Pacientes: `P1` de `PRO1`/`CA` (titularidad `organizacion`),
`P2` de `PRO2`/`CB` (titularidad `profesional`), `PMENOR` de 15 años con un representante
en `representantes_paciente`, `PFUS` fusionado en `P2`, `PBAJA` de un profesional `PROBAJA`
puesto en `baja`. Un episodio conjunto de `PRO1` sobre `P1` y `P2` (`episodio_participantes`),
con nota conjunta y nota individual en el mismo episodio — control del criterio 9 de T-002.
Notas: una firmada, una en borrador, una con dos versiones encadenadas. `alertas_documentacion`
con los cuatro estados. `pines_historia` fijado para `PRO1` y `PRO2`; `TEC1` sin PIN
(control de que el técnico no puede tenerlo).

### 3 · La matriz no es un bucle genérico

Un bloque explícito por tabla y rol, **no** una función que itere sobre `information_schema`:
así el «documento corto: cómo se añade una prueba» es literalmente «copia el bloque de al
lado y cambia la tabla», que es lo que un ticket futuro sin contexto de este diseño puede
seguir sin releer el arnés entero.

### 4 · El comprobador de cobertura es un registro declarado, no un análisis estático

`11-cobertura.sql` mantiene un array de **nombres de política** que el banco pretende
cubrir, y lo compara contra `pg_policies`. No analiza si la aserción es profunda —eso lo
juzga la revisión humana—, pero sí que **toda política tiene una entrada**, y falla si el
catálogo tiene una que el array no nombra: es justo el criterio «comentar una política hace
fallar el banco», porque una política comentada desaparece de `pg_policies` y el array
declarado sigue nombrándola: **la comparación falla en el sentido contrario, con nombre**.

### 5 · Lo que no entra, y por qué

`pines_historia` y `desbloqueos_historia` no tienen políticas propias —RLS activo y cero
políticas, correcto—: se prueban por comportamiento de sus funciones, no por política.
`preferencias_usuario` no guarda dato clínico: una fila por rol basta.

## Cierre · dos pasadas de revisión con Opus

La primera pasada (obligatoria: el ticket es `opus` y toca RLS) encontró tres hallazgos
ALTA reales — 22 políticas que `11-cobertura.sql` daba por cubiertas solo porque su
nombre estaba en el array, sin ninguna aserción que las ejerciera; ninguna prueba de que
el administrador NO lee contenido clínico ajeno; la nota individual del episodio conjunto
(control del criterio 9 de T-002) sin su gemela positiva. Corregidos añadiendo
`scripts/rls/12-resto-de-tablas.sql` y los bloques que faltaban en `02-matriz-roles.sql`
y `03-candado.sql`.

La reverificación de esa corrección —con mutaciones reales sobre la base viva, no
lectura de código— encontró que **dos de las propias correcciones eran solo aparentes**:

- La negativa de `preferencias_usuario_alta_propia` usaba el `perfil_id` de un perfil que
  ya tenía fila: el rechazo real era la clave primaria duplicada (23505), no el `with
  check` (42501). Con la política abierta del todo (`with check (true)`), el banco seguía
  en verde.
- La prueba de «el administrador no tiene rama en `notas_clinicas_lectura`» contaba con
  el candado cerrado, así que no distinguía esa causa de la que de verdad quería probar.
  `fijar_pin_historia()` no tiene guarda de rol, así que el administrador SÍ puede
  desbloquear su propia historia — y con el candado abierto de verdad, el hallazgo se
  hace visible.

Ambas, más cuatro hallazgos MEDIA/BAJA (políticas de modificación sin ejercer en
`evaluaciones`, `informes`, `consentimiento_firmantes` y `preferencias_usuario`; dos
negativas de alta que un futuro índice único podría enmascarar; y dos ramas de un `OR`
—`informes_lectura`, `consentimiento_firmantes_lectura`— nunca aisladas la una de la
otra— se corrigieron y **cada corrección se verificó reproduciendo la fuga exacta que el
revisor había demostrado**: mutar la política real en la migración, ver el banco ponerse
rojo con el mensaje que la nombra, restaurar y ver verde de nuevo. Cuatro de esas
reproducciones (las dos ALTA y dos de las de aislamiento de rama) las repitió también
quien implementó, de forma independiente a la reverificación.

**T-003 queda cerrado.** `npm run test:rls` verde con base recién reseteada (13 módulos,
~140 aserciones, código de salida 0); `npm run lint` y `npm run build` limpios.
