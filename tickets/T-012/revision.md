**Ronda 4: sin hallazgos ALTA.** Abiertos tras la ronda 4 en toda la revisión: 0 ALTA · 0 MEDIA · 2 BAJA (R4-H1 y R4-H2, los dos nuevos). R3-H1 y R3-H2 cerrados y medidos con mutantes, y también la misma clase que la ronda 3 dejó anotada fuera del diff (`diagnosticarCeroFilas` y `empezarModificacion`). R1-H1..H4 y R2-H2..H15 siguen cerrados (rondas anteriores). R2-H1 está en T-036.

# T-012 · corte A · Ronda 4 (TypeScript)

**Qué he revisado.** `git diff f075bd6..2300531` en el worktree `agent-aff9f258c26e860b8`. Son cuatro commits (`fb97d11`, `0827363`, `d051f84` y `2300531`), y solo tocan `lib/notas/servidor.ts` y `lib/notas/servidor.test.ts`.

**Línea base.**
- `vitest run lib/notas`: 6 ficheros, 113 pruebas en verde (en una copia del scratchpad).
- `tsc --noEmit` en el worktree: sale 0.
- `eslint` de los dos ficheros: limpio.

**Método.**
- Copié `lib/` y la configuración de vitest al scratchpad, con una unión a `node_modules`.
- Un guion aplica cada mutante (sustitución exacta, comprobando que el patrón aparece una sola vez), ejecuta `vitest run lib/notas` y restaura el fichero.
- Las sondas son pruebas que añadí a la copia y retiré después.
- El worktree no se ha tocado.

## 1 · R3-H1 y R3-H2: cerrados

Todos los mutantes de esta tabla caen, salvo C4, que va en R4-H2.

| Qué | Mutante | Cae |
|---|---|---|
| **R3-H1**, paso 2 de `firmarNota` | **A1**: `!cabLeida.ok → 'bloqueada'` | «firmarNota: si falla la relectura de la cabecera es error…» |
| | **A2**: sin la guarda, el error sigue como `cab = null` | la misma |
| **R3-H1**, relectura tras 42501 | **A3**: `!ok → 'bloqueada'` | «firmarNota 42501: si falla la relectura…» |
| | **A4**: `!ok → 'no_disponible'` | la misma |
| | **A5**: sin la guarda | la misma |
| Gemela del paso 2 | **G1**: `!cab → 'error'` | 2 (la de la tabla de §1.5 y la gemela nueva) |
| **R3-H2**, lectura de la cita | **B1**: sin la guarda de `errorCita` | «abrir por cita: si falla la lectura de la cita es error…» |
| Gemela de la cita | **G2**: `!cita → 'error'` | «la cita que no se ve (sin error) sigue siendo no_disponible» |
| `buscarPorCita` | **B2**: error `→ {ok:true, valor:null}` | «si falla la búsqueda de la nota de la cita es error y no crea nada». Con el mutante se llega a `episodio_para_nota`, y la prueba lo comprueba. |
| Relectura tras 23505 | **B3**: `!ok → 'no_disponible'` | «23505: si la relectura de la búsqueda falla es error» |
| `explicarCeroFilas` | **C1**: sin la guarda de `error` | 2 (las de `guardarBorrador`/`fijarCoprofesional` y `empezarModificacion`) |
| | **C2**: error `→ 'sin_causa'` | la de `empezarModificacion` |
| | **G4**: `!data → 'error'` | «cero filas, sin fila → bloqueada» |
| `empezarModificacion` | **C3**: toma `'error'` por «ya había borrador» | «cero filas y la relectura falla es error…» |
| | **C5**: vuelve a `diagnosticarCeroFilas`, la semántica vieja | la misma |
| | **G5**: `'sin_causa' → 'error'` | «si ya hay borrador no lo pisa» |
| | **D1**: sin la guarda de la versión vigente | «si falla la lectura de la versión vigente es error» |
| | **G3**: `!vigente → 'error'` | 2 (la gemela y «una nota sin versiones no se modifica») |
| Candidatos a coprofesional | **E1**: sin la guarda de `perfiles_centros` | «si falla la lectura de perfiles_centros…» |
| | **E2**: sin la guarda del directorio | «si falla la lectura del directorio…». La prueba no queda verde por la puerta de `nombresDe`: sin versiones ni coprofesional, `nombresDe([])` no consulta, así que solo la guarda nueva da `error`. |
| `diagnosticarCeroFilas` | **C4**: `'sin_causa' → 'bloqueada'` | **ninguna, sobrevive** → R4-H2 |

## 2 · La clase «error de lectura tomado por ausencia» en `lib/notas/`

Recorrí cada `await supabase…` de `servidor.ts`. Los demás ficheros de `lib/notas/` no hacen consultas.

| Lectura | Estado |
|---|---|
| `leerCabeceraLeida`, `leerEpisodio`, `puedeSerConjunta`, `zonaDeLaOrganizacion`, `nombresDe` | Miran `error`. |
| `cargarModelo`: versiones, cita, perfiles del centro, directorio | Miran `error`. |
| `explicarCeroFilas` | Mira `error`. |
| `abrirEditorDeNota`: cita, `buscarPorCita`, episodios para elegir (los tres) | Miran `error`. |
| `empezarModificacion`: versión vigente | Mira `error`. |
| `firmarNota`: cabecera (dos veces), cita, margen del centro, margen de la organización, recuento | Miran `error`. |
| `registrarAccesoHistoria` (RPC, `abrirEditorDeNota:417`) | **Su `motivo:'error'` acaba en `'bloqueada'`** → R4-H1 |
| `refrescarModelo` | Junta «no se ve» y «falló» en `nota: null`, pero no dice que la nota no exista: lo tienen los tres llamantes que ya escribieron, con `ok: true`. Lo juzgó la ronda 3 y no lo reabro. |

`leerCabecera` (el envoltorio) ya no existe y no queda ninguna referencia en el repo.

## 3 · Regresiones buscadas: ninguna

- **`explicarCeroFilas`/`diagnosticarCeroFilas`.** `guardarBorrador` y `fijarCoprofesional` dan lo mismo que antes en las cinco causas y en «sin causa» (`'error'`). Lo único que cambia es que una relectura fallida da `'error'` y no `'bloqueada'`. `empezarModificacion` sigue con `ok:true` cuando la fila existe, es suya y no se actualizó (G5 lo fija). Ahora una relectura fallida devuelve `'error'`, cuando antes salía `'bloqueada'` (C3 y C5 lo fijan). El tipo `MotivoFallo | 'sin_causa'` no sale de `explicarCeroFilas`: ningún `'sin_causa'` llega a un `ResultadoDeNota`, y `tsc` sale 0.
- **`buscarPorCita` con `Leida`.**
  - Encontrar devuelve la nota.
  - No encontrar crea la cabecera (lo prueba la gemela nueva).
  - Fallar devuelve `error` sin llamar al RPC ni insertar.
  - Tras un 23505, solo `ok` con valor abre; un fallo o «nada» dan `error`, igual que antes para «nada».
  - El filtro por `paciente_id` (R2-H8) sigue en su sitio.
- **Borrado de `leerCabecera`.** Sus dos usos de `firmarNota` pasan a `leerCabeceraLeida`. El orden de las guardas del paso 2 no cambia: autor, paciente, borrador, testigo.

## BAJA

### R4-H1 · `lib/notas/servidor.ts:417` · Si falla el registro del acceso, `abrirEditorDeNota` responde `bloqueada`, que lleva a la pantalla del PIN

**Qué pasa.** `registrarAccesoHistoria` distingue dos motivos:
- `'denegado'`: un 42501, porque no hay desbloqueo o porque el paciente no es de quien llama;
- `'error'`: cualquier otro fallo (tiempo agotado, red, ninguna fila).

`abrirEditorDeNota` hace `if (!acceso.ok) return { estado: 'bloqueada' }` y junta los dos casos. En el corte B (diseño, fila de `editor-de-nota.tsx`), `bloqueada` lleva a la pantalla de bloqueo con `FormularioPinHistoria`. Es lo mismo que R3-H1 cerró en la firma, pero en la primera puerta de la apertura. La otra llamante de `registrarAccesoHistoria` (`app/(app)/pacientes/[id]/acciones.ts:97`) no pide el PIN en ese caso: enseña «no se pudo abrir».

**Escenario (medido con una sonda).**
1. Historia desbloqueada.
2. `rpc('registrar_acceso_historia')` devuelve `{code:'57014', message:'canceling statement due to statement timeout'}`.
3. `abrirEditorDeNota(…, {citaId: C, notaId: null})` devuelve `{"estado":"bloqueada"}`.
4. El corte B pide el PIN con la ventana abierta, cuando lo que hay es «vuelve a intentarlo».

No se lee nada clínico, así que ADR-058.2 se cumple. Por eso es BAJA.

**Arreglo.** `acceso.motivo === 'denegado' → bloqueada` y cualquier otro motivo `→ error`, sin tocar ninguna tabla clínica en ninguno de los dos casos. Hace falta una prueba con un código distinto de 42501 que fije `{estado:'error'}` y cero lecturas clínicas. La prueba de ahora («el candado manda», línea 509) solo usa 42501.

**Ojo:** el diseño §1.3 (línea 478) dice literalmente «Si `!ok`, devuelve `{estado:'bloqueada'}`». El arreglo se aparta de esa letra, aunque no de §1.5, que define `bloqueada` como «candado o sin acceso». Lo decide el arquitecto.

### R4-H2 · `lib/notas/servidor.ts:401` · Nada fija que «sin causa» sea `'error'` en `guardarBorrador` y `fijarCoprofesional`

**Qué pasa.** La partición deja la traducción `'sin_causa' → 'error'` en un envoltorio nuevo de una línea. Ninguna prueba la fija: el mutante **C4** (`'sin_causa' → 'bloqueada'`) deja las 113 pruebas en verde. Las pruebas de cero filas de `guardarBorrador` cubren las cinco causas con nombre y la relectura fallida, pero no el caso en que la fila se ve, es de este paciente y de este autor y el testigo coincide.

**Escenario.**
1. `guardarBorrador` con el testigo vigente.
2. El `update` devuelve 0 filas, y la relectura devuelve la fila propia con ese mismo testigo (por ejemplo, una política de UPDATE más estrecha que la de SELECT).
3. Con C4 aplicado, el resultado es `{ok:false, motivo:'bloqueada'}` y se pide el PIN, cuando §1.5 y el comentario de la línea 392 dicen `'error'`.
4. La suite no lo ve.

Antes del diff ya faltaba esa prueba, porque el `return 'error'` final tampoco tenía ninguna. Pero el diff ha movido esa decisión a una función nueva cuyo único contenido es esa línea.

**Arreglo.** Una prueba de `guardarBorrador` (o de `fijarCoprofesional`) con `update → {data: []}` y la relectura de la cabecera propia con `borrador_actualizado_en = TESTIGO` que fije `motivo:'error'`.

## Notas para el orquestador (no son hallazgos)

- `prolongarDesbloqueo` (`lib/cuentas/candado.ts:89`, fuera de `lib/notas/` y del diff) devuelve `null` tanto si falla como si no hay desbloqueo. `caducaEn: null` llega así a las cinco operaciones de `lib/notas/`. Si el corte B lee `caducaEn === null` como «candado cerrado», un fallo pasajero al prolongar se pintaría como bloqueo. Hay que mirarlo al revisar el corte B.

---

**Ronda 3: sin hallazgos ALTA.** Abiertos tras la ronda 3 en toda la revisión: 0 ALTA · 0 MEDIA · 2 BAJA (R3-H1 y R3-H2, los dos nuevos). R2-H12..H15 cerrados y medidos con mutantes. R1-H1..H4 y R2-H2..H11 siguen cerrados (rondas anteriores). R2-H1 está en T-036.

# T-012 · corte A · Ronda 3 (TypeScript)

**Qué he revisado.** `git diff 9694bcc..f075bd6` en el worktree `agent-aff9f258c26e860b8`. Son tres commits: `39299f9` (R2-H12), `3744c0a` (R2-H13) y `f075bd6` (R2-H14, R2-H15). Tocan `lib/notas/sello.ts`, `lib/notas/servidor.ts`, sus pruebas y `lib/i18n/es.ts`.

**Línea base en el worktree.**
- `vitest run lib/notas lib/i18n`: 8 ficheros, 171 pruebas en verde.
- `tsc --noEmit`: sale 0.

**Método.**
- Copié `lib/` y la configuración de vitest al scratchpad, con una unión a `node_modules`.
- Un guion aplica cada mutante (sustitución exacta, comprobando que el patrón aparece una sola vez), ejecuta `vitest run lib/notas` (97 pruebas) y restaura el fichero.
- Las sondas de comportamiento son pruebas añadidas a la copia del scratchpad y retiradas después.
- El worktree no se ha tocado.

## Estado de R2-H12..H15

| Hallazgo | Estado | Mutantes medidos (todos caen) |
|---|---|---|
| R2-H12 | **Cerrado** | **M1**, siempre `sinCita`: caen 4, entre ellas «01/09 → 15/09» y «cruza de año». **M2**, `conAnio` sin `diaFirmada`: caen 2. **M3**, «entre» también con cita: cae «con cita no cambia». La redacción es la que fijó el propietario: fecha y hora en cada extremo, y año en las dos si cruzan de año. Sin cita y el mismo día, la frase sigue siendo «Escrita el {fecha} · {desde}–{hasta}». |
| R2-H13 | **Cerrado** | **M4**, sin `.eq('paciente_id')` en participaciones: cae la prueba de R2-H3. **M5**, sin `.is('baja_en', null)`: cae la misma. |
| R2-H14 | **Cerrado en lo que tocaba** (ver R3-H2 para la otra puerta) | **M6**, `devolver` con `!ok → no_disponible`: caen 9. **M7**, paso 2 con un error de cabecera `→ no_disponible`: cae 1. **M8**, `cargarModelo` con un error de cabecera `→ valor:null`: cae 1. **M9**, error de versiones `→ valor:null`: caen 5. **M16**, **M17** y **M18** (cita, zona y nombres `→ valor:null`): cae 1 cada uno. **M19**, episodio o conjunta `→ valor:null`: caen 3. Gemelas: **M20** (cabecera no visible `→ ok:false`) y **M21** (`valor:null → error`) tiran «sigue siendo no_disponible». Las pruebas fijan el estado exacto con `toEqual`. |
| R2-H15 | **Cerrado** | **M10**, sin `!episodioLeido.ok`: cae solo «guarda del episodio». **M11**, sin `!conjuntaLeida.ok`: caen «puede ser conjunta» y «participantes». **M12**, `puedeSerConjunta` ignorando el error del recuento: caen la de firma (R2-H2) y la de apertura. **M13**, sin la guarda de la cita: cae 1. **M14**, sin la guarda de la zona: cae 1. **M15**, sin la guarda de los nombres: cae la de R2-H6. |

