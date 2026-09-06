---
id: T-003
titulo: Banco de pruebas de RLS por rol
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-002]
estado: hecho
---

# Contexto

«Cada política tiene su prueba automatizada. **Una política sin test se considera código
no escrito**» (`docs/architecture.md` §RLS). Este ticket construye ese banco y lo deja
detrás de `npm run test:rls`, para que a partir de aquí cada ticket que toque RLS lo
amplíe en vez de improvisar un guion suelto.

Lo importante no es la herramienta, es la **forma de las pruebas**: cada aserción se
ejecuta con la sesión de un rol concreto y afirma un número de filas, no «que funciona».
Y toda prueba negativa —cero filas— va acompañada de su **gemela positiva** con el rol que
sí debe ver, porque una política que lo deniega todo pasaría la mitad de este banco.

Referencias: `docs/architecture.md` §Roles, §RLS, §Candado. ADR **026** (prueba negativa
sin desbloqueo), **027** (las dos partes entran en la huella), **028** (capacidad por
fecha), **029** (índice único rechaza el alta doble), **030** (nota conjunta en dos
historias), **031** (un solo salto, siempre), **032** (el saliente no lee ni lo suyo),
**033** (herencia de retención resuelve, no da nulo), **037** (la lista no genera acceso).

## Tareas

- [x] Elegir e instalar el arnés: **pgTAP** dentro de la base, o un runner en TypeScript
      que abra una conexión por rol. Decidir en la etapa de diseño y **dejar escrito el
      porqué**; lo que no es negociable es que corra con un solo comando y falle con
      código de salida distinto de cero.
- [x] `npm run test:rls` en `package.json`, ejecutable sobre la base local recién
      reseteada.
- [x] **Fijación de datos** propia del banco, independiente del seed de T-008: dos
      centros, un administrador, dos profesionales, un técnico por centro, pacientes de
      ambas titularidades, un episodio conjunto, un paciente fusionado, un menor con
      representante, notas firmadas y borrador.
- [x] **Matriz completa**: por cada tabla del esquema y cada uno de los tres roles, una
      aserción de lo que ve y otra de lo que no. La matriz de `architecture.md` §Roles es
      el guion, fila a fila.
- [x] **Batería del candado** (ADR-026): sin desbloqueo cero filas en las ocho tablas de
      contenido; con desbloqueo, las que le tocan; tras `bloquear`, cero; tras caducar la
      ventana, cero. Y `alertas_documentacion` legible en los cuatro estados.
- [x] **Batería de la baja** (ADR-032): profesional en `baja` no lee ni sus pacientes ni
      sus notas; su autoría sigue registrada en las versiones.
- [x] **Batería del vínculo** (ADR-031): un solo salto, siempre; imposible encadenar.
- [x] **Batería del centro** (ADR-033): el técnico acotado; el profesional no; la herencia
      de `politicas_retencion` **resuelve y nunca da nulo**.
- [x] **Batería de capacidad** (ADR-028): `capacidad_consentimiento` evaluada en tres
      fechas sobre la misma fila —11, 15 y 16 años— sin ninguna bandera almacenada.
- [x] **Batería de identificación** (ADR-029): el índice único rechaza el alta doble; el
      técnico no lee la tabla.
- [x] **Batería de accesos** (ADR-037): listar pacientes **no** crea filas en
      `accesos_historia`; abrir contenido **sí**; dos aperturas dentro de la ventana son
      **una fila con contador 2**.
- [x] **Batería de solo adición**: `update`, `delete` y **`truncate`** fallan en las cuatro
      tablas del invariante 2, incluido como `postgres`.
- [x] Documento corto en el propio banco: **cómo se añade una prueba** cuando un ticket
      futuro añade una política.

## Criterios de aceptación (verificables)

- [x] **Automático** — `npm run test:rls` sobre base recién reseteada: **todo verde**,
      código de salida 0, y su salida nombra cada rol y cada tabla.
- [x] **Automático** — cada política de `pg_policies` tiene al menos una prueba que la
      nombra. Un comprobador dentro del banco lista las políticas **sin cobertura** y
      **falla** si la lista no está vacía.
- [x] **Automático** — comentar una política cualquiera de T-002 hace que el banco
      **falle**. Se demuestra ejecutándolo, no razonándolo.
- [x] **Automático** — el banco distingue «cero filas por política correcta» de «cero filas
      porque no hay datos»: cada aserción negativa tiene su positiva sobre la misma fila
      con otro rol.
- [x] **Automático** — `npm run lint` y `npm run build` limpios.

## Guion de comprobación manual

1. `npx supabase db reset` y `npm run test:rls`: verde.
2. Comenta una política de `pacientes` en la migración, `db reset`, y vuelve a ejecutar:
   **rojo**, y el mensaje dice qué rol vio lo que no debía.
3. Descomenta, `db reset`, verde otra vez.

## Notas para el agente

- El banco corre **contra la base local**, no contra mocks. Un mock de RLS no prueba RLS.
- La sesión se simula con `set local role authenticated` y
  `set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` dentro de una
  transacción con `rollback`, como ya hace `scripts/t000-rls.sql`.
- El contenedor de la base local es **`supabase_db_Psicogestion`** (verificado en T-000);
  no lo teclees de memoria si el proyecto cambia de nombre: sácalo de `docker ps`.
- Este banco es **el que se ejecuta en CI** desde T-009. Escríbelo pensando en que va a
  correr sin humano delante: sin pausas, sin datos aleatorios, sin dependencia de la hora
  del sistema salvo donde la ventana del PIN lo exija — y ahí se manipula la caducidad
  explícitamente, no se espera quince minutos.
- Si al probar aparece una política que falta, **no se escribe aquí**: se anota en
  `docs/state.md` y se abre el arreglo en T-002. Este ticket prueba, no parchea.

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
