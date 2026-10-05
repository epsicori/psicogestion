**Sin hallazgos ALTA en la ronda 2 (revisor B): esta revisión no bloquea el gate.** Recuento: 0 ALTA · 1 MEDIA · 2 BAJA.

# T-021 · Revisión B, ronda 2 (corrección de datos y pruebas)

Diff revisado: `git diff main...worktree-agent-a19ecdb63f2c1e386` (HEAD a982e0a, 12 ficheros, +3535 −3).

Base medida: `supabase_db_Psicogestion`, con `max(version) = 20261011120000` y la definición de la ronda 2 aplicada (`tarifas_paciente.orden` existe, `vigente_hasta` no, `fn_bono_de_la_cita` lleva la congelación y el sellado lleva el 6.2.bis).

Método de medida:
- todo como postgres, dentro de `begin … rollback` y con `ON_ERROR_ROLLBACK on`;
- se cargaron `00-ayudantes.sql` y `01-fijacion.sql` del worktree;
- no hubo `db reset` ni escritura fuera de la transacción.

No he leído `evidencia.json` ni el informe del verificador.

## Cierre de la ronda 1, medido

| Ronda 1 | Decisión del diseño | Medido ahora | Estado |
|---|---|---|---|
| **B-H1** (ALTA, regla 6) | Solo añadir | Las tres medidas, abajo de la tabla | Cerrado |
| **B-H2** (tarifa hacia atrás + `creada_en`) | Guarda «no antes de hoy» + grant por columna | La tarifa de P1 que sustituye desde 2026-02-01, como ADM, da 23514 «no puede empezar antes de hoy». Desde hoy, en la zona de CA, entra, y la vista cierra la anterior en hoy. Con `creada_en`, «permission denied for table tarifas_paciente» | Cerrado |
| **B-H3** (cabecera a nombre de otro) | Paso 0 + grant | PRO1 con `creado_por = ADM` da 42501 «No puedes abrir este borrador». Con `creado_en` da «permission denied» | Cerrado |
| **B-H4** (M6a no equivalente) | B9b con control | B9b.0 (control), B9b y B9c, en el bloque con los cerrojos levantados. M6a muerto en `mutantes.json` | Cerrado |
| **B-H5** (tipo/cuota frente a régimen) | Tipo según régimen + cuota ≠ 0 con generales | S2 (exenta al 21 %) da 23514 «exento_sanitario lleva tipo 0». S3 (general con cuota 0) da 23514 «no puede ser 0» | Cerrado; queda un residuo (H2) |
| **B-H6** (signo) | `signo_ck` | S4 (−50 / 150 / 100) da 23514 `borradores_factura_versiones_signo_ck` | Cerrado |
| **B-H7** (sellos de tiempo del llamante) | Grant por columna | TEC1 con `cobros.registrado_en` da «permission denied for table cobros». L5 y L5b cubren `numero`, `registrada_en`, `creado_en` y `orden` | Cerrado |
| **B-H8** (`centro_id` libre) | 6.2.bis | S6 (BORR1 con CB, PRO1 sin CB) da 23514 «no es del paciente ni del profesional». J41, J41p y J41q discriminan las dos ramas con CE26. Sin filtrar por `hasta`, a propósito (comentario L438-440) | Cerrado |
| **B-H9** (concurrencia) | Aceptado, anotado en `state.md` | La línea está en el diff de `state.md`. M29 sobrevive, como se espera | Aceptado |
| **B-H10** (blancos no espacio) | Expresión regular | El concepto `E'\t'` da 23514; también `E' '` y el `E'\t\n'` de J28b con su control J28b.0. Queda un residuo (H3) | Cerrado; queda un residuo (H3) |

Las tres medidas de B-H1:
- **Bono.** PRO1 sobre la cita realizada con bono: `bono_id = null` da 42501, con el fragmento «realizada o pasada».
- **Caducidad.** `update bonos set caducidad` da «permission denied» como ADM, y 42501 «La tabla bonos es de solo adición» como postgres. La caducidad nueva es una fila en `bonos_caducidades`, y `bonos_consumo` enseña la última.
- **Tarifa.** No hay `vigente_hasta`, y `update tarifas_paciente` da «permission denied».

**Fuera de esta tabla, sin reabrir:**
- Pasar una cita realizada a cancelada baja el consumo. El contrato lo pide literalmente («Cancelar una de las tres la baja a 2»), y la decisión del propietario habla de `bono_id`. Está en `state.md`.
- El camino en dos sentencias sobre una cita futura realizada está en «Lo que no entra».

---

## MEDIA

### H1 · `supabase/migrations/20261011120000_economico_esquema.sql:259`: la congelación por `old.fin <= now()` bloquea también la PRIMERA asignación `null → bono`, para todo rol: una sesión ya terminada no puede descontar nunca de un bono

