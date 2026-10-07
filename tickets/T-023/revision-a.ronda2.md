**Sin hallazgos ALTA.** T-023 · ronda 2 · revisor A (base, RLS, dinero y constitución). 0 ALTA, 0 MEDIA, 3 BAJA.

Base: `worktree-agent-a65aa0bb5f872243e` (HEAD 27cd231), diff de la ronda `T-023-cobros-y-pendiente..` y
diff completo `main...`. He leído el código y no he ejecutado nada contra la base: la revisión es de solo
lectura y no he hecho reset ni seed.

## Hallazgos de la ronda 1 que me tocan

| R1 | Estado | Por qué |
|---|---|---|
| A-H1 ALTA | **Cerrado** | `profesionales_del_pendiente()` saca el nombre de `directorio_perfiles` (migración:192-200). En `app/(app)/facturacion/` no queda ningún `from('perfiles')`. G1 llama a la función como ADM, sin RLS fingida, y M16 cae en G1 porque `perfiles` solo devuelve la fila propia. |
| A-H2 MEDIA | **Cerrado** | La vista consolida en el superviviente: `p.fusionado_en is null` más `union all` de los absorbidos en los tres laterales, con un salto, que `fn_repuntar_fusionados` mantiene. La acción rechaza `fusionado_en` en `pacienteId` antes de insertar (acciones.ts:48-50), con su prueba y su gemela. Si una fusión ocurre entre la lectura y el insert, el cobro queda en el absorbido y la vista lo suma igual, así que no se pierde. |
| A-H3 MEDIA | **Cerrado** | La métrica sale de `resumen_pendiente` (un agregado, una fila). La lista se pide con `.range` de 50 y los nombres con `.in` de 50 ids como mucho. Los pacientes del formulario se leen de 1000 en 1000, con desempate por id y deduplicados. «Últimos cobros» lleva `limit 20`. No queda ninguna lectura sin tope ni ningún `.in()` sin tope. |
| A-H4 BAJA | **Cerrado** | E10a-d en los centros CK (Kiritimati) y CP (Pago Pago). La función lee el centro del paciente, no la sesión (`fn_validar_cobro`:51-52). |
| A-H5 BAJA | **Cerrado** | A5a da «sin fila», y su gemela A5b, con un bono de 10,00, da la fila exacta. M14 cae en A5a. |
| A-H6 BAJA | **Cerrado a medias** | Los cinco puntos están en `state.md`, pero dos no dicen lo que fija R2.7: uno niega un hecho medido y otro da por cerrado lo que el diseño deja abierto. Va como H1. |

## Lista R2.9 (revisor A), punto por punto

- **El absorbido no tiene fila y el superviviente sale una vez.** Se cumple: `where p.fusionado_en is null`
  (migración:138) y `p.id` es la clave, con tres laterales que agregan. F1 y F2 lo comprueban, este con
  `count = 1`.
- **Cada lateral suma el `union all`, en un solo salto y sin `coalesce`.** Se cumple: las tres ramas usan
  `m.fusionado_en = p.id` (líneas 117-119, 127-129 y 134-136). Busqué las variantes que no se dan:
  - `m.fusionado_en is not null` sumaría lo de P30F a P30A, y caerían los casos B;
  - mirar la familia en el recorte del técnico o del profesional caería en F6 y en F4.
- **La tarifa contra `c.paciente_id`.** Se cumple (línea 109). M13 da `dev=27000`. La variante contraria,
  buscar la tarifa en toda la familia, pondría la cita de P30E a 70 en lugar de 60 y daría `dev=29000`; F2
  la caza.
- **El recorte por rol mira el `p.id` del superviviente.** Se cumple. `es_profesional_asignado(p.id)`, con
  `p` superviviente, solo es cierto para su profesional (rls_funciones:100-106), y por eso F4 da cero filas a
  PRO2.
- **F5/F6, la decisión deliberada. La juzgo aceptable y no es un BLOQUEO.**
  - El absorbido y el superviviente son la misma persona (ADR-031).
  - La fila solo lleva importes y no lleva sesiones, tipos ni fechas.
  - El técnico de CA ya podía ver el pendiente de esa persona en su centro. La fusión le suma importes de
    CB sin ningún dato clínico.
  - TEC2 deja de ver la fila, y es coherente: la persona ya no es de su centro. Tampoco puede registrar un
    cobro, porque la acción rechaza al absorbido.
  - La consecuencia que sí queda sin anotar es una incoherencia de pantalla (H2).