**Regresiones buscadas por el cambio de `cargarModelo` y la partición de `leerCabecera`: ninguna en lo que cambió.**
- Los tres llamantes que ya escribieron (`fijarCoprofesional`, `empezarModificacion`, `firmarNota`) pasan por `refrescarModelo`, que devuelve `null` en los dos casos («no se ve» y «falló»). Concuerda con `ResultadoDeNota`: «`nota` es `null` solo si la versión se selló pero la relectura posterior falló».
- La rama de creación y la de 23505 pasan por `devolver`. Con eso, un fallo justo después de insertar da `error` (prueba nueva, cae con M6 y M9).
- La frase del sello solo se compone en `servidor.ts:318`. El guion `scripts/t012-nota.ts` no la compara con ningún texto. `sin-literales` sigue en verde.
- Lo que sí deja sin arreglar la partición está en R3-H1.

## BAJA

### R3-H1 · `lib/notas/servidor.ts:669` · `firmarNota` sigue tomando un error al releer la cabecera por «historia bloqueada»

**Qué pasa.** La ronda partió `leerCabecera` en dos:
- `leerCabeceraLeida`, con tres desenlaces;
- un envoltorio documentado como «para quien solo necesita "¿se ve?": un fallo de lectura cuenta como "no"».

El único llamante que queda del envoltorio es `firmarNota`, y ahí «no» no es una pregunta de sí o no: se traduce como `fallo('bloqueada')` (paso 2, línea 670), y lo mismo pasa en la relectura tras 42501 (línea 767). El diseño (§1.5, paso 2) dice que `bloqueada` es «sin fila (RLS: candado o sin acceso)». Un error de lectura no es «sin fila». Es la misma confusión que R2-H14 cerró en la apertura, que sigue viva en la firma y que ahora tiene un comentario que la da por buena.

**Escenario (medido con una sonda).**
1. Historia desbloqueada, borrador guardado.
2. Al pulsar «Firmar», la relectura de `notas_clinicas` devuelve un error pasajero.
3. `firmarNota` devuelve `{ok:false, motivo:'bloqueada'}`, con 0 inserciones.
4. El diseño define `bloqueada` como «candado o sin acceso», y el editor del corte B tiene un estado `bloqueada` que lleva a la pantalla de bloqueo con el PIN. El usuario lee «la historia está bloqueada» y se le pide el PIN, aunque la ventana de desbloqueo sigue abierta, cuando lo cierto es «vuelve a intentarlo».
5. Tras la relectura posterior al 42501 pasa lo mismo, y se responde `bloqueada` cuando lo que hay es `no_disponible` o «vuelve a intentarlo».

No se sella nada falso, porque se aborta antes del paso 7. Por eso es BAJA.

**Arreglo.** En `firmarNota`, `leerCabeceraLeida` y `!ok → fallo('error')` en los dos sitios. Hace falta una prueba que fije `motivo:'error'` cuando falla la relectura del paso 2.

**La misma clase, fuera del diff** (para anotar en `docs/state.md`, no la cuento):
- `diagnosticarCeroFilas` (línea 368): no mira `error`, y un fallo da `'bloqueada'` tras un `guardarBorrador` de cero filas.
- `empezarModificacion` (línea 610): no mira el `error` de la versión vigente, y un fallo da `'no_disponible'`.

### R3-H2 · `lib/notas/servidor.ts:423` · Abrir por cita: si falla la lectura de la cita, sigue saliendo `no_disponible`

**Qué pasa.** R2-H14 pedía que «no se pudo leer» no saliera como «no está disponible» al abrir. Se arregló:
- en la puerta `?nota=` (paso 2);
- dentro de `cargarModelo`.

Pero en la puerta por cita (paso 3), que es la que se usa desde la agenda, el paso 3 hace `const { data: cita } = await supabase.from('citas')…` sin desestructurar `error`. Un fallo da `cita = null`, y eso lleva a `{estado:'no_disponible'}`.

**Escenario (medido con una sonda).**
1. `abrirEditorDeNota` con `{citaId: C, notaId: null}`.
2. `registrar_acceso_historia` va bien, pero la lectura de `citas` devuelve un error pasajero.
3. El resultado es `{"estado":"no_disponible"}`, tras las llamadas `rpc:registrar_acceso_historia` y `citas:select`.
4. El corte B dice que la nota no está disponible para una cita propia, en vez de «Vuelve a intentarlo».

Ninguna prueba lo fija: la batería de R2-H14 solo abre por nota, salvo «recién creada la cabecera».

**Arreglo.** Desestructurar `error` en la lectura de la cita del paso 3, con `error → {estado:'error'}`, y una prueba por cita que lo fije. `buscarPorCita` (línea 433) tampoco mira `error`, pero ahí el daño es acotado: se cae al RPC y al insert, el índice da 23505, y la relectura acaba en la nota o en `error`. No lo cuento.

## Notas para el orquestador (no son hallazgos)

- El §2.13 del diseño (línea 634) y la lista de claves (línea 945) siguen con tres frases. La cuarta, `sinCitaVariosDias`, es decisión del propietario del 02-10-2026. Corregirlo es cosa del arquitecto (`tickets/` no es territorio del implementador).
- La pieza P2 de MiniMax para el corte B (`minimax/encargos/T-012b1.md:205`) entrega `notas.sello` con cinco claves y sin `sinCitaVariosDias`. Al integrar `es.ts` habrá que conservar la clave nueva. Si se pierde, `tsc` lo detecta, porque `fraseDelSello` usa `ClaveDeCatalogo`.

---

**Ronda 2: sin hallazgos ALTA.** Abiertos en la ronda 2: 0 ALTA · 0 MEDIA · 4 BAJA (R1, base de datos: 0 · 0 · 0, con R1-H1..H4, R2-H10 y R2-H11 cerrados y medidos; R2, TypeScript: 0 · 0 · 4, R2-H12..H15, con R2-H2..H9 cerrados y medidos; R2-H12 lo decide el arquitecto). R2-H1 pasa a T-036. La ronda 1 queda debajo como historia.

# T-012 · corte A · Revisión 2 de 2 (TypeScript)

**Qué he revisado.** Diff `git diff main...T-012-corte-a` (HEAD `214cbc9`): `lib/notas/**` (con `servidor.ts`), `lib/huella/firmar.ts` y su prueba, y `scripts/t012-nota.ts`.

**Lo que no está en el diff.** Las acciones de `app/(app)/pacientes/[id]/**` y `app/(app)/agenda/notas.ts`. El corte A no tiene pantalla (diseño §8), así que no hay nada que revisar ahí.

**Pruebas unitarias en el worktree.** `vitest run lib/notas lib/huella/firmar.test.ts`: 7 ficheros, 69 pruebas en verde.

**Puntos del §5 «Qué revisar» que se cumplen** (solo los que tocan a TypeScript):
- `firmarNota` no recibe cuerpo, `abiertaEn`, `citaId` ni `episodioId`. Todo sale de la cabecera releída.
- `alcance` solo cuenta si `puedeSerConjunta`.
- `falta_motivo` se devuelve sin `insert`, y la prueba cuenta las inserciones.
- `cita_id` y `fecha_sesion` salen de la cita releída, nunca del cliente.
- `registrarAccesoHistoria` va antes de cualquier lectura clínica.
- Nada usa la clave de servicio. El guion entra con la clave anónima y una sesión real.

Lo que no se cumple va a continuación.

## MEDIA

### R2-H1 · `lib/notas/servidor.ts:567` · Si alguien guarda mientras otro firma, el borrador nuevo se borra sin aviso

**Qué pasa.** El testigo se compara en TypeScript (paso 2), pero el sello se inserta varias consultas después (paso 7). Entre medias nadie vuelve a mirar el borrador:
- `fn_sellar_version_nota` compara la cabecera, pero no el borrador ni el testigo.
- `fn_vaciar_borrador_al_firmar` vacía el borrador que haya en ese momento, no el que se firmó.
- El diseño (§1.5, paso 7) cuenta con que el 23514 avisa de que «la cabecera cambió entre 2 y 7». Ese 23514 solo salta cuando cambian campos de la cabecera.

**Escenario.**
1. En el dispositivo A se pulsa Firmar. A lee el borrador X con el testigo T1.
2. Mientras A hace sus seis lecturas de apoyo, el dispositivo B autoguarda Y. B recibe `ok:true` y el testigo T2.
3. A inserta X, y el disparador vacía el borrador.

**Efecto.** El texto Y de B desaparece de la base y nadie recibe `conflicto`. El siguiente guardado de B recibe `sin_borrador`. Es justo lo que prohíbe el ADR-036: «la segunda escritura se rechaza y avisa en vez de pisar en silencio».

**Por qué no lo cubre lo ya decidido.**
- No es D3: D3 trata dos firmas a la vez, no una firma y un guardado.
- La condición «borrador vivo» prevista para T-036 tampoco lo cierra, porque aquí el borrador sigue vivo: lo que cambia es cuál es.

**Cómo se cierra.** Solo en la base, de una de dos formas: la firma lleva el testigo hasta el disparador, o el disparador vacía el borrador solo si `borrador_actualizado_en` sigue siendo el que se leyó. En TypeScript no hay forma atómica de hacerlo. Decide el propietario: o entra aquí, o se suma a la ampliación de T-036.

### R2-H2 · `lib/notas/servidor.ts:589` · Una lectura que falla se toma por «no hay dato», y el resultado queda sellado

Dos lecturas de apoyo no comprueban `error`, y en las dos el resultado acaba en el sobre.

**a) Margen del centro (589-595).** Si la lectura de `centros` falla, `margenMinutos` queda en `null` y se usa el margen de la organización. El diseño (§2.4) ya obliga a abortar cuando no se puede leer la cita, justo para «no sellar para siempre una afirmación falsa». Aquí esa regla no se aplica.
- **Escenario**: el centro tiene un margen de 5 minutos y la organización de 15, y la lectura de `centros` da un error transitorio. Se sella `margen_sesion_minutos: 15` con `redactada_en_sesion: true`, cuando con 5 minutos sería `false`.
- La prueba «usa el margen del centro si lo tiene» no distingue entre un error y un valor nulo.

**b) Alcance (615 y 144-153).** `puedeSerConjunta` toma como `false` cualquier error al leer `episodios_asistenciales` o `episodio_participantes`.
- **Escenario**: quien firma elige «conjunta» en un episodio de pareja con dos participantes, y una de esas lecturas falla. Se sella `alcance: 'individual'` sin avisar.
- El otro profesional del episodio no podrá leer esa versión (política `notas_clinicas_versiones_lectura`). Solo se arregla con una versión nueva y un motivo.

**Arreglo.** Con `error`, devolver `fallo('error')`. Solo un `data` nulo sin error significa «hereda el margen» o «no admite conjunta».

### R2-H3 · `lib/notas/servidor.ts:383` · La lista para elegir episodio es más corta que la regla que obliga a elegir

`episodio_para_nota` lanza EP001 contando los episodios abiertos del profesional en los que el paciente es titular **o participante** (`episodio_participantes` con `baja_en is null`). La lista que se devuelve solo filtra `.eq('paciente_id', pacienteId)`, así que se deja fuera los episodios en los que el paciente solo participa.

**Escenarios.**
- El paciente P tiene un episodio individual E1 y participa en el episodio de pareja E2 (cuyo `paciente_id` es Q). Al abrir la cita de pareja, el RPC da EP001 y la lista solo trae E1. La nota de la sesión de pareja no se puede colgar de E2.
- Si P solo participa en dos episodios de grupo, la lista llega vacía y `elegir_episodio` con `[]` no tiene salida.

**Arreglo.** La lista tiene que usar el mismo predicado que el RPC. La prueba de EP001 solo cubre episodios en los que el paciente es el titular.

### R2-H4 · `lib/notas/sello.ts:53` · La frase del sello pone una fecha que no es la de cuando se escribió

**Qué pasa.**
- `{fecha}` sale de `fecha_sesion`.
- `mismoDia` compara `abierta_en` con `firmada_en`, pero nunca con esa fecha.
- Cuando las dos horas caen el mismo día se pintan sin fecha, y parecen de `{fecha}`.

**Escenarios.**
- **v2 de una nota con cita.** Sesión el 26/08; modificación abierta y firmada el 15/09 de 10:00 a 10:15. La frase dice «Escrita fuera de la sesión del 26/08 · 10:00–10:15», y se entiende que se escribió el 26/08.
- **Nota sin cita** (las sembradas, que se abren con `?nota=`). La frase dice «Escrita el 26/08 · 10:00–10:15» cuando se escribió el 15/09. Es falsa, y el contrato pide que el sello se enseñe «como un hecho».
- **Año distinto.** `dia()` da `dd/MM` sin año. Un borrador abierto el 02/10/2026 y firmado el 02/10/2027 se pinta como si fuera del mismo día.

**Arreglo.** Comparar el día local de `abierta_en` también con `fecha_sesion`, incluido el año. En la frase sin cita, `{fecha}` tiene que ser el día de `abierta_en`.

### R2-H5 · `lib/notas/servidor.ts:418` · La relectura tras el 23505 de una apertura doble no tiene ninguna prueba

El §5 del diseño lo pide expresamente: «apertura doble → 23505 → releer (prueba con dos llamadas en `Promise.all`)». No hay nada de eso en `servidor.test.ts` ni en el guion. El banco 20 (20.U1) prueba el índice, pero no el camino que sigue la aplicación.

**Escenario.** Un mutante que borre la rama `if (errorAlta.code === '23505')` deja las 69 pruebas en verde. En producción, una apertura doble (StrictMode, o dos dispositivos a la vez) devolvería `{estado:'error'}` a la segunda llamada.

## BAJA

### R2-H6 · `lib/notas/servidor.ts:191` · `cargarModelo` no comprueba el error al leer las versiones

**Escenario.** La lectura de versiones falla, `versiones = []`, y una nota firmada sin borrador se devuelve:
- con `estado: 'borrador'` y sin versiones;
- con `candidatosCoprofesional` rellenos, porque `versiones.length === 0`.

La pantalla del corte B ofrecería elegir coprofesional en una nota sellada. La base contestaría con 42501, que se traduce como `ya_firmada`. Con `nombresDe` pasa lo mismo: si falla, el autor de cada versión sale como `''`.

### R2-H7 · `lib/notas/servidor.ts:607` · Si el recuento de versiones falla, se trata la firma como una v1

**Escenario.** Al modificar, el `count` falla y se toma `versiones` como 0. Entonces:
1. Se descarta el motivo que trae la entrada (628).
2. Se inserta una v2 sin motivo, y el check devuelve 23514.
3. El 23514 se traduce en `conflicto` («se guardó desde otro sitio»), que es falso.

Además, todos los 23514 acaban en `conflicto`, también el 6.8 por desfase de reloj, que el §4.6 del diseño quería traducir como «Vuelve a intentarlo».