**Qué pasa.** La guarda dispara con `old.bono_id is distinct from new.bono_id`. Eso incluye `old.bono_id is null`.

**Por qué no hay salida:**
- Para `authenticated`, la única puerta para poner `bono_id` es ese UPDATE. El INSERT de `citas` está denegado (medido: «permission denied for table citas»), y L3 confirma que no hay grant de insert sobre `bono_id`.
- La guarda vale también para postgres, como pide el diseño.
- Así que, una vez terminada la cita, no hay ningún rol ni ningún camino que la enlace al bono.

**Escenario, medido:**
1. La cita de P1 terminó hace 2 horas, sigue `programada` y no tiene bono. Al acabar la sesión, el paciente compra el bono de 5 sesiones que incluye esa.
2. ADM `update citas set bono_id = BONO21` da 42501 «realizada o pasada ya no se cambia de bono».
3. PRO1 con `set estado = 'realizada', bono_id = BONO21` en la misma sentencia da el mismo 42501.
4. PRO1 la marca realizada (pasa) y después asigna el bono: 42501.
5. postgres: 42501.

**Efecto:**
- `bonos_consumo` nunca cuenta esa sesión, y el paciente recibe 6 sesiones por 5.
- Lo mismo pasa en el caso diario: la recepción olvida marcar el bono antes de la sesión, y el profesional marca «realizada» al terminar. El flujo normal es marcarla después de `fin`, que es justo cuando ya está congelada.
- No se pierde nada, pero es un estado sin salida y no se puede corregir sin migración.

**Lo que el diseño cubre y lo que no:**
- El diseño razona X→null y X→Y («el consumo de un bono pagado no se reescribe»).
- `null → X` no reescribe ningún consumo existente: añade uno, que es lo que la decisión «solo añadir» permite.
- No aparece en «Lo que no entra», y ninguna prueba lo ejerce: K14, K15 y K17 parten de citas con bono, y K16 es una cita futura.

**Arreglo posible, que decide el propietario.** Congelar solo si `old.bono_id is not null`. La primera asignación seguiría permitida en una cita pasada o realizada; después, ya no se movería. Necesita una positiva (`null → bono` sobre CITAPAS sin bono) y que K14 y K17 sigan muertos con M7.

---

## BAJA

### H2 · `supabase/migrations/20261011120000_economico_esquema.sql:599`: la cuota solo se comprueba como «cero / no cero»; puede superar lo que suman las líneas generales y entra en la cadena sellada

**Qué pasa.** El 6.4 exige tres cosas: suma = total, todo exento ⇒ cuota 0, y `v_suma_general <> 0` ⇒ cuota ≠ 0. No acota la cuota frente a la parte general. Tampoco acota `tipo_iva_centesimas` por arriba (L554-561).

**Escenarios, medidos como postgres sobre BORR1** (todos se sellan, y `verificar_cadena_borrador` da 0 fallos):

| Sobre | Líneas | Base / cuota / total | Problema |
|---|---|---|---|
| v4 | exenta 100 € + general 1 € al 21 % | 51 / 50 / 101 | 50 € de IVA sobre 1 € de base imponible |
| v5 | una general de 100 € al 21 % | 0 / 100 / 100 | Todo el importe es IVA |
| v6 | exenta 60 € + general +100 € + general −100 € | 50 / 10 / 60 | Cuota de 10 € con parte general neta 0, porque `v_suma_general = 0` desactiva la tercera comprobación |
| v7 | general con `tipo_iva_centesimas = 999900` (9999 %) | — | Tipo imposible |

**Por qué no es «repetir el redondeo»** (exclusión del diseño, L2130-2132):
- `0 ≤ cuota·signo ≤ |suma_general|/100` es una cota de categoría, como el «tipo según régimen». Ningún redondeo produce una cuota mayor que la base que grava.
- El sobre de solo adición quedaría así para siempre, y T-026 lo enviaría tal cual.

**Arreglo.** En 6.4: `abs(cuota)·100 <= abs(v_suma_general)` y `v_suma_general = 0 ⇒ cuota = 0`. En las líneas, `tipo_iva_centesimas <= 10000`. Son tres negativas y su gemela B2.

### H3 · `supabase/migrations/20261011120000_economico_esquema.sql:513`: `!~ '[^[:space:]]'` no ve los blancos de anchura cero; un concepto invisible se sella

**Escenario, medido.** Una línea con `concepto = E'​'` (espacio de anchura cero) se sella; el sello sale `SELLA` en BORR1. El tabulador y U+00A0 sí se rechazan. Pasa lo mismo con U+FEFF, que entra al pegar desde un procesador de textos.

