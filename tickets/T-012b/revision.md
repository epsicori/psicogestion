Sin hallazgos ALTA. Veredicto: APROBADO. 0 ALTA · 2 MEDIA (una cerrada; la otra se cierra en el commit de integración) · 6 BAJA (dos cerradas, dos aceptadas, dos abiertas que no bloquean).

# T-012b · Revisión consolidada (SQL + TS, con la pasada final sobre 9d716d8)

Fuentes: `tickets/T-012b/revision-sql.md` (revisor 1, SQL) y `tickets/T-012b/revision-ts.md`
(revisor 2, CLI y documentación), sobre `git diff main...worktree-agent-a47a1a55a62171516`
(base `1496de7`). Añado la pasada final sobre `9d716d8`, cotejado con su padre `dc6e938`, que es la
cabeza actual de la rama. No he leído ni `evidencia.json` ni el informe del verificador.

## Pasada final sobre 9d716d8

**Cada arreglo, cotejado:**
- **TS-M1** (`docs/architecture.md:98-102`): **cerrado.** La frase queda acotada a «una de esas siete
  columnas». Nombra `nota_id` como fuera del cotejo hasta T-012c, y deja escrito el riesgo de la cola (TS-B3).
- **TS-B1** (`scripts/verificar-huellas.mjs:12-24`): **cerrado.** Ahora atribuye las anomalías
  múltiples a T-005, y lo nuevo de T-012b es que el CLI deja de perderlas.
- **TS-B2** (`scripts/verificar-huellas.mjs:74`): **cerrado.** `t.version_id` entra como último criterio
  del `jsonb_agg(… order by …)`.
- **SQL-B1** (`scripts/rls/14-cadena-huellas.sql:988-1250`): **cerrado para `firmada_en`.** F.9b cambia
  solo la clave `firmada_en` del sobre de NCOT v2 y recalcula la huella. Como v2 es la última de la
  cadena, no hay `eslabon_desencadenado`. `creada_en` sigue cuadrando, así que solo se enciende la línea 147.
  F.9b espera exactamente `sobre_no_coincide_con_fila@2`. Tiene una aserción previa de que el
  `regexp_replace` encontró el patrón, y una demostración de guarda.
  - Lo he medido con `diff`: el mutante difiere de la copia restaurada **solo** en la línea de `firmada_en`.
    Normalizada (sin comentarios ni espacios), la copia restaurada es **idéntica** a la función de la migración.
  - La parte de 6.4 y 6.6 (tipado con `->>`) queda como riesgo aceptado, escrito en el banco
    (`:1236-1250`) para quien redefina la función en T-012c.

**Nada se queda cambiado fuera de la transacción.** `scripts/test-rls.mjs` concatena el banco
entre `begin;` y `rollback;`, así que el `create or replace` del mutante, el de la restauración, el
`revoke` y los `update` de NCOT v2 se deshacen al acabar. Si una aserción falla a mitad de F.9b,
`ON_ERROR_STOP` corta y el `rollback` también se lo lleva todo. Dentro de la transacción, la
restauración deja la función igual que la migración: `create or replace` conserva dueño, comentario y
ACL, y el `revoke` se repite. Después de F.9b, `F.9b · restaurados…`, F.10 y F.11 vuelven a comprobarlo.

---

## MEDIA

### M1 · Memoria del ticket y comentario desfasado (SQL-M1 = TS-M2) · A CERRAR EN LA INTEGRACIÓN

- **Dónde:** `supabase/migrations/20260915130000_alcance_en_el_sobre.sql:161-163`. Además, en la rama
  faltan `docs/bitacora/T-012b.md` y `docs/state.md`.
- **Descripción:** la rama no deja bitácora ni `state.md` (regla 4). Tampoco anota en §Hallazgos que el
  comentario de `fn_sellar_version_nota()` («el verificador tampoco detecta un `alcance` alterado por
  debajo») es falso desde T-012b, aunque el diseño §1.4 y «Lo que no entra» lo piden.
- **Escenario:** T-012c (ADR-067) reescribe `fn_sellar_version_nota()` entera con `create or replace` y
  arrastra el comentario falso. Ese comentario además remite a una entrada de `state.md` que no existe.
- **Estado:** por decisión del orquestador, lo cierra quien integra, en el commit de integración a
  `main`: bitácora, `state.md` reescrito y la nota del comentario en §Hallazgos. No bloquea la
  aprobación, pero **no se integra sin ello**.

### TS-M1 · `docs/architecture.md` prometía detectar cualquier `update` de la fila · CERRADO en 9d716d8