- **PRO2 sigue leyendo en `cobros` lo de P30F, sin fila en la vista.** Se cumple, pero el diseño dice
  «queda anotado» y no está ni en `state.md` ni en la bitácora (H2).
- **Las dos funciones.**
  - Son `security invoker`, con `search_path = ''`, `revoke … from public, anon` y `grant` a `authenticated`.
    A9b lo lee del catálogo.
  - `p_profesional_id` no puede ampliar nada. El filtro es una conjunción sobre una vista que ya recorta por
    `rol_actual()`, y aunque el planificador lo empuje bajo la barrera, `uuid_eq` es leakproof y solo quita
    filas. G5 lo comprueba con su gemela.
  - `profesionales_del_pendiente` no lee `perfiles` (M16) y devuelve solo `id, nombre_completo`.
  - Al técnico solo le da nombres que `directorio_perfiles` ya le enseña.
- **`max_rows` y `.in()`.** Ver A-H3: no queda ninguna lectura sin tope.
- **E10.** La zona sale del centro del paciente. M15 se midió una vez, a las 10:42 de Madrid en horario de
  verano. A esa hora Pago Pago va 13 h por detrás, así que «hoy» allí es ayer en Madrid y el mutante acepta
  E10d. La tabla de R2.2 se sostiene:
  - en invierno, [11, 24) ∪ [0, 12) cubre el día;
  - en verano, [12, 24) ∪ [0, 13) también;
  - ni Kiritimati ni Pago Pago tienen horario de verano;
  - `now()` es constante en la transacción compartida, así que `\gset` y el disparador ven el mismo instante.
  - Con la tabla basta, sin medir a una segunda hora.
- **Aserciones existentes.**
  - No cambia ningún valor esperado.
  - No había recuentos por prefijo: D1-D9 ya iban por lista explícita.
  - P30D (con el bono de A5b), P30E, P30K y P30P son de PRO1 o de CA y no tocan ninguna lista de los
    bloques B, C y D.
- **Gemelas y códigos.** F4 y F6 llevan su gemela (`P30B ≠ sin fila`) y G5 la suya (`filas >= 3`). E10b y
  E10d comprueban 23514 y el fragmento del mensaje.
- **Constitución, regla 6.** El diff no tiene ningún UPDATE ni DELETE sobre `cobros`, `bonos`, `facturas`
  ni `auditoria`. Los únicos `update` son de `citas.estado`, en la fijación y como `postgres`. Los `update`,
  `delete` y `truncate` sobre `cobros` solo aparecen como negativas (E1-E6, 42501).

## Mutantes M11-M17: ¿caen por el motivo correcto?

| M | Cae en | ¿Motivo correcto? |
|---|---|---|
| M11 | F1, con `dev=22000` | Sí. 22000 son la cita de P30F a 70 más su bono de 150, que salen como fila propia. F2 también caería por el `count = 1`. |
| M12a | F2, con `dev=21000` | Sí: 60 + 150, sin la cita del absorbido. |
| M12b | F2, con `dev=13000` | Sí: 60 + 70, sin el bono. |
| M12c | F2, con `cob=2000` | Sí: solo el cobro de P30E. |
| M13 | F2, con `dev=27000` | Sí: la cita de P30F a la tarifa base de 60, porque P30E no tiene tarifa propia. |
| M14 | A5a, con `dev=0 est=cobrado` | Sí: P30D sale con ceros. |
| M15 | E10d a las 10:42 | Sí, y en la otra franja caería en E10a (ver arriba). |
| M16 | G1 | Sí: el administrador lee 0 perfiles ajenos, el `array_agg` sale nulo y `assert` trata el nulo como fallo (`is distinct from true`). |
| M17 | G4 y G5 | Sí: el agregado sin filtro no iguala al de PRO1, y como PRO1 ve sus filas y no ceros. |

## Hallazgos

### H1 · BAJA · `docs/state.md:27` y `:31`: dos de los textos de R2.7 cambian el hecho que anotan

- **Línea 27.** Dice que el paso `realizada → cancelada` mueve el pendiente «**sin rastro**». R2.7 y el
  juicio de la ronda 1 (revision-a.ronda1.md:89) dicen lo contrario, medido: quedan 2 filas en `auditoria`
  (`auditar_citas`) y el técnico no puede hacerlo (UPDATE 0). La línea también pierde «ticket aparte, de
  agenda».