### R2-H8 · `lib/notas/servidor.ts:361` · La búsqueda por cita no comprueba que la nota encontrada sea de este paciente

La rama por nota sí lo comprueba (346). `buscarPorCita` filtra por `cita_id` y autor, pero no por `paciente_id`.

**Escenario.** El autor crea por PostgREST una nota suya del paciente Q con el `cita_id` de una cita de P (H27 sigue abierto). Al abrir `?cita=` de P:
- el acceso queda registrado a nombre de P, pero se devuelve la nota de Q, así que el registro de accesos no dice la verdad;
- la nota buena de P no se puede crear: el índice `(cita_id, autor_id)` da 23505 en cada intento, y la relectura vuelve a traer la de Q.

**Arreglo.** Añadir `.eq('paciente_id', pacienteId)`.

### R2-H9 · `lib/notas/servidor.ts:333` · El comentario dice que una nota sin cita no se abre desde aquí, y sí se abre

Con `notaId` y `citaId: null`, el código la abre (344-347). Lo que no se puede hacer desde aquí es **crear** una nota sin cita.

**Escenario.** Quien escriba el corte B se fía del comentario y no enlaza `?nota=` desde la ficha. Las notas sembradas, que no tienen cita, quedan sin forma de abrirse (diseño §2.17).

### R2-H10 · `scripts/t012-nota.ts:73` · `sqlFalla` da por bueno cualquier fallo

El criterio 4 solo comprueba `status !== 0`, y nadie mira el texto de error que devuelve (192-194). No se comprueba el código ni el mensaje del disparador, como piden el §3 del diseño (fila 4) y `.claude/rules/pruebas.md` («el código de error exacto»).

**Escenario.** Una sentencia mal escrita (una columna con una errata, que da 42703) también «falla». La huella no cambia, así que el criterio 4 se da por superado sin haber probado el disparador.

### R2-H11 · `scripts/t012-nota.ts:273` · El guion no firma la v2 que debe dejar `resuelta_en` igual

El criterio A del §3 pide comprobarlo por el camino de la aplicación: firmar después una v2 y ver que `resuelta_en` no cambia. El guion se para en la v1.

**Escenario.** Un resolutor que no filtre por `estado = 'abierta'` pasaría el guion. El banco 20 §A4 sí lo caza, pero insertando como `postgres`, no a través de `lib/notas/servidor.ts`.

## Las tres dudas del implementador

1. **«`firmarNota` puede devolver `ok:true` con `nota:null`»: confirmada, y está bien así.**
   - La versión ya está sellada. Devolver `ok:false` invitaría a reintentar y a duplicar la versión.
   - El corte B tiene que tratar `nota === null` como «firmada; vuelve a abrir».
   - Vale lo mismo para `fijarCoprofesional` y `empezarModificacion`. En esta última, `nota:null` deja la pantalla sin testigo, así que el corte B tiene que reabrir.
   - En el corte A no es un hallazgo.
2. **«Una nota sin cita no se puede abrir por `abrirEditorDeNota`»: descartada.** Se abre por `notaId`; lo que no se puede es crearla. El comentario que confunde es R2-H9.
3. **«`descargarNotaCompleta` es del corte C»: confirmada.** El §8 del diseño pone `exportar.ts` y la descarga en el corte C. Al corte A no le falta nada.

---

# T-012 · corte A · Revisión 1 de 2 (base de datos)

**Qué he revisado.** `git diff main...T-012-corte-a` (HEAD `214cbc9`): la migración `20261002120000_nota_clinica_borrador_firma.sql`, el banco `scripts/rls/20-nota-borrador.sql`, `lib/supabase/tipos-bd.ts`, la fila del README, y del guion y de `servidor.ts` solo lo que toca a la base.

**Método.** Cada mutante del §5 lo he **medido**, no razonado. Un guion del scratchpad repite `test-rls.mjs` desde el worktree, mete un `create or replace` o un `drop/create index` justo después del `begin` y termina en `rollback` (la base local ya tiene aplicada `20261002120000`).

| Mutante | Resultado |
|---|---|
| resolutor sin `c.paciente_id = n.paciente_id` | cae 20.A1 ✔ |
| resolutor sin `c.profesional_id = n.autor_id` | cae 20.A2 ✔ |
| resolutor sin `origen_id = v_cita` | cae 20.A3 ✔ |
| resolutor sin `estado = 'abierta'` | **verde** (R1-H1) |
| `fn_tocar_borrador` que respeta el `abierta_en` del cliente al reabrir (contenido nulo → no nulo) | **verde** (R1-H2) |
| índice único solo sobre `(cita_id)` | **verde** (R1-H3) |
| `fn_tocar_borrador` con salida temprana si `auth.uid() is not null` | **verde** (R1-H4) |

**Puntos del §5 que se cumplen.**
- Check nuevo con `(a is null) = (b is null)`, sin mezclarse con el `num_nonnulls` de antes. Los checks se evalúan por orden de nombre: `notas_clinicas_borrador_abierta_ck` va antes que `notas_clinicas_check`, así que 20.B4 cae por el suyo.
- Índice parcial `where cita_id is not null`.
- Único `definer`: `fn_resolver_alerta_nota_sin_firmar`, con `search_path = ''`, todo calificado con `public.`, `revoke … from public`, el `join` con sus dos condiciones y solo `estado`/`resuelta_en` en `citas`/`nota_sin_firmar`/`abierta`. No puede lanzar: `select into` no estricto y el check de la alerta se cumple. De la nota solo lee `cita_id, paciente_id, autor_id`.
- `postgres` tiene `rolbypassrls` en la base local, igual que la gemela `fn_alertar_nota_sin_firmar`.
- Las negativas 20.A1 y 20.A2 comprueban que la versión entró antes de mirar la alerta. 20.A0 comprueba las cuatro alertas abiertas antes de firmar.
- Constitución, regla 6: el diff no hace UPDATE ni DELETE sobre ninguna de las cuatro tablas. El resolutor actualiza `alertas_documentacion`, que es mutable por diseño.
- `tipos-bd.ts`: las seis entradas nuevas coinciden con las columnas y su nulabilidad. El resolutor no aparece porque es una función de disparador.

**Sobre R2-H1.** Desde la base coincido: `fn_vaciar_borrador_al_firmar` vacía sin condición y `fn_sellar_version_nota` no mira el borrador. No lo cuento otra vez.

## MEDIA

### R1-H1 · `scripts/rls/20-nota-borrador.sql:262` · 20.A4 no puede ponerse roja: `now()` es el mismo en todo el banco

**Qué pasa.** El banco corre en un único `begin … rollback`, así que `now()` vale lo mismo en 20.A3 y en 20.A4. Un resolutor sin `estado = 'abierta'` vuelve a escribir `resuelta_en = now()` con la v2, y el valor es idéntico al que dejó la v1. La aserción «deja intacto el `resuelta_en`» no puede distinguir los dos casos. Lo he medido: con ese mutante, el banco acaba completo y con salida 0.

**Escenario.** Se quita `and estado = 'abierta'` del resolutor. En producción cada v2 mueve `resuelta_en` a la fecha de la modificación, y la bandeja enseña la alerta como resuelta semanas después de la firma real. El banco y el guion siguen en verde: el guion no firma ninguna v2 sobre la cita de ayer.

**Nota.** R2-H11 da por hecho que «el banco 20 §A4 sí lo caza». No lo caza, así que el mutante no lo detecta nada.

**Arreglo.** Antes de la v2, envejecer la alerta como `postgres` (`update … set resuelta_en = now() - interval '1 day'`) y exigir que siga en ese valor. O que el guion firme la v2 de la cita de ayer, que corre en otra transacción.

### R1-H2 · `supabase/migrations/20261002120000_nota_clinica_borrador_firma.sql:51` · Nada prueba que al reabrir el borrador se ignore el `abierta_en` del cliente

**Qué pasa.** El contrato pide «`abierta_en` se fija la primera vez que se abre el editor **para esa versión**». En la v2 y siguientes, eso ocurre en la rama UPDATE con el contenido pasando de nulo a no nulo (`empezarModificacion`, o una cabecera creada sin borrador). Las pruebas del banco cubren otras dos ramas: 20.B1 el INSERT y 20.B2/B3 el UPDATE con borrador ya vivo. He medido un mutante que en esa rama hace `coalesce(old.borrador_abierta_en, new.borrador_abierta_en)` y el banco queda en verde.

**Escenario.** Después de firmar la v1, el autor hace por PostgREST `update notas_clinicas set borrador_contenido = '{…}', borrador_abierta_en = '<inicio de la cita>' where id = …`. Con el mutante, la v2 sella un `abierta_en` elegido por el cliente. Es justo la columna que T-036 va a cotejar para cerrar D1, así que la defensa de T-036 se apoyaría en una rama sin prueba.

**Arreglo.** Una aserción más en §B: firmar `NB`, reabrir con un UPDATE que mande `borrador_abierta_en = '2003-01-01'` y exigir `= now()`.

## BAJA

### R1-H3 · `scripts/rls/20-nota-borrador.sql:143` · El comentario anuncia una gemela «otro autor con la misma cita» que no existe

**Qué pasa.** 20.U2 solo prueba dos notas **sin** cita. Con el índice recortado a `(cita_id)` y el mismo nombre, el banco queda en verde (medido). El README dice además que hay «dos mutantes que demuestran cada guarda», y tampoco es así: MUT1 y MUT2 solo apagan disparadores enteros.

**Escenario.** Se traspasa la cita C de A a B cuando A ya tenía su borrador (`cita_id = C`). Con el índice recortado, `abrirEditorDeNota` de B recibe 23505 y relee por `autor_id = B`. No encuentra nada y devuelve `error`, y B no puede escribir la nota de su cita.

**Arreglo.** Una positiva que no lance: otra cabecera sobre `C5` con otro autor que tenga su propio episodio de P20 (por ejemplo, PRO2 con un episodio suyo, porque el disparador de T-034 ata el autor al episodio).

### R1-H4 · `scripts/rls/20-nota-borrador.sql:46` · El §B se ejecuta como `postgres`, y el diseño pide `authenticated`

**Qué pasa.** El diseño, en §3 («las pruebas del banco 20 hacen como `authenticated` lo que haría la acción, salvo las de §A») y en §5 («la prueba tiene que ser un `update` crudo como `authenticated`»), pide otra cosa. Todo el §B corre como `postgres`. He medido un `fn_tocar_borrador` con salida temprana `if auth.uid() is not null … then return new`, que es la forma de la salida anti-oráculo de T-034 en este mismo repo, y el banco queda en verde.

**Escenario.** Un ticket futuro añade a `fn_tocar_borrador` una salida de ese tipo. Desde ese momento el profesional, por PostgREST, vuelve a elegir `borrador_abierta_en` y el testigo, y ninguna prueba se entera.

**Arreglo.** Repetir 20.B1 y 20.B3 con `pg_temp.como(PRO1)` y el candado abierto.

---

# T-012 · corte A · Ronda 2 · revisor 1 (base de datos)

**Qué he revisado.** `git diff 214cbc9..9694bcc` en la rama `T-012-corte-a`: `scripts/rls/20-nota-borrador.sql`, la fila del README de `scripts/rls/` y `scripts/t012-nota.ts`. La migración no cambia en esta ronda. `servidor.ts` y `sello.ts` son de la revisión 2.

**Sin hallazgos abiertos en la ronda 2 (0 ALTA · 0 MEDIA · 0 BAJA).**

**Método.** He medido los mutantes, no los he razonado.
- **Base local.** Comprobé en `pg_proc` y `pg_indexes` que tiene aplicada `20261002120000`, con `fn_tocar_borrador`, `fn_resolver_alerta_nota_sin_firmar` e índice idénticos a la migración.
- **Mutantes del banco.** Un guion del scratchpad concatena `scripts/rls/*.sql` del worktree, como `test-rls.mjs`. Cada mutante va justo después del `begin` (un `create or replace` sacado de `pg_get_functiondef` con `sed`, o un `drop/create index`) y todo acaba en `rollback`.
- **Línea base.** El banco completo sale 0 y escribe «20-nota-borrador: completa.».

| Mutante | Cae | ¿El bloque final del banco lo anuncia? |
|---|---|---|
| resolutor sin `and estado = 'abierta'` | 20.A4 | sí ✔ |
| `fn_tocar_borrador` que en la rama UPDATE, al reabrir, toma `coalesce(old, new.borrador_abierta_en)` | 20.B6 | sí ✔ |
| `fn_tocar_borrador` con `if auth.uid() is not null then return new` al principio | 20.B7 (INSERT) | sí ✔ |
| índice reducido a `(cita_id)` | 20.U3 (lanzó 23505) | sí ✔ |
| salida temprana solo en UPDATE como `authenticated` (mío) | 20.B7 (UPDATE) | — |
| sin cambio de contenido, el testigo es `coalesce(new, old)` (mío) | 20.B3 | — |

Los dos mutantes que he añadido yo demuestran dos cosas:
- El UPDATE de 20.B7 como `authenticated` sí toca la fila: no queda verde porque la RLS deje 0 filas.
- La parte «el testigo no se mueve» sigue discriminando.

**Cierre de la ronda 1, uno por uno.**
- **R1-H1, cerrado.** 20.A4 envejece la alerta como `postgres` (`resuelta_en = now() - 1 day`), y una preparación comprueba que ha quedado envejecida. Con el resolutor sin el filtro, la v2 escribe `now()` y la aserción cae (medido).
- **R1-H2, cerrado.** 20.B6 reabre `NB` tras firmar, con un `borrador_abierta_en = 2003-01-01`, y exige `now()`. Cae con el mutante de la rama «reabrir» (medido). Con ella, las tres ramas `TG_OP` × «el viejo era nulo» ya tienen prueba (B1, B2/B3, B6).
- **R1-H3, cerrado.**
  - 20.U3: PRO2, con su propio episodio de P20 (por el disparador de autoría de T-034), inserta su cabecera sobre la misma `C5`.
  - Cae con el índice reducido (medido).
  - El comentario «Gemelas: otro autor con la misma cita…» ya es cierto.
  - La frase del README sobre los mutantes describe ahora lo que hay: MUT1 y MUT2 en el banco, más cuatro anotados y verificados a mano. Los cuatro los he repetido y se cumplen.
- **R1-H4, cerrado.**
  - 20.B7 repite B1 (INSERT) y B3 (UPDATE sin cambio de contenido) con `pg_temp.como(PRO1)` y la historia desbloqueada.
  - El PIN `111111` lo fija el propio bloque con `como_con_2fa` + `fijar_pin_historia`, sin depender del que deja otro módulo.
  - Cae con la salida temprana general y con la de solo UPDATE (las dos medidas).
  - B2 y B6 siguen corriendo solo como `postgres`. Para que eso se notara haría falta un mutante con dos condiciones (`authenticated` y rama concreta), así que no lo cuento.

