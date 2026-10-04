**Sin ALTA. Gate de la ronda 2: 0 ALTA, 0 MEDIA, 1 BAJA.**

# T-042 · Revisión, ronda 2 (un solo revisor)

- **Diff revisado:** `worktree-agent-a9f0330c3f05f9a94...worktree-agent-a52b8f7ae1c86e901` (commits 19c0802..89b673c, HEAD `89b673c`).
- **Contra qué:** el contrato `tickets/T-042-pin-y-canje-en-dos-pasos.md`, «R2 · Ronda 2» de `tickets/T-042/diseno.md` (con la respuesta a P-R2-1) y la revisión combinada de la ronda 1.
- **Método:** solo lectura de la rama y del worktree. No se ha tocado la base: el verificador la estaba reseteando. Todo lo que sigue sale de leer el código, no de medirlo.

| Id | Sev. | Dónde | Qué |
|---|---|---|---|
| R2-H1 | BAJA | `supabase/migrations/20261009120000_pin_y_canje_en_dos_pasos.sql:442` | El predicado de la `update` nueva de `bloquear_historia()` no tiene prueba ni mutante. Si se quita, ningún banco se pone en rojo. |

## R2-H1 (BAJA) · el predicado anti-ruido de `bloquear_historia()` no lo vigila nada

- **Qué pasa.**
  - R2.2 dice que el predicado `(ph.desbloqueos_autorizados > 0 or ph.autorizado_hasta is not null)` «no es decorativo»: sin él, «podría romper las cuentas exactas de los bancos 03 y 09».
  - Ningún banco cuenta filas `UPDATE` de `pines_historia`:
    - el 03 cuenta solo `PIN_FALLIDO` y `PIN_BLOQUEADO` (`scripts/rls/03-candado.sql:105-124`);
    - el 09 solo llama a `bloquear_historia()`;
    - la «no vacía» nueva del 24 exige `> 0`, y más filas la siguen dejando verde.
  - Tampoco hay ningún mutante del predicado en `mutantes.json`.
- **Escenario.**
  - Alguien «simplifica» la `update` y quita el `and (…)`.
  - Cada pulsación de «Bloquear» (`app/(app)/candado/acciones.ts:50`, `app/(app)/pacientes/[id]/acciones.ts:172`) escribe una fila `UPDATE` en `auditoria`, que es de solo adición y no se puede borrar, y mueve `actualizado_en`, aunque no haya ninguna autorización que anular.
  - `npm run test:rls` sigue verde.
- **Por qué es BAJA.** Ni abre nada ni filtra nada: es ruido permanente en una tabla de solo adición, y la justificación del diseño no la sostiene ninguna prueba.
- **Cómo se cerraría.**
  - Una aserción en CA-R2.2: un `bloquear_historia()` de PRO1 con la fila en `0/0/false` deja el recuento de `auditoria where tabla = 'pines_historia' and registro_id = PRO1 and operacion = 'UPDATE'` igual que antes.
  - Más el mutante «sin predicado» registrado en rojo.

## Hallazgos de la ronda 1: cerrados

- **A1-H1 (MEDIA): cerrado.** C4 y C5 están en `scripts/t042-oraculo.mjs:400-454`, con `conBloqueador` en 146-219.
  - Los 4 intentos previos los hace `comprobarPin` y `comprobarCod`, no psql. C4 no llama a `cuidarse()`.
  - El bloqueador de C5 retiene las dos cosas: el candado de consejo y luego la centinela `for update`.
  - Las líneas base se leen antes de la ráfaga, y se exige `intentos = 4`.
  - C4 exige `5`, el bloqueo y +1 en `PIN_FALLIDO`, `PIN_BLOQUEADO` y los avisos. C5 exige `5` y el bloqueo.
  - `oraculo-postgrest.json` registra `en_espera: 3`, `base`, `final` y `veredicto: PASA` en los dos.
  - `mutantes.json`: M-H4 en rojo por C4 (7; +3, +3, +3); M-H5 en rojo por C5 (7); M-H5a y M-H5b equivalentes, en verde y con `en_espera 3`.
- **A1-H2 (BAJA): cerrado.** Lo que se añadió está en la sección h), al final y después de los grants.
  - `bloquear_historia()` limpia la autorización, con predicado y antes del `return v_n`.
  - `fijar_pin_historia` añade dos columnas en el `on conflict`.
  - CA-R2.2 tiene sus gemelas positivas (`0/1/false` y `0/2/false` antes) y comprueba el paso dos real (`t42_p2_pin() = 'pin_incorrecto'`), no solo la fila. M21 y M22 caen por la aserción de la fila y por la del paso dos.
- **A1-H3 (BAJA): cerrado.**
  - Va primero la «no vacía» y después la ausencia de la clave y del bcrypt, tanto en `estado_anterior` como en `estado_posterior`.
  - Para el canje, sobre todo el lote de PRO1 con `codigo_hash`.
  - La «no vacía» se cumple también con las filas que escriben los ayudantes de fijación (`t42_pin_reset`, `t42_lote`, como postgres). No es un fallo: pasan por el mismo disparador, y M23 y M23b las vuelven rojas igual.
- **A1-H4 (BAJA): cerrado.**
  - La CA5.5 lleva la fijación `canje_autorizado_id is null`, ejecutada como postgres (después de `reset_sesion`), y el mensaje con su motivo real.
  - La CA5.5b lleva el comentario «inalcanzable por la API… No borrar».
  - M10 queda con `forjado: true`, conforme a P-R2-1.