- **Línea 31.** Borra la línea antigua «`directorio_perfiles` sin prueba RLS» y dice que 30-cobros «cierra el
  hallazgo … para esa vista». R2.7 pedía añadir el texto a la línea existente con «sigue sin módulo propio».
  G1-G3 solo ejercen la vista a través de `profesionales_del_pendiente()` y con tres sesiones (ADM, PRO1 y
  rol nulo). Ninguna aserción lee la vista directamente ni mira qué ven el técnico o un profesional de las
  columnas `rol`, `estado` y `centro_id`.
- **Escenario.** Quien abra el ticket de la guarda de transición lee «sin rastro» y lo prioriza o lo diseña
  como un hueco de auditoría que no existe. Quien triage los hallazgos lee «cierra» y descarta el módulo
  RLS de `directorio_perfiles`. Así, una política que el técnico lea de más en las tres pantallas de
  administración seguiría sin ninguna prueba que la cace.

### H2 · BAJA · `docs/state.md:30`: la nota de «Últimos cobros» cubre una puerta de tres

- **Qué pasa.** La vista suma al superviviente los cobros de sus absorbidos. `cobros_lectura`, en cambio,
  recorta por el registro del cobro (economico_esquema:1157-1168, sin resolver la fusión para el técnico).
- **Qué está anotado.** Solo el caso del filtro del administrador.
- **Qué falta.** Dos casos más:
  - el técnico del centro del superviviente;
  - el profesional del absorbido. R2.9 dice que su caso «queda anotado», y no está ni en `state.md` ni en
    `docs/bitacora/T-023.md`.
- **Escenario, con la fijación del banco.**
  - TEC1, de CA, ve a «Elsa» con `cobrado = 70,00 €` (F5). En «Últimos cobros» solo encuentra el cobro de
    20,00 de P30E: el de 50,00 de P30F, en CB, no lo ve, y no puede cuadrar la cifra con la lista.
  - PRO2 ve en «Últimos cobros» el cobro de 50,00 de «Fede» y ningún pendiente de esa persona.
  - No cambia ninguna cifra, y no hay ninguna nota que lo explique ni ticket que lo recoja.

### H3 · BAJA · `app/(app)/facturacion/datos.ts:281-282`: un error al leer el directorio se rotula como «Profesional no encontrado»

- **Qué pasa.** Si la lectura de `directorio_perfiles` del elegido falla, el error se registra y la opción se
  pinta con `t('cobros.profesionalDesconocido')`, el mismo texto que «no existe». Ninguna prueba de
  `datos.test.ts` cubre esa rama: la de la línea 216 simula `data: null` sin error.
- **Escenario.**
  1. El administrador abre `?profesional=<uuid de Bruno>` y Bruno no tiene filas en la vista, así que no
     sale entre las opciones.
  2. La lectura del directorio da un error transitorio.
  3. El desplegable afirma «Profesional no encontrado» de un profesional que existe, mientras la lista y la
     métrica siguen filtradas por él.
- **Lo que esperaría.** Que un error pinte un rótulo neutro, o el uuid. «No encontrado» solo debería
  salir cuando la lectura acaba bien y no trae la fila.

## Mirado sin hallazgo

- `resumen_pendiente` devuelve siempre una fila, porque es un agregado sin `group by`, y `cargarResumen`
  trata como error cualquier otra cosa y los números que no sean enteros seguros.
- La paginación usa el mismo orden que el diseño: `excedente desc, pendiente desc, paciente_id`.
  `?pagina` fuera de rango cae en la última página.
- La acción solo rechaza al absorbido a quien ya lo ve bajo RLS, así que no abre ningún oráculo nuevo.
- La columna `fusionado_en` se lee con el grant de tabla (`grant select … pacientes to authenticated`).
- El `fusionado_en` del simulador de `acciones.test.ts` es una marca de tiempo y no un uuid. Es inocuo,
  porque la guarda solo mira que no sea nulo, y no hay ningún escenario de fallo.
- `tipos-bd.ts` está regenerado, con `p_profesional_id?` opcional y `Args: never`.
- El 30 es el último módulo de la transacción compartida. Las filas de PRO1 en `perfiles_centros` (CK y CP)
  y los centros nuevos no alcanzan a ningún módulo posterior.