**R2-H10 y R2-H11 (el guion).**
- **R2-H10, cerrado.** `sqlFalla` exige ahora `/permission denied for table notas_clinicas_versiones|notas_clinicas_versiones es de solo adición/`. Una errata (42703) o un permiso sobre otra tabla ya no pasa. Medí los mensajes reales como `postgres`:
  - UPDATE y DELETE: `permission denied for table notas_clinicas_versiones`. Lo frena el REVOKE, que se evalúa antes que el disparador.
  - TRUNCATE: `La tabla notas_clinicas_versiones es de solo adición`. Lo frena el disparador de sentencia.
  - Matiz: el §3 del diseño (fila 4) dice «fallan con el error de la capa de disparador», y para UPDATE y DELETE no es así. Pero la capa que responde es otra guarda real de la base. Si se quita cualquiera de las dos capas, la otra sigue impidiendo la escritura, así que no hay ningún escenario en que se modifique la fila. No es un hallazgo.
- **R2-H11, cerrado.** El guion firma la v2 de la nota de ayer (`empezarModificacion` → `guardarBorrador` → `firmarNota` con motivo) y compara `resuelta_en::text` antes y después.
  - Ejecutado contra la base local: «✓ R2-H11 · firmar una v2 deja intacto el resuelta_en…».
  - Con el resolutor sin `estado = 'abierta'` aplicado en la base viva: «✗ FALLO en «4 · cita de ayer»: firmar la v2 movió resuelta_en de una alerta ya resuelta».
  - Discrimina porque la v1 y la v2 van en transacciones distintas.

**Regresiones buscadas en el banco 20 y en el guion: ninguna.**
- B6 vuelve a abrir `NB`, que ya está firmada, y ninguna aserción posterior usa `NB`.
- `NA`, `EP2` y `NP2` no entran en los recuentos de §A, que filtran por C1-C4.
- 20 es el último módulo, así que el PIN de PRO1 no lo hereda nadie.
- En el guion, el bloque de R2-H11 va al final, después del criterio A, y no cambia nada de lo anterior.

**Estado de la base local tras la revisión.**
- Los seis mutantes del banco corrieron dentro de `begin … rollback`.
- El único mutante en la base viva (el resolutor, para medir el guion) lo restauré desde el `pg_get_functiondef` capturado antes. El md5 de la definición es el mismo antes y después (`3dbb9b6c…`).
- **No he ejecutado `npx supabase db reset`.** Habría borrado la siembra que usan el guion y, quizá, el revisor 2 en paralelo, y no hacía falta para restaurar nada.
- Las dos ejecuciones del guion dejaron confirmados dos pacientes de prueba, como hace siempre el guion; está escrito para poder repetirse.

---

# T-012 · corte A · Ronda 2 · revisor 2 (TypeScript)

**Qué he revisado.** `git diff 214cbc9..9694bcc` en el worktree `agent-aff9f258c26e860b8`: los commits `a8d98e4` (lib/notas) y `9447692` (guion). El `9694bcc` es del banco 20 y lo deja al revisor 1. `vitest run lib/notas`: 6 ficheros, 84 pruebas en verde.

**Método.** Cada arreglo lo he **medido** con un mutante, no razonado. Copié `lib/` y la configuración de vitest al scratchpad, apliqué un mutante cada vez, ejecuté `lib/notas` y restauré. El worktree no se ha tocado.

## Estado de los hallazgos de la ronda 1

| Hallazgo | Estado | Prueba de que se cierra |
|---|---|---|
| R2-H1 | Fuera: pasa a T-036 | — |
| R2-H2 | **Cerrado** | Si se ignora el error de la lectura del centro, de la organización, del episodio o del recuento de participantes, cae la prueba de cada caso. |
| R2-H3 | **Cerrado en el código** | Si se quita la consulta de participantes, caen las dos pruebas. La prueba deja libres dos filtros: ver R2-H13. |
| R2-H4 | **Cerrado** | Caen las pruebas con cada uno de estos mutantes: `mismoDia` sin la fecha, el año sin `diaFecha`, `{fecha}` siempre igual a `fecha_sesion`, y el año sin `diaFirmada`. Mi juicio sobre la redacción, más abajo. |
| R2-H5 | **Cerrado** | Si se quita la rama `23505`, cae la prueba con `Promise.all`. Su gemela («23505 sin nada que releer → `error`») también da `error` sin la rama: no la discrimina, pero tampoco lo pretende. |
| R2-H6 | **Cerrado** | Si se ignora el error de las versiones o `nombresDe` devuelve el mapa vacío, cae la prueba. Ahora el resultado está mal etiquetado: ver R2-H14. |
| R2-H7 | **Cerrado** | Si el recuento vuelve a `count ?? 0`, cae la prueba. Si todo 23514 se traduce como `error`, cae «23514 → conflicto». Detectar el 6.8 por el fragmento `abierta_en` está bien: en `fn_sellar_version_nota` lo contienen tres mensajes (6.8, «debe ser una cadena» y «no son un instante ISO-8601») y ninguno es un conflicto. |
| R2-H8 | **Cerrado en lo que TypeScript puede cerrar** | Si se quita `.eq('paciente_id')`, cae la prueba. La otra mitad del escenario sigue igual porque depende de H27: mientras exista la nota ajena, la de P no se puede crear (el índice da 23505 y la relectura filtrada devuelve `error`). El comentario «se creó la nota buena» de la prueba (`servidor.test.ts:777`) describe lo que hace el simulador, no lo que haría la base. |
| R2-H9 | **Cerrado** | El comentario ya dice lo correcto. |
| R2-H10 | **Cerrado** (por lectura) | La expresión exige «permission denied for table notas_clinicas_versiones» o «notas_clinicas_versiones es de solo adición», que es el texto que lanza el disparador de solo adición. Un error 42703 no encaja. |
| R2-H11 | **Cerrado** (por lectura, sin ejecutar el guion) | La v2 se firma en otra transacción, así que `now()` cambia. Un resolutor sin `estado = 'abierta'` movería `resuelta_en` y el `assert` caería. |

## Juicio sobre la redacción del sello (R2-H4)

**Las tres reglas son correctas, y en los casos que he recorrido la frase no afirma nada falso:**
- v1 escrita en sesión el mismo día: «Escrita durante la sesión del 26/08 · 10:00–10:50».
- Sesión que cruza la medianoche (sesión del 26/08, escrita de 23:35 a 00:10): «durante la sesión del 26/08 · 26/08 23:35–27/08 00:10».
- v2 escrita semanas después: «fuera de la sesión del 26/08 · 15/09 10:00–15/09 10:15». Repite el día, y es verdad.
- Cambio de año: todas las fechas llevan año.

**Sin cita, que `{fecha}` salga de `abierta_en` es lo correcto.** La fecha de la sesión no se pierde: sigue en `cabecera.fechaSesion`.

**Que el año falte cuando todo cae en el mismo año** es lo que ya pasaba antes, y no afirma nada falso.

**Hay una excepción, y esa la tiene que decidir el arquitecto.** Es la nota sin cita que se abre un día y se firma otro (R2-H12). Solo se arregla cambiando el texto, y las tres claves las fija el diseño (§2.13 y P2).

## BAJA

### R2-H12 · `lib/notas/sello.ts:65` · Sin cita, si se abre un día y se firma otro, la frase da como día de escritura solo el primero

**Escenario.** Una nota sin cita se abre el 01/09 a las 10:00 y se firma el 15/09 a las 18:00. La frase dice «Escrita el 01/09 · 01/09 10:00–15/09 18:00». Leída de corrido, dice que la nota se escribió el 01/09. Lo que prueba el sobre es que se escribió entre esas dos fechas, y pudo escribirse casi entera el 15/09. Con cita no pasa: ahí «la sesión del {fecha}» nombra la sesión, no el día en que se escribió.

**Decide el arquitecto, entre:**
- (a) una clave nueva para este caso, por ejemplo «Escrita entre el {desde} y el {hasta}»;
- (b) aceptar la frase tal como está y dejarlo escrito en el diseño.

### R2-H13 · `lib/notas/servidor.test.ts:712` · La prueba de R2-H3 no fija los filtros de la consulta de participantes

**Qué pasa.** El simulador responde lo mismo a `episodio_participantes` con filtros que sin ellos. Lo he medido: si se quita `.eq('paciente_id', entrada.pacienteId)` o `.is('baja_en', null)` de esa consulta, las 84 pruebas siguen en verde.

**Escenario.** Sin el filtro de paciente, la RLS (`es_profesional_del_episodio`) devuelve los participantes de **todos** los episodios del profesional. La lista de P incluye entonces el episodio de pareja de Q y R. Si se elige, `episodio_para_nota` responde 42501 y la apertura termina en `error`. Sin el filtro de `baja_en`, la lista ofrece un episodio del que P ya salió, que el RPC no cuenta: la lista vuelve a no coincidir con la regla, ahora por exceso.

**Arreglo.** Exigir `['eq:paciente_id', P]` y `['is:baja_en', null]` en la llamada a `episodio_participantes`, igual que la prueba ya hace con `episodios_asistenciales`.

### R2-H14 · `lib/notas/servidor.ts:386` · Un fallo de lectura al abrir la nota sale como `no_disponible`

**Qué pasa.** `devolver` traduce cualquier `null` de `cargarModelo` como `no_disponible`. Desde esta ronda, ese `null` también significa «una lectura falló».

**Escenario.**
- Al abrir `?nota=`, la lectura de las versiones falla de forma pasajera. El resultado es `{estado:'no_disponible'}`, y el corte B dirá que la nota no está disponible en vez de «Vuelve a intentarlo».
- En la rama de creación es peor: la cabecera se acaba de insertar y se le dice al usuario que no está disponible.
- Las dos pruebas nuevas solo exigen `not.toBe('abierta')`, así que no fijan qué estado sale.

**Arreglo.** Que `cargarModelo` distinga «no visible» de «no se pudo leer», por ejemplo devolviendo un `Leida`. En el segundo caso, `devolver` tiene que dar `error`.

### R2-H15 · `lib/notas/servidor.ts:230` · Las guardas nuevas de `cargarModelo` no tienen prueba

**Qué pasa.** Lo he medido: las 84 pruebas siguen en verde si se quita cualquiera de estas tres guardas:
- `!episodioLeido.ok || !conjuntaLeida.ok`;
- el `return null` cuando falla la lectura de la cita;
- el `return null` cuando falla la de la zona.

**Escenario (sin la primera guarda).**
1. Al abrir el editor falla el recuento de participantes, y el modelo sale con `puedeSerConjunta` indefinido.
2. El corte B no ofrece «conjunta» y se firma con `alcance:'individual'`.
3. `firmarNota` relee bien, pero sella lo que pidió la entrada: individual.

Es el efecto de R2-H2(b), que entra por la otra puerta: la de la pantalla.

**Arreglo.** Una prueba por guarda, como las que ya tiene `firmarNota`.

## Corte B · ronda 0

**Ninguna ALTA en el corte B, ronda 0.** Hay 3 MEDIA y 4 BAJA.

Rama `worktree-agent-a37e2c20869f2b71f`, de `a3b8d92` a `6cdaa19`. Diff leído con `git diff main...HEAD`; lo que viene de `tickets/T-035` no se mira. No he usado la base local. Rutas cortas:
- `E` = `app/(app)/pacientes/[id]/historia/notas/editor-de-nota.tsx`
- `ET` = `editor-de-nota.test.tsx`, en la misma carpeta

Mutantes y sondas medidos en una copia de la rama en el scratchpad. El worktree del implementador no se ha tocado.

### B.5, punto por punto

| # | Qué se pedía | Resultado |
|---|---|---|
| 2 | R4-H1 | Cerrado. `denegado` da `bloqueada`; cualquier otro motivo da `error`. |
| 4 | `caducaEn` | El código está bien: en `abierta` el tipo es `string`, `null` da `error`, y todas las asignaciones del reductor llevan `?? estado.caducaEn`. Dos de esas cuatro líneas no tienen prueba que las mate (B0-H5). |
| 5 | T-036 | Bien. Las dos cadenas 23514 de la prueba son las de la migración, letra a letra (ver la nota del final). `conflicto` deja `readOnly`, para el autoguardado y «Cargar lo guardado» pasa por `abrirEditorDeNota`. |
| 6 | Conflicto | El foco va a un contenedor sin rol ni nombre (B0-H6). |
| 7 | Doble pulsación | `enVuelo` es un `useRef` y los dos botones llevan `disabled={pendiente}`. Pero la prueba B no demuestra la guarda (B0-H4). |
| 8 | Lista | Bien: `href` siempre con `?nota=`, el `select` no trae texto clínico y `null` no se confunde con `[]`. |
| 9 | Borrador ajeno (P-1) | Ningún control de escritura en la pantalla. En el servidor rechazan al que no es autor tanto la RLS de update (`autor_id = auth.uid()`) como la comprobación explícita de `firmarNota`. Queda abierto el lector que solo ve la versión conjunta (B0-H3). |
| 10 | Armazón | Sin `notas_clinicas`, sin `lib/notas/servidor` y sin `use cache`. |
| es.ts | Catálogo | Un solo bloque `notas`, con las seis claves de `sello`. `notasEnPreparacion` ya no está. |
| P-2 | Ficha | Hecho, y con sus pruebas gemelas. |

### MEDIA

**B0-H1 · `E:630-645`, `E:425-428` y `E:744-757`. La lección de T-037 no se aplica a todas las vistas que sustituyen a la que tiene el foco: el foco cae en `body`.**

En tres casos el foco queda en `body`. Lo he medido con una sonda en `ET` que lee `document.activeElement`.

1. **El reloj vence** (prueba `ET:326`). El `textarea` donde se escribía se desmonta y aparece la vista del candado. El aviso `ficha.seCerroSola` va en un `<p>` que no es región viva, y el formulario del PIN no recibe el foco. Medido: `BODY`.
2. **Un guardado devuelve `bloqueada`** (prueba `ET:397`). Pasa lo mismo. Medido: `BODY`.
3. **La firma devuelve `ok` con `nota: null`** (prueba `ET:607`). El diálogo se cierra y `useDevolucionDeFoco` devuelve el foco al botón «Firmar» de la barra. Pero ese botón se ha desmontado, porque la vista pasa a solo lectura. Medido: `BODY`. El mismo camino tienen `sin_borrador`, `no_autor` y `no_disponible` al firmar: el diálogo se cierra y queda un aviso en lugar de la barra.

Escenario: un profesional dicta con lector de pantalla y vence el plazo. Sigue tecleando y no pasa nada: el texto ha desaparecido y nadie se lo anuncia. En el tercer caso, el `role="alert"` de `AvisoDeError` sí se anuncia, pero el foco se ha perdido y Tab empieza desde el principio de la página.