**Efecto.** El borrador, y después el espejo de T-026, lleva una línea cuyo concepto se pinta vacío, que es justo lo que la guarda de B-H10 quería impedir.

El arreglo de la ronda 1 lo propuse yo (`\S`), y tiene el mismo hueco.

**Arreglo.** Quitar `[[:space:]​-‍⁠﻿]` antes de comprobar el vacío, con una negativa J28c.

---

## Banco 26, lo que mira la tarea

- **Negativas por permiso de columna frente a RLS.** Fallan por el motivo correcto:
  - A16, C8, K6, K12, K12b y N2 comprueban el fragmento «permission denied for table X»;
  - M3-M6 comprueban «row-level security». He comprobado que los disparadores invoker previos no lanzan antes: con TEC1, `fn_alta_tarifa` ve `v_max` nulo y `fn_numerar_caducidad_bono` numera 1, así que lanza la RLS.
- **Paso 0 con fragmento único.** I8-I13, M7 y N1/N7 llevan el sobre coherente donde importa (I8, M7).
- **B9b.** Tiene su control B9b.0 y su restauración B9c, y discrimina M6a.
- **J41.** Corre con CE26 como postgres, y la precondición de que PRO1 no está en CE26 se establece en la fijación:
  - J41p ejerce la rama del paciente;
  - J41q, tras el `insert into perfiles_centros`, ejerce la del profesional;
  - la limpieza cierra con `hasta = current_date`.
- **J42 / J42g.** J42 cae por `signo_ck` y no por el 6.4, porque 100 = 100 y la cuota ≠ 0. J42g es la gemela negativa coherente.
- **Tarifas.**
  - K3, K5b y K10b llevan el fragmento único y parten de una fila previa del par.
  - K5c fija «hoy entra».
  - K4b y K5a prueban `lead()` con desempate por `orden`, el mismo día incluido.
- **Congelación.** K14 discrimina la rama «pasada» y K15 la rama «realizada». K17 la prueba como postgres, y K18 comprueba que el consumo no cambió. Ninguna ejerce `null → bono` en una cita pasada (H1).

## Mutantes

- **M29 sobrevive.** Es correcto y está aceptado (B-H9). Sin cerrojo, la carrera muere en 23505 por `unique (paciente_id, tipo_terapia_id, orden)` o `unique (bono_id, numero)`; nunca hay datos corruptos.
- **M30 es equivalente de verdad**, por redundancia y no por casualidad:
  - el paso 0 de `fn_sellar_version_borrador()` exige el mismo rol en positivo y corre antes que el `with check` para cualquier `authenticated`;
  - un llamante definer conserva `role = authenticated`, así que el disparador sigue siendo más estricto;
  - `anon` no tiene grant.
  
  El coste: la condición de rol de la política no tiene prueba propia. Si alguien relaja el paso 0, el banco lo verá por I12 y M7 (fragmento del paso 0), no por la política.
- **Deadlocks de M11 y M29.** La primera pasada dio un deadlock (`disable trigger` frente a la recarga del esquema de PostgREST), y los dos se repitieron aislados. Es correcto: un deadlock no cuenta como muerte. La bitácora lo deja escrito.
- **M14** muere en G9, por 23514 en lugar de 42501, y no en N1. Vale: el `resultado` registra la aserción real.

## Linter y tipos

- **`scripts/lint-migraciones.ts`** y su prueba añaden `borradores_factura_versiones`, `cobros`, `tarifas_paciente`, `bonos` y `bonos_caducidades`. `bonos` va en el linter y no en `tablas_solo_adicion`, como pide el diseño (capas 2 y 3; L8 y L8b).
- **`lib/supabase/tipos-bd.ts`** es salida generada y coherente:
  - `bonos_caducidades` (con `numero` y `registrada_en`), `tarifas_paciente.orden`, la vista `tarifas_paciente_vigencias` con `vigente_hasta`, y `bonos_consumo.caducidad`;
  - no hay `vigente_hasta` en la tabla.
  
  `numero` y `orden` salen obligatorios en `Insert` aunque el grant los prohíbe. Es el mismo precedente que `huella` y `numero_version` en `notas_clinicas_versiones`, así que no es un hallazgo.

## Descartados tras mirar

- **Sustituir la tarifa el mismo día** (K5c). La deja el diseño a propósito, y `creada_en` es del sistema.
- **6.2.bis sin filtrar por `hasta`.** Decisión escrita en el comentario: un borrador puede cubrir sesiones de una pertenencia cerrada.
- **Bono de un paciente fusionado usado en las citas del superviviente** (23514). La fusión todavía no tiene función que mueva nada, así que el escenario pide un flujo que no existe.
- **La última fila de `bonos_caducidades` con `caducidad` nula deja el bono sin caducidad.** Es la forma explícita de quitarla; la columna admite nulo a propósito.