- **B1-H4 (BAJA): cerrado como nota.** La entrada está en `docs/bitacora/T-042.md`, y `tipos-bd.ts` no se ha tocado. La cita en la evidencia de la CA15 es del verificador; no la he leído, a propósito.
- **B1-H5 (BAJA): cerrado.**
  - Las dos llamadas a `console.error` del paso dos pasan `error?.code ?? 'sin fila'`.
  - En las pruebas, `sesionFingida` y `sesionCanje` aplican el error **solo al paso dos**, así que lo que se registra es de verdad el del paso dos. El centinela va en `message`, `details` y `hint`, y la aserción es `not.toContain` sobre `JSON.stringify(mock.calls)`.
  - El caso «sin fila» de `candado.test.ts` discrimina: el texto fijo no contiene «sin fila».
- **B1-H6 (BAJA): cerrado.**
  - `listFactors` devuelve `f-1`, y `deleteFactor` queda expuesto y se exige `toHaveBeenCalledWith({ id: 'f-1', userId: 'u-1' })`.
  - En `sin_codigos` no se llama ni a `listFactors` ni a `deleteFactor`.
  - En `codigo_invalido` y `bloqueado`, `deleteFactor` no se llama.
- **B1-H2: fuera de la ronda, como se pidió.** `docs/state.md` no está en el diff.

## Lo que pediste comprobar «sobre todo»

1. **Los cuerpos de la sección h) son idénticos a los originales, salvo lo añadido.** Comparados línea a línea con `git show` de la rama:
   - **`bloquear_historia()`** contra `20260822160000:441-468`:
     - la firma, `volatile`, `security definer`, `set search_path = ''`, `declare`, el 42501 sin sesión, la CTE `revocados` y `return v_n` son idénticos;
     - lo único nuevo es el comentario y la `update` con predicado, colocada entre la CTE y el `return`;
     - el comentario de la función es el original más la frase de T-042.
   - **`fijar_pin_historia(text)`** contra `20260830090000:859-891`:
     - son idénticos el 42501 sin sesión, la guarda `segundo_factor_verificado_recientemente()` con su texto, el 22023 con `^[0-9]{6}$`, `gen_salt('bf', 12)` y `set search_path = ''`;
     - el `on conflict` gana solo `desbloqueos_autorizados = 0, autorizado_hasta = null`, y el alineado cambia;
     - el comentario es el original más la frase de T-042.
   - Ninguna migración posterior a `20260830090000` redefine ninguna de las dos: un `git grep` en la rama solo encuentra 20260822160000, 20260830090000 y la sección h).
   - `create or replace` conserva los grants de `20260822160000:513-520`.
2. **C4 y C5 no pueden salir verdes sin solape real.**
   - `conBloqueador` solo devuelve un resultado si `esperarHasta(… = 3)` dio `ok`. Si no, lanza `Parada`, que el `catch` exterior mete en `fallos`, y el proceso sale con 1.
   - El recuento excluye el sondeo (`pid <> pg_backend_pid()`). El texto del bloqueador no contiene el patrón (`comprobar_pin_historia` o `comprobar_codigo_recuperacion`), así que no se cuenta a sí mismo.
   - **Un punto débil, que no da verdes falsos.** «Retiene» se da por bueno al ver `idle in transaction`, y ese estado existe ya después de `begin;`, antes del `for update`. Si el sondeo cayera en ese hueco, la ráfaga podría adelantarse al bloqueador. Lo he recorrido para el código bueno y para M-H4, M-H5, M-H5a y M-H5b: en todos los casos salen menos de 3 peticiones en espera con el patrón, y por tanto «no concluyente» en rojo, nunca un verde. Las dos sentencias van en la misma escritura de stdin, así que el hueco es de microsegundos. No lo cuento como hallazgo.
3. **Ninguna prueba nueva sale verde por el motivo equivocado.**
   - CA-R2.2: las aserciones de `historia_desbloqueada()` saldrían verdes igual con M21, porque la ventana la revoca la CTE vieja. Pero las acompañan las de la fila (`0/0/false`) y la del paso dos (`pin_incorrecto`), que sí discriminan.
   - El paso 3 depende de que `fijar_pin_historia` no lance. Si lanzara, el banco aborta con ruido, no sale un verde.
   - En los TS, cada aserción nueva tiene su mutante en rojo, y he comprobado en el código que cae por el motivo que dice.
   - En el canje, «no vacía» filtra con `ocurrido_en = now()`, que en un banco de una sola transacción abarca todos los módulos. Basta con que haya filas del mismo disparador, y las hay.

## Comprobado sin hallazgo

- `bloquear_historia()` y `fijar_pin_historia` frente a una `comprobar_pin_historia` concurrente:
  - la `update` y el `on conflict` esperan el candado de fila del paso uno y vuelven a evaluar la fila (EvalPlanQual), así que la autorización que el paso uno deja se limpia igual;
  - si el paso uno llega después, es un intento legítimo nuevo.
- Las comillas del regex `'\$2[abxy]?\$'` funcionan con `standard_conforming_strings` y casan con `$2a$04$…`. psql no interpola ahí.
- El territorio:
  - `totp.ts` solo cambia dentro de `canjearCodigoRecuperacion`;
  - `totp.test.ts`, solo en el `describe` del canje;
  - `mutantes.json` y `oraculo-postgrest.json` quedan fuera del glob, como ya señala R2.9;
  - ni `docs/state.md` ni las secciones 0-9 del diseño están en el diff.