`docs/bitacora/T-037.md` lo dejó escrito: cada vista que sustituye a otra tras una mutación se mide con `activeElement`, y el elemento enfocado tiene nombre y rol. El diseño solo fijó el foco para dos casos, la firma que acaba en `ok` con nota y el conflicto. El cierre por reloj no es un gesto (ADR-047), así que puede bastar con una región `role="status"` que exista antes del cambio. Lo que no basta es un `<p>` sin región viva.

**B0-H2 · `E:693` y `E:981`; `lib/notas/servidor.ts:909-920`. Para quien solo ve las versiones conjuntas, la pantalla llama «Versión vigente» a una que ya no lo es, y la lista cuenta mal.**

La RLS `notas_clinicas_versiones_lectura` solo enseña al profesional del episodio las versiones con `alcance = 'conjunta'`. Pero `vigente` es la última versión que recibe el modelo, no la última de la nota.

Escenario:
1. La v1 se firma conjunta.
2. El autor pulsa «Modificar» y firma la v2 como individual. `firmarNota` lo permite, porque el alcance se elige en cada firma.
3. El coprofesional del episodio abre la nota y ve la v1 bajo el encabezado «Versión vigente», sin ningún aviso de que existe una versión posterior.

La lista tampoco cuadra para él: dice «1 versión» y marca la nota como conjunta.

Una decisión clínica tomada sobre texto ya corregido. ADR-030 no dice qué tiene que ver ese lector. Decide el arquitecto: una frase como «hay versiones posteriores que no puedes ver» o no llamarla «vigente».

**B0-H3 · `E:802` y `lib/notas/servidor.ts:357-364`. El borrador ajeno (P-1) se salta el recorte por alcance: quien solo puede leer versiones conjuntas lee el borrador de una modificación que puede acabar siendo individual.**

Escenario:
1. Es una nota de pareja con la v1 conjunta.
2. El autor abre «Modificar» y escribe en el borrador lo que uno de los dos contó en una sesión individual. Su intención es firmarla como individual.
3. El coprofesional del episodio abre la nota. La RLS le da la cabecera (`nota_tiene_version_conjunta`) y, con ella, `borrador_contenido`. `BorradorAjeno` le pinta el texto y las anotaciones reservadas.
4. El autor firma la v2 individual. Desde ese momento, la RLS le oculta a ese mismo lector el texto que ya ha leído.

El propietario decidió que «solo lo leen quienes RLS ya deja leer la nota». A la letra se cumple. Pero esa RLS recorta las versiones por alcance y la cabecera no se recorta, y la pantalla es la que convierte ese hueco en lectura. Es «la guarda tiene otra puerta» y lo decide el propietario: o el borrador ajeno solo se pinta a quien puede leer versiones individuales, o se acepta. La columna ya se puede leer con un `select` directo desde antes de este diff, pero ahora es la pantalla la que lo enseña.

### BAJA

**B0-H4 · `ET:465-488` (prueba B) frente a `E:550`. La prueba de la doble pulsación sigue verde sin la guarda `enVuelo`.**

Medido: con `if (enVuelo.current) return;` quitado, `ET` da 51/51 en verde. La cola (`encolar`) pone los clics siguientes detrás de la firma pendiente, y la prueba nunca resuelve esa firma antes de contar.

Añadí `expect(firmarNota).toHaveBeenCalledTimes(1)` después de `terminar({ok:false, motivo:'error'})` y de tres `vaciar()`. Con el mutante falla con **4 llamadas**; con el código original pasa.

Escenario de la regresión que no se vería: una firma acaba en `error` y, sin que el usuario haga nada, se lanzan otras tres llamadas a `firmarNota`.

Arreglo: añadir esa aserción.

**B0-H5 · `E:230` y `E:234`. Hay dos de las cuatro asignaciones `caducaEn ?? estado.caducaEn` que ninguna prueba mata.**

Son la de `solo_modelo` (tras elegir coprofesional) y la de `sin_recargar` (`hechoSinRecargar` / `firmadaSinRecargar`).

Medido: cambiando cada `??` por `accion.caducaEn as string`, `ET` sigue 51/51. Los mutantes de `modelo` (`E:225`) y de `caducaEn` (`E:222`) sí caen.

Escenario de la regresión: si se pierde el `??`, al elegir coprofesional con `caducaEn: null` el plazo pasa a `null`. Entonces el reloj no arranca (`E:422`: `if (caducaEn === null) return`) y el editor ya no se cierra solo. El servidor rechazaría las escrituras, pero en pantalla la nota sigue abierta.

Es justo lo que B.5.4 pide vigilar. Arreglo: una prueba gemela de `ET:326` para cada uno de los dos caminos.

**B0-H6 · `E:732` y `ET:408`. En el conflicto el foco va a un `div tabIndex={-1}` sin rol ni nombre, y la prueba solo comprueba `activeElement.contains(aviso)`.**

Es el T-037 R3-H1 repetido, y la letra del diseño lo pedía así.

Escenario: con lector de pantalla, el foco llega a un grupo anónimo. Lo que de verdad anuncia el conflicto es el `role="alert"` de dentro. Si alguien quita ese rol de `AvisoDeError`, la prueba sigue verde.

Arreglo: enfocar el propio aviso o darle nombre al contenedor, y comprobarlo con `toHaveAccessibleName`. Decide el arquitecto, como en T-037.

**B0-H7 · `app/(app)/pacientes/[id]/historia/notas/page.tsx:56-62`. El armazón lee la cita sin mirar `error`, y un fallo pasajero se convierte en un 404.**

Escenario: el profesional entra desde la agenda en `?cita=<uuid>` y la lectura de `citas` falla por un tiempo agotado. `data` llega `null`, se llama a `notFound()` y aparece «no existe» para una cita que sí existe. Es la clase del error tragado como ausencia, esta vez en una lectura no clínica. Arreglo: si hay `error`, lanzarlo para que salga el `error.tsx`, no el 404.

### Notas para el orquestador (no son hallazgos)

- Si `cerrarHistoriaDelPaciente` lanza, `cerrar` (`E:444-445`) se lo traga sin decir nada. La franja sigue mostrando la historia abierta, así que no engaña a nadie. Lo anoto por si se quiere avisar.
- B.5.5. Las dos cadenas de `lib/notas/servidor.test.ts:1249-1255` coinciden letra a letra con los `raise` de `supabase/migrations/20261003120000_firma_cotejada_con_borrador_y_cita.sql:435` y `:444`. El 23514 que contiene `abierta_en` sigue dando `error` (`servidor.test.ts:661`). Lo he comprobado leyendo el código, no ejecutándolo.


## Corte B · ronda 1

**Ninguna ALTA en el corte B, ronda 1.** Hay 2 MEDIA y 6 BAJA.

Rama `worktree-agent-ad97d3e94e2e4ab53`: los 8 commits de arreglos sobre los 7 del corte B. Diff leído con `git diff main...worktree-agent-ad97d3e94e2e4ab53`.

Cómo lo he medido:
- No he usado la base local.
- Los mutantes y las sondas corren en una copia de la rama en mi scratchpad (`git archive`); el worktree no se ha tocado.
- Línea base de la copia: 19 ficheros y 289 pruebas en verde.
- Cada mutante se ejecuta contra su fichero de pruebas y el fuente se restaura después.

Rutas cortas:
- `E` = `app/(app)/pacientes/[id]/historia/notas/editor-de-nota.tsx`
- `ET` = `editor-de-nota.test.tsx`, en la misma carpeta
- `S` = `lib/notas/servidor.ts`
- `ST` = `lib/notas/servidor.test.ts`

### Estado de los hallazgos de la ronda 0

| Hallazgo | Estado | Mutante y resultado |
|---|---|---|
| B0-H1 | **A medias.** Cerrados los tres casos medidos (reloj, guardado `bloqueada` y firma `ok` con nota `null`). El aviso va en `role="status"` y el encabezado lleva `aria-describedby`. Siguen en `body` los que el propio B0-H1 nombraba: la firma con `ya_firmada`, `sin_borrador`, `no_autor` y `no_disponible`. Ver B1-H3. | Muere: quitar el foco al título (3 pruebas). Muere: quitar el foco al PIN. Muere: quitar el foco a «Recargar». Muere: quitar `role="status"`. **Sobrevive**: quitar `aria-describedby` (no lo fija nada; menor). |
| B0-H2 | **Cerrado en lo que se pidió:** el encabezado «Última versión conjunta» y la lista «Versiones conjuntas». Pero la numeración enseña huecos (B1-H4), y una de las aserciones nuevas es vacua (B1-H5). | Muere: `lecturaConjunta = false` en `S`. Muere: el título fijo. Muere: quitar el `aria-label`. **Sobrevive**: `vigente={v.numero === vigente.numero}`, sin `!lecturaConjunta`. |
| B0-H3 | **Cerrado en la aplicación, no en la regla.** El recorte se hace en servidor. El texto, las reservadas y el testigo no viajan, y la longitud no va en ningún campo del modelo. Un fallo de la RPC da `error` y no abre el borrador. Pero la regla aplicada no cumple la decisión del propietario en el único caso en que importa (B1-H1). | Muere: `puedeLeerBorrador = true`. Muere: quitar la rama del coprofesional. Muere: quitar `asignado === true`. Muere: quitar `puedeLeerBorrador &&` del borrador. Muere: quitar `hayBorrador &&` de `borradorOculto`. Muere: `if (errorAsignado)` → `if (false)`. Muere: quitar la vista de `borradorOculto` en `E`. **Sobrevive**: `p_paciente_id: usuario.id` (B1-H6). |
| B0-H4 | Cerrado. | Muere: quitar `if (enVuelo.current) return;` (la prueba de los dos envíos en el mismo tick). |
| B0-H5 | Cerrado. | Mueren los dos: `?? estado.caducaEn` → `as string` en `solo_modelo` y en `sin_recargar`. |
| B0-H6 | Cerrado. El foco va al botón «Cargar lo guardado», que tiene rol y nombre. | Muere: enfocar el contenedor en vez del botón. |
| B0-H7 | Cerrado en `page.tsx`. Queda la misma clase un paso antes, en `cargarPaciente` (B1-H8). | Muere: `if (error)` → `if (false)` en `page.tsx`. |
| scroll-padding | Bien. `previo` se guarda y se restaura en la limpieza, el observador se desconecta y nadie más escribe `scrollPaddingBottom` (`grep` en `app`, `components` y `lib`), así que no queda estado sucio entre rutas. | Muere: quitar la restauración. Muere: restaurar a `''`. **Sobrevive**: quitar `observador?.disconnect()` (B1-H7). |

### MEDIA

**B1-H1 · `S:309` y `ST:1391`. El sustituto de la regla (`coprofesional_id`) está congelado desde la v1, así que no dice nada del alcance de la v2. Justo en el escenario que motivó B0-H3, el coprofesional nombrado lee el borrador que el autor quiere firmar como individual.**

La decisión del propietario dice que, sin ser el autor, el texto se ve «si podría leer esa nota una vez firmada con el mismo alcance». La prueba que pide para no ver nada es «coprofesional con borrador individual → sin texto». La regla aplicada lee el `coprofesional_id` de la cabecera como «señal de que el autor la quiere conjunta». Pero:

1. `fn_congelar_cabecera_sellada` (`supabase/migrations/20261003120000_firma_cotejada_con_borrador_y_cita.sql:678`) rechaza con 42501 cualquier cambio de `coprofesional_id` en cuanto existe una versión.
2. Un lector que no es ni autor ni asignado solo ve la cabecera si ya hay una versión conjunta (`notas_clinicas_lectura` → `nota_tiene_version_conjunta`). Así que el único borrador que puede llegar a leer es el de una **modificación**, y en una modificación `coprofesional_id` es el de la v1 y el autor no puede cambiarlo.

Escenario, el mismo de B0-H3:
1. La v1 de una nota de pareja se firma conjunta, con A como coprofesional.
2. El autor pulsa «Modificar» y escribe en el borrador lo que un miembro contó a solas, con la intención de firmar la v2 como individual. No tiene ninguna forma de decirlo: no puede quitar a A.
3. `cargarModelo` le da a A `puedeLeerBorrador = true`.
4. La gemela `ST:1391` («coprofesional con borrador conjunto (el autor lo nombró): lo recibe») fija como correcto exactamente lo que la decisión quería impedir. «Borrador conjunto» no existe: un borrador no tiene alcance.

Hoy no se llega desde la pantalla, y lo he comprobado por dos lados:
- A es `profesional_sanitario` (7b), y si no es asignado del paciente, `cargarPaciente` le da 404 y `registrar_acceso_historia` le da 42501.
- El único lector que llega a `cargarModelo` sin ser autor ni asignado es un administrador que participa en el episodio, y ese nunca puede ser `coprofesional_id`.

La rama `cab.coprofesional_id === usuario.id` es, por tanto, inalcanzable desde la aplicación. A sigue pudiendo leer `borrador_contenido` con un `select` directo a PostgREST, pero esa puerta ya existía antes (se anotó en la ronda 0) y está en `supabase/**`, fuera del territorio.

Por qué es MEDIA y no BAJA: el código y su prueba dejan escrita como regla lo contrario de la decisión. El día que el coprofesional pueda abrir la historia, la fuga se activa sin tocar este fichero.

Decide el propietario. Opciones que caben en el territorio: que lean solo el autor y el asignado; o dejar la rama y documentar que es inalcanzable. Cumplir la letra exige guardar el alcance previsto en el borrador, o una vista con RLS, y eso es `supabase/**`, otro ticket.

**B1-H2 · `E:352-375`, `E:556` y `E:842`. Tras «Abrir el editor» el foco cae en `body` con cualquier resultado, y lo mismo pasa tras «Modificar», «Recargar» y «Cargar lo guardado».**

Lo he medido con una sonda en `ET`. Antes de pulsar, el foco está en el propio disparador (`b.focus()`). En los siete casos medidos, `document.activeElement` acaba en `BODY`:
- «Abrir el editor» → `abierta`, `error`, `no_disponible` y `elegir_episodio`;
- «Modificar» con éxito;
- «Recargar» tras `firmadaSinRecargar`;
- «Cargar lo guardado» tras un conflicto.

`sin_acceso` no lo he medido, pero leyendo el código tiene el mismo camino: no hay ningún efecto de foco para esa fase.

En todos el disparador se desmonta y la vista nueva no recibe el foco. Es la clase de B0-H1 en los gestos de cada día; en la ronda 0 no lo medí.

Escenario: un profesional entra con teclado en la nota de la cita y pulsa «Abrir el editor». El `textarea` aparece, pero el foco está en `body`: la siguiente pulsación de Tab empieza por la cabecera de la aplicación, y con lector de pantalla no se anuncia nada (la franja `role="status"` se monta a la vez que su texto). Con «Modificar» pasa lo mismo justo cuando va a corregir.

