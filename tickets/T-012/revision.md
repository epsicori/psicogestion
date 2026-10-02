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