- **Dónde:** `docs/architecture.md:94-98` (antes del arreglo).
- **Escenario (el original):** un `update … set nota_id = <otra nota>` sobre una versión `conjunta` da
  «cadena íntegra», y el destilado decía que se detectaba.
- **Cierre:** la frase se acota a las siete columnas cotejadas y `nota_id` sale explícitamente del cotejo.

## BAJA

### SQL-B1 · Las líneas `firmada_en` y 6.4/6.6 no tenían negativa propia · CERRADO (firmada_en) / ACEPTADO (6.4/6.6)

- **Dónde:** `supabase/migrations/20260924150000_verificador_coteja_sobre_y_fila.sql:147`, `:143` y `:145`.
- **Escenario (el original):** si se quita la línea 147 en una reescritura (T-012c), el banco sigue en
  verde porque F.9 enciende también la 146.
- **Cierre:** F.9b más su demostración de guarda. Lo de 6.4/6.6 queda como riesgo aceptado, escrito en el
  banco: solo lo alcanza la puerta del INSERT con el sellado apagado, que ya señalan otras líneas.

### TS-B1 · Comentario del CLI que atribuía a T-012b las anomalías múltiples · CERRADO en 9d716d8

- **Dónde:** `scripts/verificar-huellas.mjs:12-14` (antes del arreglo).

### TS-B2 · Desempate no total si falta el índice único de la cadena · CERRADO en 9d716d8

- **Dónde:** `scripts/verificar-huellas.mjs:68` (antes del arreglo). Ahora ordena también por `t.version_id`.

### TS-B3 · Reescribir entera la última versión de una cadena no se detecta · RIESGO ACEPTADO

- **Dónde:** `docs/architecture.md:100-102`.
- **Escenario:** con los cerrojos levantados, cambiar a la vez la columna, el sobre y la huella de la
  última versión da «cadena íntegra». No hay eslabón siguiente y no hay anclaje externo.
- **Estado:** queda fuera del contrato y ya está escrito como riesgo aceptado en el destilado tras TS-M1.

### N1 · F.9b restaura una copia a mano de la función y el resto del banco corre sobre ella · ABIERTO (no bloquea)

- **Dónde:** `scripts/rls/14-cadena-huellas.sql:1138-1225` (la copia restaurada). F.10 (`:1264`), F.11
  y los módulos 15-17 corren después, sobre esa copia.
- **Descripción:** la restauración no vuelve a instalar la definición de la migración: instala un cuerpo
  copiado en el banco. Hoy son idénticos (lo he medido), pero ninguna aserción lo comprueba.
- **Escenario:** T-012c (ADR-067) añade a la migración la línea `nota_id` del cotejo y deja F.9b como está.
  Tras F.9b, el banco reinstala el verificador de T-012b. F.10 («sin falsos positivos en todo el banco») y
  cualquier gemela positiva posterior prueban entonces la función vieja. Un falso positivo que la línea
  nueva provocara en filas honestas saldría verde en el banco y rojo en `npm run verificar:huellas` sobre la
  base real.
- **Arreglo sugerido (para T-012c o antes):** guardar `pg_get_functiondef('public.verificar_cadena_huellas(uuid)'::regprocedure)`
  con `\gset` antes del mutante y restaurar desde esa variable (`\gexec`). El mutante se puede derivar con
  `replace()` sobre el mismo texto, con una aserción de que el `replace` cambió algo.

### N2 · `architecture.md` da a entender que T-012c cubrirá `numero_version` · ABIERTO (no bloquea)

- **Dónde:** `docs/architecture.md:100` («`nota_id` y `numero_version` quedan fuera de este cotejo hasta
  T-012c (ADR-067, sellar `nota_id`)»).
- **Descripción:** el ADR-067 solo sella `nota_id`, y nada decidido mete `numero_version` en el sobre.
- **Escenario:** tras T-012c, un auditor o el arquitecto de un ticket posterior lee en el destilado (que
  «manda sobre quién ve qué») que `numero_version` ya se coteja, cuando no hay ninguna línea que lo haga.
  Parte del caso sí lo cubre otra cosa: adelantar una versión exige `motivo_cambio` no nulo por el CHECK, y
  la línea 145 lo señala. Pero la frase no lo dice. Arreglo: «`nota_id` hasta T-012c (ADR-067);
  `numero_version`, sin decisión».

---

## Veredicto

**APROBADO para integrar.** No hay ALTA. De las medias, TS-M1 está cerrada, y M1 (memoria) es condición del
commit de integración, no de la rama. N1 y N2 son BAJA abiertas y no bloquean. Conviene pasarlas al
diseño de T-012c, que es quien vuelve a tocar el verificador y el destilado.