Clasificación de lo que el implementador dejó a propósito, que son las vistas `sin_acceso`, `no_disponible`, `error` y `elegir_episodio` tras la carga:
- Solas serían BAJA: las tres primeras pintan un `AvisoDeError` con `role="alert"`, que sí se anuncia.
- Van aquí porque salen del mismo clic que `abierta`, que es la que pesa.

Arreglo: el `textarea` (o el encabezado de la vista) recibe el foco cuando la fase cambia por un gesto, y se comprueba con `activeElement` y `toHaveAccessibleName`, como en T-037.

### BAJA

**B1-H3 · `E:613-615` y `barra-de-acciones.tsx:71`. B0-H1 a medias: tras una firma rechazada con `ya_firmada`, `sin_borrador`, `no_autor` o `no_disponible`, el foco cae en `body`.**

Medido con el foco puesto antes en «Firmar»: `BODY` en los cuatro. Hay dos mecanismos distintos:
1. Con `ya_firmada`, `sin_borrador` y `no_autor`, la vista pasa a solo lectura y la barra se desmonta. `useDevolucionDeFoco` devuelve el foco a un botón que ya no existe.
2. Con `no_disponible` la barra sigue montada, pero el diálogo se desmonta mientras la transición sigue pendiente, y en ese momento «Firmar» tiene `disabled={pendiente}`. `focus()` sobre un botón deshabilitado no hace nada.

Prueba del segundo: quitando `disabled={pendiente}` de «Firmar» en la copia, el foco vuelve a «Firmar». Con «Cancelar» el foco vuelve bien, porque no hay nada pendiente.

Escenario: otra pestaña firma la nota mientras el diálogo está abierto. Al confirmar, el aviso `yaFirmada` (con `role="alert"`) se anuncia, pero el foco está en `body`. Es BAJA porque son caminos raros y el aviso sí se anuncia.

**B1-H4 · `app/(app)/pacientes/[id]/historia/notas/fila-de-version.tsx:25` y `ET:809`. Para quien lee en modo conjunto, la numeración con huecos revela que existen versiones individuales.**

Escenario:
1. La v1 se firma conjunta, la v2 individual y la v3 conjunta.
2. El administrador que participa en el episodio (no es asignado) abre la nota. Ve «Versión 1» y «Versión 3» bajo «Versiones conjuntas»: sabe que hay una v2 que no le enseñan, y cuándo se hizo, entre las dos fechas.

El comentario de `lecturaConjunta` y el título de la prueba dicen «ninguna pista de versiones individuales». La prueba no lo ve porque usa versiones 1 y 2, consecutivas.

Revela que existe la versión, no su contenido. Arreglo: numerar por posición en lo visible cuando `lecturaConjunta`, o aceptarlo y quitar la promesa del comentario y de la prueba. Decide el arquitecto.

**B1-H5 · `ET:822`. `expect(screen.queryByText('vigente')).toBeNull()` es vacua: nunca encuentra nada.**

`FilaDeVersion` pinta `' (vigente)'`, con paréntesis, y `queryByText` exige el texto exacto. Medido: con `vigente={v.numero === vigente.numero}` (sin `!lecturaConjunta`, `E:1046`), `ET` sigue en verde.

Escenario de la regresión que no se vería: alguien quita la guarda y el lector conjunto vuelve a ver «Versión 2 (vigente)» sobre una versión ya sustituida, que es justo lo que B0-H2 quería evitar.

Arreglo: `queryByText(/vigente/)` o buscar el `span` por su texto completo.

**B1-H6 · `ST:1356`. El simulador responde a `rpc:es_profesional_asignado` sin mirar los argumentos.**

Medido: con `p_paciente_id: usuario.id` en `S:302`, `ST` sigue en verde.

Escenario de la regresión que no se vería: la RPC recibe el id del usuario en lugar del del paciente, devuelve `false` para todos y el profesional asignado pierde el borrador de su colega. Además vería «Última versión conjunta» aunque lee todas las versiones. No es una fuga, pero B0-H3 quedaría roto en silencio.

Es «el simulador sin filtros» otra vez. Arreglo: comprobar `{ p_paciente_id: P }` en la llamada.

**B1-H7 · `app/(app)/pacientes/[id]/historia/notas/barra-de-acciones.test.tsx:79`. La prueba del `scroll-padding` no cubre el observador: quitar `observador?.disconnect()` la deja en verde.**

jsdom no trae `ResizeObserver`, así que en la prueba `observador` es `null` y la línea no se ejecuta.

Escenario de la regresión que no se vería: sin `disconnect`, en un navegador el observador avisa también cuando la barra sale del DOM. `reservar` escribe `0px` en `scrollPaddingBottom` después de que la limpieza haya restaurado `previo`. Al navegar a otra ruta queda un `scroll-padding-bottom: 0px` en línea que nadie pidió, que es el estado global sucio que se quería evitar.

Arreglo: simular `ResizeObserver` en la prueba y comprobar que se llama a `disconnect`.

**B1-H8 · `app/(app)/pacientes/[id]/datos.ts` (`cargarPaciente`, llamado en `page.tsx:52-53`). Un error al leer el paciente se convierte en 404: es B0-H7 un paso antes.**

`cargarPaciente` se traga `error` y devuelve `null`, y `page.tsx` hace `notFound()`.

Escenario: la lectura de `pacientes` agota el tiempo y el profesional ve «no existe» para un paciente que sí existe, antes de llegar a la cita que B0-H7 ya protege.

Clasificación de lo que el implementador dejó a propósito: BAJA y fuera del territorio. `datos.ts` no es de B.6 y lo usa toda la ficha. Va a `docs/state.md` §Hallazgos, no se arregla en este ticket.

### Notas para el orquestador (no son hallazgos)

- `aria-describedby` del encabezado del candado no lo fija ninguna prueba: el mutante que lo quita sobrevive. Lo que se lee al llegar el foco depende de él, porque el `role="status"` se monta a la vez que su texto. Si se toca B1-H2, conviene fijarlo en la misma pasada.
- Cambiar `asignado === true` por `Boolean(asignado)` sobrevive, pero es un mutante equivalente: la RPC devuelve un booleano.
- La sonda que mide el foco tras la firma tiene que poner antes el foco en «Firmar». `fireEvent.click` no mueve el foco, y sin eso `useDevolucionDeFoco` guarda `body` y cualquier caso sale en `BODY` por el motivo equivocado.

## Corte B · ronda 2

**Ninguna ALTA en el corte B, ronda 2.** Hay 0 MEDIA y 4 BAJA. Tres de las BAJA son nuevas. La cuarta es B1-H8, que sigue abierta a propósito.

Rama `worktree-agent-a569a13c061c1d353`. Lo nuevo de la ronda son los cuatro commits de `git diff bbeaf5e..3a3c564`. El corte entero se ha leído con `git diff main...worktree-agent-a569a13c061c1d353`, que solo toca `app/`, `lib/` y `accesibilidad/` (nada de `tickets/`, `docs/` ni `supabase/`).

Cómo lo he medido:
- No he usado la base local, ni Playwright, ni el puerto 3000.
- He trabajado sobre una copia de `3a3c564` en mi scratchpad (`git archive`), con `node_modules` enlazado. El worktree no se ha tocado.
- Línea base de la copia: 18 ficheros y 299 pruebas en verde (`lib/notas` y `historia/notas`). `eslint` limpio en los seis ficheros del diff.
- Cada mutante se ejecuta contra su fichero de pruebas y el fuente se restaura después.

Rutas cortas:
- `E` = `editor-de-nota.tsx` y `ET` = `editor-de-nota.test.tsx`
- `B` = `barra-de-acciones.tsx` y `BT` = `barra-de-acciones.test.tsx`
- los cuatro anteriores están en `app/(app)/pacientes/[id]/historia/notas/`
- `S` = `lib/notas/servidor.ts` y `ST` = `lib/notas/servidor.test.ts`

### Estado de los hallazgos de la ronda 1

| Hallazgo | Estado | Mutante y resultado |
|---|---|---|
| B1-H1 | **Cerrado.** `puedeLeerBorrador = asignado === true` (`S:309`). Cumple la decisión «solo el autor y el asignado» (diseño §B1-H1). La gemela se ha invertido y hay prueba con `coprofesional_id` de una tercera persona. | Muere: volver a poner `\|\| cab.coprofesional_id === usuario.id` (cae la gemela invertida). |
| B1-H6 | **Cerrado.** El simulador solo contesta `true` si `p_paciente_id === P`, y una prueba fija el argumento exacto. | Muere: `p_paciente_id: usuario.id` (fallan 3 pruebas, incluida la nueva). |
| B1-H2 | **Cerrado en los siete casos medidos, más `sin_acceso`.** Lo nuevo que trae el arreglo son H1 y H2, más abajo. | Muere: anular el efecto de `pedirFoco` (fallan 10). Muere: quitar `pedirFoco = true` en `aplicarRecarga` (falla «Modificar»). Muere: `h2` antes que `textarea` en los selectores. Muere: quitar `tabIndex` del grupo de `sin_acceso` y del de `no_disponible`. Muere: `sigueLaVista = false`. Muere: quitar la excepción de `bloqueada` (cae «foco al PIN»). **Sobrevive**: `sigueLaVista` solo con `error`, sin `no_disponible` (ver H1). |
| B1-H3 | **Cerrado.** Medido con el foco puesto antes en «Firmar»: `ya_firmada` y `sin_borrador` van a «Cargar lo guardado», `no_autor` va al cuerpo de solo lectura y `no_disponible` va a «Firmar», ya activo. | Muere: anular el rescate (fallan 4). Muere: no esperar a `pendiente` (cae `no_disponible`). Muere: quitar `data-accion="firmar"`. Muere: quitar la rama `botonAviso` (fallan 2). Muere: no mirar `activeElement` antes de rescatar (fallan 3 que ya existían: conflicto, firma `ok` con nota y `bloqueada`). |
| B1-H4 | **Cerrado en el número, no en la promesa.** En lectura conjunta se numera por posición y el número real no viaja. Pero el motivo de cambio de la primera versión visible delata la versión oculta (H3). | Muere: `numero: v.numero_version`. **Sobrevive**: `numero: posicion + 1` siempre. La prueba «el asignado conserva el número real» usa v1, v2 y v3 consecutivas, y en ese caso los dos cálculos coinciden. En la práctica es equivalente: el asignado lee todas las versiones, así que no hay huecos. Ver las notas. |
| B1-H5 | **Cerrado.** Ahora es `queryByText(/vigente/)`. | Muere: `vigente={v.numero === vigente.numero}` sin `!lecturaConjunta`. |
| B0-H1 (`aria-describedby`) | **Cerrado.** `toHaveAccessibleDescription(/La historia se ha cerrado sola/)`. | Muere: quitar `aria-describedby="mensaje-bloqueada"`. |
| B1-H7 | **Cerrado.** Un `ResizeObserver` falso comprueba `observe(toolbar)`, que el cambio de alto llega al `scroll-padding` y que `disconnect` se llama una sola vez y solo al desmontar. La limpieza va en `finally` y en `afterEach`. | Muere: quitar `observador?.disconnect()`. Muere: quitar `observador?.observe(barra)`. |
| B1-H8 | **Abierto a propósito.** Está fuera del territorio y el encargo lo excluye. Sigue sin anotar en `docs/state.md` §Hallazgos (ver las notas). | — |

### BAJA

**H1 · `E:377` (`sigueLaVista`), con `E:181-185` y `E:826`. Si «Recargar» o «Cargar lo guardado» fallan por el camino del aviso, el foco cae en `body` y el botón de reintentar desaparece.**

El camino del aviso son dos casos:
- «Recargar» tras `firmadaSinRecargar`;
- «Cargar lo guardado» tras una firma rechazada con `ya_firmada` o `sin_borrador`.

Si la recarga falla con `error` o `no_disponible`, el comentario de `E:376` dice que «un fallo al recargar deja la vista y su botón donde estaban». Eso solo es verdad por el camino del conflicto, donde el botón vive en el bloque de `estado.conflicto`, que sigue en `true`.

Por el camino del aviso pasa esto:
1. El reductor sustituye `aviso` por `noSeAbrio` o `noDisponible` (`E:181-185`).
2. Esos avisos no llevan acción (`E:826`), así que el botón que tenía el foco se desmonta.
3. Como `sigueLaVista` es `true`, `pedirFoco` queda en `false` y nadie rescata el foco.

Lo he medido con una sonda en `ET`, con el foco puesto antes en el disparador. Son cuatro casos:
- `firmadaSinRecargar` → «Recargar» → `error`;
- `firmadaSinRecargar` → «Recargar» → `no_disponible`;
- `ya_firmada` → «Cargar lo guardado» → `error`;
- `ya_firmada` → «Cargar lo guardado» → `no_disponible`.

En los cuatro, `document.activeElement` es `BODY` y el único botón que queda es «Cerrar la historia». En el camino del conflicto el foco se queda bien en «Cargar lo guardado»: es lo que cubre la prueba de `ET` «un "Recargar" que falla no roba el foco», y solo eso.

Escenario: el profesional firma, la relectura falla y sale «Firmada; recarga para verla». Pulsa «Recargar» con el teclado y la red vuelve a fallar. El aviso pasa a «No se pudo abrir» y el foco queda en `body`. Ya no queda ningún control para reintentar, salvo recargar la página o cerrar la historia.

La desaparición del botón ya ocurría antes de esta ronda. Lo nuevo es el comentario, que lo da por imposible. Es BAJA porque hacen falta dos fallos seguidos.

**H2 · `E:516` y `ET:950`. Tras «Abrir el editor», quien no es autor y no tiene nada que leer recibe el foco en «Cerrar la historia», y la prueba lo fija como correcto.**

El caso es una nota sin versiones y con el borrador oculto. En esa vista no hay `textarea`, ni `h2[tabindex=-1]`, ni grupo. `enfocarPrimero` cae en el primer `button:not([disabled])`, que es «Cerrar la historia», o «Ampliar el tiempo» si quedan 2 minutos o menos. Lo que la vista tiene que decir está en dos `<p>` sin foco: `notas.aviso.noAutor` y `notas.editor.borradorOculto`.

Escenario: el administrador que participa en el episodio, que no es asignado, pulsa «Abrir el editor» con lector de pantalla.
- Oye «Cerrar la historia, botón». No oye «Hay un borrador en curso» ni que la nota no es suya.
- Si pulsa Intro creyendo que es el paso siguiente, cierra su ventana de PIN y tiene que volver a desbloquear.

Es la clase de «foco a un control que no es el contenido». Arreglo: un encabezado o un grupo con nombre para esa vista, como ya tienen `sin_acceso` y `no_disponible`.

**H3 · `S:366` (`motivo: v.motivo_cambio`) y `fila-de-version.tsx:35-39`. En lectura conjunta, si la v1 es individual, la primera versión visible sale como «Versión 1» pero con «Motivo: …». Una v1 real nunca lleva motivo, así que delata que hay una versión anterior oculta.**

