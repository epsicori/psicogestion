Sin hallazgos ALTA. 0 ALTA · 0 MEDIA · 0 BAJA. Es la revisión final de la ronda de arreglos, diff `53b1062..63c8f9c`, y se contrasta con el diff total `main...T-034-nota-en-episodio`.

# T-034 · Revisión final (pasada sobre `63c8f9c`)

- **Rama:** `T-034-nota-en-episodio`, en el worktree `.claude/worktrees/agent-aa7e60701b8cda7c0`.
- **Leído:**
  - el contrato `tickets/T-034-toda-nota-en-un-episodio.md`;
  - `diseno.md` §1, §5 y la enmienda E;
  - `revision-sql.md` y `revision-banco.md`;
  - el diff de la ronda entero (migración, banco 19, README y `architecture.md`);
  - el contexto de las políticas `episodios_*`, `notas_clinicas_alta` y `citas_lectura`.
- **No leído:** ni `evidencia.json` ni el informe del verificador.
- **Base de datos:** no la he tocado. `npm run lint:migraciones` en el worktree da 17 migraciones limpias.
- **Territorio:** los cuatro ficheros de la ronda están en el `territorio:` del ticket.
- **Contrato y diseño:** la rama no modifica ni el contrato ni el diseño.

## Las correcciones de la ronda anterior

| Hallazgo | Arreglo | ¿Hay prueba que falle sin él? |
|---|---|---|
| SQL-H1 (MEDIA): episodio y participante leídos sin cerrojo | `for share` en el paso 3 (`…nota_siempre_en_episodio.sql:77-81`) y `perform … for share` en el paso 5 (`:97-105`). Las cuatro carreras del hallazgo quedan cerradas: cambio de paciente o de profesional del episodio, cierre, y `update`/`delete` del participante. Si la puerta llega primero, la nota espera y relee la fila nueva. Si llega primero la nota, la puerta espera y su `exists` ve la nota confirmada. | Sí, en el catálogo: 19.48 (`19-nota-en-episodio.sql:584-596`) busca con dos expresiones regulares el texto exacto de cada lectura. Si se quita cualquiera de los dos `for share`, se pone en rojo. La carrera en sí no se puede probar en un banco de una sola sesión. |
| SQL-H2 (MEDIA): D6 se esquiva reabriendo el episodio | Fuera del alcance (E.9: cerrar episodios no es de T-034). | No aplica. **Va a state.md**: reabrir o cambiar `cerrado_en` necesita su propia regla en el ticket que cierre episodios. Esa regla también mueve el reloj de ADR-033. |
| SQL-H3 (BAJA): `centro_id` del episodio sigue mutable con notas | No se ha arreglado, y la rama tampoco deja escrito que se acepte. | No aplica. **Va a state.md**: hay que decidir entre añadir `centro_id` a `congelar_episodio_con_notas` o aceptarlo por escrito, antes de que T-012c selle el coprofesional en el sobre. |
| SQL-H4 (BAJA): el coprofesional exige `rol = 'profesional_sanitario'` | Lo decide el propietario (E.8, P2). | No aplica. **Va a state.md** con el escenario: ADM con coprofesional PRO1 entra, PRO1 con coprofesional ADM da 23514. |
| SQL-H5 / banco-H2 (BAJA/MEDIA): la salida anti-oráculo del paso 2 no tiene prueba | 19.49 (`:599-623`), con tres filas. Cada una está construida para que el disparador, si corriera, diera un 23514 distinto: «no son del mismo paciente» (PA en ES), «profesional sanitario» (TEC1) y «episodio cerrado» (ESC). | Sí. Se exige 42501 con el texto «row-level security». Sin las líneas 68-70, las tres reciben 23514 antes del WITH CHECK de `notas_clinicas_alta` (`autor_id = auth.uid()`). |
| banco-H1 (MEDIA): orden de guardas frente a un episodio ajeno | 19.50 (`:626-641`) prueba tres combinaciones de dos defectos: ajeno con otro paciente, ajeno cerrado, y ajeno cerrado con otro paciente. 19.51 (`:644-650`) elige el cerrado de PRO2 en `episodio_para_nota`. | Sí. Si se adelanta el paso 5 o el 6 al 4, el mensaje cambia y la aserción de fragmento cae. Para la 19.51, PRO1 lee ESC por `episodios_lectura` (es asignado de PS). Una función reordenada lo encontraría y daría 22023, y la prueba exige 42501 «no vale». |
| banco-H3 (MEDIA): cada puerta congelada se probaba por una sola columna | 19.52 (`:654-681`): `profesional_id` del episodio y `episodio_id` del participante, como postgres. Cada una con su gemela sin notas (r10, PJ5) y su control previo. | Sí. Si se quita la columna del `update of` o del `when`/retorno temprano, el update pasa y la aserción cae. |
| banco-H4 (BAJA): alta cerrada del coprofesional y rama que no revalida | 19.55 (`:731-770`). El control comprueba que la fila existe y está cerrada, distinto de «sin fila». Después: insert rechazado, cambio de paciente que pasa, y quitar y volver a poner al coprofesional, que se rechaza. | Sí. Sin `and pc.hasta is null`, el insert de PK/ECO/PRO2 pasa. Si el paso 7 revalidara siempre, el cambio de paciente caería. `hasta is null` es la definición de vigente del esquema (`20260829120000…:60`, con `check hasta <= current_date`), así que no hay ambigüedad con un alta futura. |
| banco-H5 (BAJA): la fecha de apertura no discriminaba | 19.53 (`:684-705`) usa Kiritimati (UTC+14) y Pago Pago (UTC-11), sin horario de verano, con una aserción de control. | Sí, a cualquier hora. Con `current_date` en la función, al menos una de las dos cae. También cae si la función usara la zona del centro del paciente (CA, Madrid): la pareja sigue discriminando. |
| banco-H6 (BAJA): el filtro `c.profesional_id = v_uid` no tenía negativa | 19.54 (`:708-728`): ADM es asignado de PADM, LEE la cita de PRO2 (lo comprueba un control) y se le pide 42501 con su fragmento. Después se comprueba que no se abrió ningún episodio. | Sí. Sin el filtro, la función toma CB de la cita, se salta `centros_actuales()` y `episodios_alta` la deja insertar (profesional = uid, asignado). No lanza nada y la aserción cae. |
| banco-H7 (BAJA): a `architecture.md` le faltaba la regla del centro y el «mover» | `architecture.md:262-264` y `:358-369`: el centro sale de la cita o del `p_centro_id` que pasa la aplicación, y sin ninguno de los dos da 22023. Además, «ninguna nota se mueve a uno cerrado». | No lleva prueba (es documentación). El texto coincide con la función (`:351-371`) y con la 19.44. |