La base de datos obliga a que toda versión mayor que 1 lleve motivo: `check (numero_version = 1 or (motivo_cambio is not null …))`, en `supabase/migrations/20260822094547_…sql:670`. Y dos sitios prometen lo contrario de lo que pasa:
- el comentario de `ModeloDeNota.lecturaConjunta` (`S:72-73`): «la pantalla no debe sugerir que existan versiones individuales»;
- el título de `ET:809`: «ninguna pista».

Escenario:
1. La v1 de una nota de pareja se firma individual.
2. La v2 se firma conjunta, con el motivo «Se amplía para la sesión conjunta».
3. El administrador que participa en el episodio ve una sola fila: «Versión 1 · Motivo: Se amplía para la sesión conjunta».
4. Así sabe que hay una versión anterior que no le enseñan.

La prueba de B1-H4 (`ST:1449`) no lo ve porque su primera fila visible es una v1 real.

Revela que la versión existe, no lo que dice: misma clase y misma severidad que B1-H4. Arreglo: no enviar el motivo de la primera versión visible cuando `lecturaConjunta` y su número real no es 1, o quitar la promesa del comentario y de la prueba. Decide el arquitecto.

**H4 · `app/(app)/pacientes/[id]/datos.ts` (`cargarPaciente`). Es B1-H8 y sigue abierto: un error al leer el paciente se convierte en 404.**

No ha cambiado desde la ronda 1. Está fuera del territorio y el encargo de esta ronda lo excluye. No figura en `docs/state.md` §Hallazgos.

### Notas para el orquestador (no son hallazgos)

- Hay dos anotaciones que el diseño manda a `docs/state.md` §Hallazgos y que no están. La rama no toca `docs/`, así que le tocan al orquestador:
  - la puerta del `select` directo a PostgREST sobre `notas_clinicas.borrador_contenido` (diseño §B1-H1, último punto);
  - B1-H8.
- El mutante `numero: posicion + 1` siempre sobrevive. Es equivalente mientras el asignado lea todas las versiones. Para que la prueba «conserva el número real» muerda haría falta un hueco que el asignado viera, y hoy no existe. Basta con no prometerlo en el título.
- Los grupos de `sin_acceso` y `no_disponible` llevan en `aria-label` la misma frase que el `AvisoDeError` (`role="alert"`) que contienen, así que un lector de pantalla puede leerla dos veces. No lo cuento como hallazgo: no rompe nada.
- Cómo reproducir la sonda de H1:
  1. `firmarNota` devuelve `{ ok: true, nota: null }`.
  2. Se pone el foco en «Recargar» y se pulsa.
  3. `abrirEditorDeNota` devuelve `{ estado: 'error' }`.
  4. Se miden `activeElement` y `queryAllByRole('button')`.

## Corte B · ronda 3

**Ninguna ALTA en el corte B, ronda 3.** Hay 0 MEDIA y 2 BAJA nuevas. Las dos son pruebas que no muerden. El código del arreglo es correcto en todos los casos que he recorrido. Siguen abiertas las cuatro BAJA de la ronda 2 (B2-H1, B2-H2, B2-H3 y B1-H8): `0c6fac2` no las toca.

Rama `worktree-agent-a50633aa7d7148c4d`. Lo nuevo de la ronda es `git show 0c6fac2`, que toca solo `editor-de-nota.tsx` (`E`) y `editor-de-nota.test.tsx` (`ET`). Los dos están en `app/(app)/pacientes/[id]/historia/notas/`.

**La rama es la revisada más `0c6fac2`, y nada más.** `git diff worktree-agent-a569a13c061c1d353 worktree-agent-a50633aa7d7148c4d -- app lib scripts supabase accesibilidad` toca los mismos dos ficheros (+66 −3). Sus líneas `+`/`-` coinciden byte a byte con las de `git show 0c6fac2` (comparadas con `diff`). El cherry-pick del corte B no ha arrastrado nada.

Cómo lo he medido:
- No he usado la base local, ni Playwright, ni el puerto 3000.
- Los mutantes se han aplicado en el propio worktree. Después de cada uno, `git checkout --` ha restaurado el fuente, y al acabar `git status` sale limpio. Lo hago constar porque la ronda 2 trabajó sobre una copia.
- Línea base: `npx vitest run editor-de-nota`, 82/82 en verde. El filtro va por nombre: con la ruta, los corchetes de `[id]` no se escapan bien y vitest dice «No test files found».

### Lo que pedía el encargo, punto por punto

| Punto | Juicio | Cómo lo he comprobado |
|---|---|---|
| Diálogo cerrado | **No roba el foco.** El efecto vive en `DialogoDeFirma` (`E:1192-1196`) y se desmonta con él. Los caminos que cierran el diálogo no fijan ningún error: firma `ok`, `guardarYa` con conflicto o `bloqueada`, el `default` del `switch` y el reloj. Al reabrir, `alFirmar` pone `setErrorFirma(null)` en el mismo lote que `setDialogo(true)` (`E:899-900`), así que el diálogo monta con `error === null` y el efecto no hace nada. | Lectura de `E:610-667` y `E:891-918`. |
| Error que no es de petición | **No existe ese caso.** `ErrorDeFirma` solo trae errores de la petición. La validación del cliente (motivo vacío) va por `setError` de react-hook-form (`E:1179`) y no toca la prop `error`. `faltaMotivo` lleva el foco al motivo, que es donde está su mensaje (`mensajeMotivo`). | Lectura. Esa rama no tiene prueba, pero no se alcanza desde la interfaz (ver las notas). |
| Re-render sin cambio | **No roba el foco**, porque las dependencias `[pendiente, error]` lo impiden. Un segundo rechazo con el mismo error sí vuelve a enfocar, como debe: `confirmarFirma` pone antes `null` (`E:613`). | Lectura. Pero ninguna prueba fija las dependencias: B3-H1. |
| Choque con los rescates de las rondas 1 y 2 | **No chocan.** El rescate del padre (`E:520-533`) solo actúa con `dialogo === false`. `pedirFoco` (`E:513-517`) solo se pone en `true` en `abrir` y en `aplicarRecarga` completa, y ningún camino de rechazo pasa por ahí. Los efectos `conflicto`, `firmadaSinRecargar` y `enfocarBloqueada` dependen de estados que el rechazo con el diálogo abierto no cambia. Al cancelar después del error, `useDevolucionDeFoco` devuelve el foco a «Firmar» de la barra, que ya está habilitado. | Lectura. «cancelar sigue devolviendo el foco» sigue en verde. |
| `aria-describedby` solo con la alerta | **Correcto.** `errorDePeticion` (`E:1188`) y las dos `<p role="alert" id={idError}>` (`E:1245-1254`) usan la misma condición, y con `faltaMotivo` el botón no lleva el atributo. | Lectura. El mutante que lo pone con cualquier error sobrevive, pero es equivalente en la práctica (ver las notas). |
| ¿Muerden las pruebas? | **El arreglo, sí. Las guardas, no.** | Ver la tabla siguiente. |

| Mutante en `E` | Resultado |
|---|---|
| M1 · anular el efecto (`return` al principio) | **Muere**: fallan los 2 casos de `it.each` (`ET:1097`). |
| M2 · quitar `pendiente \|\|` de la guarda | Sobrevive. **Es equivalente**: el `focus()` sobre un botón deshabilitado no hace nada, y el efecto vuelve a correr cuando `pendiente` pasa a `false`. No es hallazgo. |
| M3 · quitar `error === null` de la guarda | **Sobrevive**: B3-H2. |
| M4 · enfocar siempre `refConfirmar`, sin la rama de `faltaMotivo` | Sobrevive. Equivalente en la práctica (ver las notas). |
| M5 · `aria-describedby={error ? idError : undefined}` | Sobrevive. Equivalente en la práctica (ver las notas). |
| M6 · efecto sin array de dependencias | **Sobrevive**: B3-H1. |

La prueba nueva imita bien al navegador: quita `disabled`, hace `blur()`, vuelve a ponerlo y comprueba `activeElement === body` antes de resolver. Por eso M1 muere por el motivo correcto, porque sin el efecto el foco se queda en `body`. La negativa «sin error, no lleva `aria-describedby`» (`ET:1111`) mata el mutante que pone siempre el atributo.

### BAJA

**B3-H1 · `E:1196` (`[pendiente, error]`) y `ET:1073-1116`. Ninguna prueba fija que un re-render sin cambio no mueva el foco. Sin dependencias (M6), las 82 pruebas siguen en verde.**

Las dependencias son lo único que separa «enfocar al llegar el error» de «enfocar en cada render mientras haya error». Las pruebas de la ronda 3 solo miden el instante en que llega el error. Ninguna provoca después un re-render ajeno con el foco en otro control del diálogo.

Escenario con M6: la firma se rechaza con `noSeFirmo`. El profesional pasa con Tab a «Cancelar» o a «Conjunta». A los 30 s, el `setTic` del reloj (`E:436`) vuelve a pintar el editor y el diálogo. El efecto corre y el foco salta a «Firmar», y con Intro firmaría en vez de cancelar.

Arreglo de la prueba: después del rechazo, `focus()` en «Cancelar», `await avanzar(30_000)` y comprobar que el foco sigue en «Cancelar».

**B3-H2 · `E:1193` (`error === null`). Ninguna prueba fija el foco inicial del diálogo con versiones. Sin esta guarda (M3), el efecto nuevo pisaría `focoInicial` y las pruebas siguen en verde.**

`Dialogo` es hijo de `DialogoDeFirma`, así que su efecto de `focoInicial` (`components/ui/dialogo.tsx:31-41`) corre antes que el efecto nuevo del padre. Sin la guarda, el efecto nuevo corre al montar (`pendiente` es `false` y `error` es `null`) y se lleva el foco a «Firmar».

Escenario con M3: el profesional modifica una nota firmada y abre el diálogo. El foco, que debía estar en «Motivo del cambio», cae en «Firmar». Si pulsa Intro creyendo que está en el campo, el formulario se envía y vuelve con «hace falta un motivo».

Ninguna prueba de `ET` comprueba `activeElement` al abrir el diálogo con `versiones: [version(1)]`. Arreglo de la prueba: un caso con versiones que compruebe que el foco está en «Motivo del cambio» al abrir.

### Notas para el orquestador (no son hallazgos)

- **La rama `faltaMotivo` del efecto (`E:1194`) y su exclusión de `aria-describedby` (`E:1188`) no tienen prueba, pero tampoco se alcanzan desde la interfaz.** Con versiones, el cliente bloquea el motivo vacío con el mismo `trim()` que el servidor (`E:1177` y `lib/notas/servidor.ts:838`), así que el servidor nunca contesta `falta_motivo`. Sin versiones en el cliente y con alguna en la base, antes salta `sin_borrador` o `conflicto` (`lib/notas/servidor.ts:773-774`). Por eso M4 y M5 son equivalentes en la práctica. No lo cuento como hallazgo. Si se quiere fijar la intención, basta un caso con `firmarNota` resolviendo `{ ok: false, motivo: "falta_motivo" }` y versiones.
- Con `faltaMotivo` y `conVersiones === false`, el foco cae en «Firmar» y no hay mensaje en ningún sitio. `mensajeMotivo` solo se pinta dentro del `AreaTexto`, que no existe sin versiones, y `errorDePeticion` excluye ese error. Antes de `0c6fac2` el foco caía en `body` con el mismo silencio, así que no es una regresión. Solo puede ocurrir si el modelo del cliente dice «sin versiones» y la base cuenta alguna (`lib/notas/servidor.ts:839`). Por lo de la nota anterior, no lo cuento como hallazgo.
- Con `noSeFirmo` o `vacia`, el lector de pantalla puede leer el texto dos veces: una porque la alerta se monta y otra porque es la descripción del botón que recibe el foco. No rompe nada, y la verificación 4 lo da por bueno en el navegador.

## Corte C · ronda 1 (07e04f2, rama T-012-corte-c)

**Sin ALTA (0/0/3 nuevas; con B1-H8 arrastrado, 0/0/4 en `revision.json`).** El comparador no deja ver nada que la vista vigente no enseñe ya, se apaga con el candado y aguanta textos largos. B2-H1, B2-H2, B2-H3, B3-H1 y B3-H2 quedan cerrados: cada uno tiene una prueba que mata a su mutante. B1-H8 sigue abierto y no está en el territorio de este corte. Los tres hallazgos nuevos son BAJA: dos son huecos de prueba en el comparador y uno es un reintento que no se anuncia.

Método: copié la rama en un directorio aparte (git archive con los node_modules del repo enlazados) y medí cada mutante con `npx vitest run` sobre el fichero de pruebas que le toca. Línea base: 241 pruebas en verde en los cuatro ficheros del diff.

### Las dos preguntas del implementador

1. **E4 (sin `!estado.conflicto` en `enCaminoDeRecarga`, `E:178`) y E12 (sin conservar `enfoqueAviso` en la acción `modelo`, `E:255`): los dos son equivalentes.**
   - E4: el reductor nunca tiene a la vez `conflicto` y un aviso de `AVISOS_CON_RECARGA`. `conflicto` solo llega como respuesta del servidor con testigo: guardar o firmar. Después de `yaFirmada` o `firmadaSinRecargar`, `sesion.escribe` vale `false`, y `guardarYa` (`E:420`) devuelve el conflicto en local sin hacer `dispatch`. `fijarCoprofesional` le pasa a `explicarCeroFilas` un testigo `null`, así que nunca da conflicto. `empezarModificacion` tampoco lo da. La guarda es defensiva y la dejo como está.
   - E12: `modelo` y `apertura abierta` ponen `aviso: null`. Ningún +1 se despacha en el mismo lote que `modelo`, así que el efecto de foco (`E:516-518`) ve el paso de 0 a 1 con contador o sin él.
   - Hay una nota en el apartado del orquestador sobre la prueba que el diseño cita para E4.
2. **`key={versiones.length}` (`E:1152`) hace lo que pide el diseño.** C.1.3 dice: «La key lo cierra y le recalcula los valores por defecto cuando llega una versión nueva». Matando la key (K1) cae la prueba «al llegar una versión nueva…». El caso límite es una longitud igual con composición distinta: en lectura conjunta se pierde una asignación y entra una conjunta. Ahí el `useState` conserva dos números, pero el contenido se saca siempre del prop actual con `find` y respaldo a primera y última. Ningún texto viejo se queda en pantalla. No hay fuga.

### Lo que se pidió buscar

- **Fugas por la proyección conjunta: no hay.** El comparador solo lee `numero`, `texto` y `reservadas` de las versiones que ya trae la vista (`comparador.tsx:81-90`). El diff depende solo de dos textos que ya se ven. No pinta motivo ni autor, y la prueba «no muestra ningún motivo de cambio» lo fija. En la lectura conjunta, las reservadas de una conjunta ya salían en la vigente: `docs/architecture.md:418-421` solo las excluye de lo que se da al paciente. La numeración es la posicional de B1-H4, y la prueba «números posicionales…» la fija.
- **Candado: se cumple.** Con `cerrada`, la fase pasa a `bloqueada` y se desmonta el árbol entero. La prueba «la comparación cae con el candado» comprueba que no queda ningún `ins` ni `del` ni texto comparado.
- **Coste: el tope basta.** Lo medí con node 24 y `lib/notas/comparar.ts` aislado. 20 000 palabras con 490 sustituciones repartidas: 15 ms, comparación completa. Con 600 sustituciones se agota el presupuesto: 7 ms. Vocabulario de 12 palabras: 9-10 ms. Textos periódicos adversarios: 8-22 ms. Las instantáneas `Int32Array` por cada d están acotadas por `MAX_EDICIONES = 1000` (`lib/notas/comparar.ts:14,36`). El peor caso de memoria está por debajo de unos pocos MB.

### Estado de los abiertos

| Id | Estado | Mutante que muere |
|---|---|---|
| B2-H1 | Cerrado | B1a-B1f: sin contador, sin respaldo al grupo, sin reintento, sin `tabIndex` del aviso. Mueren por (a/b), (a2), (d) y «firma que sale bien pero no trae la nota» |
| B2-H2 | Cerrado | B2a/B2b/B2c: sin `tabIndex` en `borradorOculto`, `EstadoVacio` y el `h2` de `BorradorAjeno` |
| B2-H3 | Cerrado | H3: sin el recorte `lecturaConjunta && posicion === 0` en `lib/notas/servidor.ts:368`. H3b (sin `lecturaConjunta`) sobrevive, pero el diseño ya lo declara equivalente: en lectura individual la primera visible es la v1 real, que nunca lleva motivo |
| B3-H1 | Cerrado | M6: efecto de foco sin dependencias |
| B3-H2 | Cerrado | M3: sin `error === null` |
| B1-H8 | Abierto | Fuera de territorio (`app/(app)/pacientes/[id]/datos.ts`). Ya está anotado en `docs/state.md:53` §Hallazgos, así que la parte «sin anotar» de la ronda 3 ya no vale |

Mutantes del comparador que mueren: C1-C5. En `comparar.test.ts` mueren P1 (sin presupuesto), P2 (sin NFC), P3 (sin recorte de prefijo) y P4 (todo como un bloque).

### BAJA

**C1-H1** · `app/(app)/pacientes/[id]/historia/notas/comparador.tsx:95` · Ninguna prueba compara dos versiones con el mismo texto y distintas reservadas. El mutante `hayCambios = [nota].some(…)`, que solo mira la nota, deja las 17 pruebas en verde.
- Escenario: con el mutante, una modificación que solo añade una anotación reservada hace que la pantalla anuncie «Sin cambios entre estas dos versiones.» (con `role="status"`, así que el lector lo dice en voz alta). Debajo, el bloque de reservadas enseña lo añadido. El clínico que se fía del aviso no mira el bloque.
- La gemela que falta: `version(2, { texto: V1.texto, reservadas: 'Nueva' })`. Debe comprobar que no sale «Sin cambios» y que hay un `ins` en el bloque de reservadas.

**C1-H2** · `app/(app)/pacientes/[id]/historia/notas/comparador.tsx:82-84` · Ninguna prueba elige un par distinto del que sale por defecto. Sobreviven tres mutantes con las 17 pruebas en verde: `useMemo` de la nota sin dependencias (Q1), `useMemo` de las reservadas sin `a`/`b` (Q2) y `b` siempre la vigente (Q5).
- Por qué ninguna prueba lo ve: la única que cambia los desplegables («orden invertido») tiene dos versiones y acaba en el mismo par 1→2 del principio.
- Escenario con Q1: hay tres versiones y el profesional elige «Desde: Versión 1». El título dice «De la versión 1 a la 3», pero el diff sigue siendo el de la v2 a la v3. Lo que se cambió de la v1 a la v2 desaparece de una comparación que dice incluirlo.
- Escenario con Q5: con «Hasta: Versión 2» se compara contra la v3 y el desplegable sigue diciendo 2.
- La gemela que falta: tres versiones de textos distintos. Elegir 1→2 y comprobar el título y el `ins`/`del` de ese par. Después, 1→3.

**C1-H3** · `app/(app)/pacientes/[id]/historia/notas/editor-de-nota.tsx:210-211` (y la prueba `editor-de-nota.test.tsx:1177`, que lo fija) · Si «Volver a intentarlo» falla otra vez, el aviso se queda exactamente igual: el mismo `noSeRecargo` y el mismo texto. El `role="alert"` de `AvisoDeError` (`components/ui/piezas.tsx:266`) no cambia de contenido, y el +1 de `enfoqueAviso` llama a `focus()` sobre el botón que ya tenía el foco. El botón tampoco tiene estado de pendiente ni `disabled`.
- Escenario: sin red, el profesional que usa NVDA pulsa «Volver a intentarlo». La primera vez oye «No se pudo recargar la nota.», porque es el paso de `firmadaSinRecargar` a `noSeRecargo`. Las siguientes no oye nada y la pantalla no cambia. No puede saber si la recarga está en curso, si salió bien o si falló. La prueba (a2) da por buena justo esta situación: comprueba que el foco vuelve al botón y nada más.
- Es la clase «aviso que no cambia no se anuncia». El diseño no pide un anuncio por reintento, así que es BAJA.

### Notas para el orquestador (no son hallazgos)

- **El riesgo 1 de C.4 nombra la prueba `editor-de-nota.test.tsx:1035` como la que mitiga E4, pero esa prueba no lo discrimina.** En `:1035` el aviso es `null`, así que `enCaminoDeRecarga` da `false` con la guarda de conflicto o sin ella. E4 es equivalente porque no se puede llegar a ese estado, no porque esa prueba lo cubra. Si un corte futuro deja que `conflicto` conviva con `yaFirmada`, la guarda pasará a importar y no habrá ninguna prueba que la sostenga.
- Con `desde === hasta`, que es un paso intermedio al cambiar los dos desplegables, el título dice «De la versión 2 a la 2» y sale «Sin cambios». Es coherente y no lo cuento.
- `barra-de-acciones.tsx` solo cambia un comentario: «Descargar» espera a T-040, como dice el contrato tachado. `node ~/.claude/pipeline/territorio.mjs T-012` da los 10 ficheros dentro del territorio.

## Corte C · ronda 2 (07e04f2..61f6109, rama T-012-corte-c)

**Sin ALTA (0/0/2 nuevas; con B1-H8 arrastrado, 0/0/3 en `revision.json`).** C1-H1, C1-H2 y C1-H3 quedan cerrados: cada uno tiene una prueba que mata a su mutante por el motivo correcto. El contador `fallosDeRecarga` hace lo que dice: se reinicia al recargar bien y no cambia el texto de ningún otro aviso. Pero ninguna prueba sostiene esas dos propiedades: sobreviven los dos mutantes que las rompen. Son los dos hallazgos nuevos, los dos BAJA.

Método: copia de `61f6109` con `git archive` en el scratchpad y una unión a `node_modules` del repo principal (ya quitada; el `node_modules` del repo sigue entero). Cada mutante se midió con `npx vitest run` sobre su fichero. Línea base: 130 pruebas en verde en `comparador`, `editor-de-nota` y `comparar`. `tsc --noEmit` no da errores en los ficheros del diff. Territorio: `territorio.mjs T-012` da los 10 ficheros dentro.

### Los tres hallazgos de la ronda 1

| Id | Estado | Mutante y prueba que lo mata |
|---|---|---|
| C1-H1 | Cerrado | H1 (`hayCambios = [nota]`) muere en «C1-H1 · mismo texto y reservadas distintas…», por `queryByRole('status')` y por el «Sin cambios». Es la gemela pedida: misma nota, reservadas nuevas y un `ins` en el bloque de reservadas |
| C1-H2 | Cerrado | Q1 (memo de la nota sin dependencias) y Q2 (memo de reservadas sin `a`/`b`) mueren en «Desde: Versión 1…» y en «…1 con la 2, no con la vigente». Q5 (`b` siempre la vigente) muere en la segunda. Un mutante extra, Q6 (`a` siempre la primera), muere en «por defecto, de la 2 a la 3». Cada prueba mira el título y el `ins`/`del` de los dos bloques, así que el par elegido se comprueba en la nota y en las reservadas |
| C1-H3 | Cerrado | E1 (sin el `+1` del contador) muere en (a2) y (e). E2 (`> 0`: el primer fallo ya diría «Tampoco… (intento 1)») muere en las dos (a/b), en (a2) y en (e). E3 (`> 2`) muere en (a2) y (e). E7 (`aria-label` del grupo con el texto viejo) muere en (e), por el nombre del grupo. E8 (`mensaje` con el texto viejo) muere en (a2) y (e). La prueba (a2) ya no fija el silencio: tras el segundo fallo exige el texto nuevo |
| B1-H8 | Abierto, sin cambios | Fuera de territorio (`app/(app)/pacientes/[id]/datos.ts`); anotado en `docs/state.md` §Hallazgos |

### Lo que se pidió mirar

- **El contador se reinicia al recargar bien: sí, en el código.** Una apertura `abierta` reconstruye el estado con `abiertaDesdeNota` (`E:175`, `fallosDeRecarga: 0`), y lo mismo hace la acción `modelo`. Ninguna prueba lo fija (C2-H2).
- **No se filtra a otros avisos: sí, en el código.** `textoDelAviso` (`E:818`) solo usa el contador con `aviso === 'noSeRecargo'`. El contador sobrevive a `noDisponible` (`E:210` no lo toca), a `aviso`, a `solo_modelo` y a `sin_recargar`. De todas ellas, solo `noDisponible` puede coexistir con un contador mayor que 0. `noSeRecargo` solo se alcanza desde `yaFirmada` o `firmadaSinRecargar`, que son de solo lectura, así que ya no quedan Firmar, Modificar ni el desplegable de coprofesional. Esa conjunción de `E:818` no tiene prueba (C2-H1).
- **`key={fallosDeRecarga}`: no hace falta, y empeoraría.** El grupo y el `role="alert"` siguen montados entre dos `noSeRecargo`, porque la condición `estado.aviso !== null` no cambia. React cambia en su sitio el nodo de texto del `<p>`. `tCon` devuelve una sola cadena, así que es un único nodo de texto. NVDA, con Chrome y con Firefox, anuncia una región viva ya presente cuando su texto cambia: `alert` lleva implícitos `aria-live="assertive"` y `aria-atomic="true"`. El silencio de C1-H3 venía de que el texto era idéntico, no de que la región no se remontara. Con la `key`, en cambio, se desmontaría el botón que tiene el foco. El foco caería en `body` hasta que el efecto de `enfoqueAviso` enfocase el botón nuevo, y NVDA anunciaría ese cambio de foco (el botón y el nombre del grupo) encima de la alerta nueva: se oiría dos veces o se cortaría. La locución en sí no se puede medir en jsdom. Lo que sí se puede medir es lo que usa la prueba, que el texto cambie, y es el sustituto correcto.
- **La clave `notas.aviso.noSeRecargoOtraVez`.** Está en el área `notas.aviso` y no repite nombre (`index.test.ts` en verde). El hueco `{intentos}` coincide con el nombre que pasa `tCon`. El número cuenta las recargas que el usuario pide desde el aviso: la primera dice «No se pudo recargar la nota.» y la segunda, «Tampoco… (intento 2)». Es coherente con la prueba (e). Dos pulsaciones seguidas no se saltan un número, porque `abriendo` (`E:396`) descarta la segunda.

### BAJA

**C2-H1** · `app/(app)/pacientes/[id]/historia/notas/editor-de-nota.tsx:818` · Ninguna prueba sostiene que el contador solo cambie el texto de `noSeRecargo`. Con el mutante E4, que quita `estado.aviso === 'noSeRecargo' &&`, las 99 pruebas de `editor-de-nota` siguen en verde.
- Escenario con el mutante: firmada sin recargar → «Recargar» falla → «Volver a intentarlo» falla («Tampoco… (intento 2)», contador 2) → el tercer intento contesta `no_disponible`. El reductor pone `noDisponible` y conserva el contador en 2 (`E:210`), así que la pantalla vuelve a decir «Tampoco se pudo recargar la nota (intento 2).». Como el texto es idéntico al anterior, NVDA no lo anuncia. Además es falso: la nota ya no está disponible, no es un fallo de red. Y `noDisponible` no tiene botón, así que el foco va al grupo, que tiene el mismo nombre.
- La gemela que falta: dos fallos de `error` y un tercer intento con `{ estado: 'no_disponible' }`. Hay que comprobar que la alerta dice el texto de `notas.aviso.noDisponible` y que no contiene «intento».

**C2-H2** · `app/(app)/pacientes/[id]/historia/notas/editor-de-nota.tsx:198` · Ninguna prueba sostiene que el contador vuelva a 0 cuando una recarga sale bien. El mutante E5 arrastra `fallosDeRecarga` en la apertura `abierta`, igual que esa misma línea ya arrastra `enfoqueVigente`, y las 99 pruebas siguen en verde. El riesgo de arrastrarlo sin querer no es teórico: de los tres contadores de `Abierta`, es el único que no se arrastra (`enfoqueVigente` se arrastra en `E:198` y `enfoqueAviso` en `modelo`).
- Escenario con el mutante: el profesional tiene la nota abierta en el ordenador y en la tableta. En el ordenador firma, y la firma sale sin la nota. «Recargar» falla dos veces (contador 2) y a la tercera recarga bien. Mientras tanto ha pulsado «Modificar» en la tableta, así que la recarga trae un borrador editable. Escribe y firma, y la firma vuelve a salir sin la nota (`sin_recargar` no reinicia el contador). Pulsa «Recargar», falla, y la primera recarga fallida del ciclo nuevo dice «Tampoco se pudo recargar la nota (intento 3).». Sin la tableta, la recarga trae una nota sin borrador, y «Modificar» pasa por `modelo`, que reinicia el contador. Por eso el escenario necesita dos dispositivos, y por eso es BAJA.
- La gemela que falta: dos fallos y una recarga buena que traiga un borrador. Luego, firmar otra vez con `nota: null`, recargar con error y comprobar «No se pudo recargar la nota.» sin «intento».

### Notas para el orquestador (no son hallazgos)

- El mutante E6 arrastra `fallosDeRecarga` en la acción `modelo` (`E:262`). Sobrevive, pero es equivalente. `modelo` solo se despacha desde Firmar o Modificar, y ninguno de los dos está disponible mientras el contador es mayor que 0: `noSeRecargo` y `noDisponible` van siempre con solo lectura, y una recarga buena ya reinicia el contador antes de que vuelvan.
- En (a2), el `reintento.blur()` antes de `vaciar()` obliga a que el foco vuelva de verdad al botón tras el segundo fallo. No puede quedarse ahí por inercia.