## Bugs nuevos introducidos por la ronda

No he encontrado ninguno con un escenario de fallo concreto. Revisé:

- **Los cerrojos nuevos.** Las notas concurrentes del mismo episodio (`t005`, coterapia) toman `for share` las dos, que es compatible. Ninguna función del esquema hace `update` de `episodios_asistenciales` ni de `episodio_participantes` en la misma transacción que escribe una nota, así que no hay un orden de cerrojos que dé 40P01 hoy. El dueño de la función definer es el de las tablas, y no hay `revoke` sobre ellas ni `force row level security`.
- **El paso 5 reescrito con `perform` + `found`.** Es equivalente al `not exists` anterior en una sola sesión. Bloquea todas las filas del participante (baja y realta).
- **El estado que dejan las fijaciones nuevas.** Las fijaciones son ESC, CKI/CPP, PZ1/PZ2, PADM y CITA2. Los cambios son el traslado de r10 a PRO2, el de PJ5 a EB1, la nueva alta de PRO1 en CKI/CPP y el cierre del alta de PRO2 en CA. 19 es el último módulo y 19.55 la última prueba, así que nada posterior hereda ese estado.

## Observaciones sin hallazgo (no cuentan)

- **19.51 discrimina porque PRO1 lee ESC por `es_profesional_asignado(PS)`, y no lleva control de esa visibilidad.** Si un día `episodios_lectura` dejara de mostrar a un asignado los episodios de un compañero, una función reordenada daría «no encontrado» y la prueba seguiría verde. Hoy discrimina. Una línea `contar(select … where id = ESC) = 1` antes del `assert` la blindaría.
- **El atajo del paso 2 sigue suponiendo que «la RLS lo rechaza después».** Es la observación de revision-sql. Hay que tenerla en cuenta en T-012 y en el importador si una función definer escribe notas de otro autor.

## Para state.md al cerrar (no son fallo de este ticket)

1. **SQL-H2:** reabrir un episodio (`cerrado_en = null`) esquiva D6 y mueve el reloj de retención. Es regla del ticket que cierre episodios.
2. **SQL-H3:** `centro_id` del episodio mutable con notas. Decidir entre congelarlo o aceptarlo por escrito antes de T-012c.
3. **SQL-H4:** coprofesional administrador-psicólogo. Pregunta al propietario con el escenario simétrico ADM/PRO1.
4. **De revision-banco, «fuera de hallazgos»:** `scripts/t001-esquema.sql` y `scripts/t002-rls.sql` siguen insertando notas sin episodio. Falta además la nota sobre el texto de `centros_actuales()`.
