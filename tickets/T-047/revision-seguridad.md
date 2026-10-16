**Sin hallazgos ALTA.** Revisión de seguridad, ronda 2, de T-047 sobre `3847b29`. Se revisa el delta
`47abe5f..3847b29`; la base del ticket es `main`, que desde el merge-base `91b4df3` solo ha ganado
tickets y diseños, ni código ni migraciones.

Resumen: los cuatro hallazgos de la ronda 1 (S-H1 a S-H4) quedan cerrados, y lo he comprobado
ejecutando, no leyendo el informe. La ronda no introduce problemas nuevos de seguridad. La migración
`20261017120000` no cambia en esta ronda.

## Hallazgos de la ronda 1

| Id | Estado | Cómo se comprobó |
|---|---|---|
| S-H1 · `tipos-bd.ts` editado a mano (MEDIA) | **Cerrado** | Con la base en `20261017120000`, se generó `npx supabase gen types typescript --local` a un fichero aparte y se comparó con el comiteado (sin contar los finales de línea). Son idénticos: `agenda_densidad_anual` ya va antes de `agenda_descartar_propuesta`. |
| S-H2 · A6 sin fragmento (BAJA) | **Cerrado** | A6 usa ahora `assert_lanza_codigo_msg` con el fragmento `function agenda_densidad_anual` / `function agenda_profesionales_anuales`. Medido en `begin … rollback`: con `grant execute … to anon` en las dos funciones, `anon` recibe `permission denied for function es_zona_iana`, que no contiene el fragmento, así que A6 cae. Al devolver el `revoke`, recibe `permission denied for function agenda_densidad_anual` y A6 pasa. |
| S-H3 · filtro de rol de la lista sin aserción (BAJA) | **Cerrado** | La fijación gana `C34TECB`: TEC1 figura como profesional de una cita de CB. `citas_lectura` (`20260906120000:691`) se la deja leer por `profesional_id = auth.uid()`, así que el escenario es real. Mutante medido (sin `rol_actual() in (…)` en la rama `citas` de `agenda_profesionales_anuales`): **MUERE** en `F7: TEC1 con p_centro_id = CB no recibe ningún profesional`. La gemela F7 (TEC1 sí se recibe con CA) demuestra que la sesión del técnico está viva y que el cero no sale de una sesión vacía. |
| S-H4 · `or centro_id is null` en la lista (BAJA) | **Cerrado** | La fijación gana PRO34S, cuya única cita (`C34SINPRO`) no tiene centro. Mutante medido: **MUERE** en `F1 ADM · CA: la lista = el oráculo`, antes de llegar a F6, que lo concreta. `tickets/T-047/mutantes.json` existe ahora en la rama y declara `supervivientes: []`. |

## Cómo se midió

Todo se ejecutó en una sola transacción `begin … rollback` sobre `supabase_db_Psicogestion`, sin
`db reset`. El guion: `00-ayudantes` + `01-fijacion` + la migración (`create or replace`, mutada o
no) + el banco 34. El año sintético se recortó a marzo y los bloques A–F se ejecutaron enteros. El
bloque G (volumen) se quitó.

| Ejecución | Salida | Primera aserción que cae |
|---|---|---|
| BASE | 0, verde hasta el final de F | — |
| S-H3 · lista sin filtro de rol | 3 | F7 (TEC1 · CB) |
| S-H4 · lista con `or v.centro_id is null` | 3 | F1 ADM · CA |

Los resultados coinciden con lo que declara `mutantes.json` para S-H3 y S-H4.

Al principio la base estaba ocupada: otra transacción del banco tenía tomadas las claves de la
fijación, y la medición base esperó unos 10 minutos. Hacia las 19:15 UTC alguien reinició el
contenedor y cortó una cuarta medición, un mutante sin `distinct` que no es de seguridad y no se
repitió. Las tres mediciones de la tabla terminaron antes del reinicio.

## Qué más se miró del delta (sin hallazgo)

- **Fijación nueva del banco 34.**
  - PRO34S lleva su propio id (prefijo `a3400001-`), un email único y `descanso_activo = false`.
  - Las dos citas nuevas no solapan con las de TEC1 ni con las de PRO34S.
  - El ancla del año se ha movido a la línea 45, y el README la cita bien (`34:45 → +9`).
    `fechas-fijas.mjs` pasa limpio.
- **Efecto sobre el banco 35**, que corre después en la misma transacción. Sus aserciones sobre TEC1
  van por id (`C351`, `C357`, `B35A`, `B35B`), así que `C34TECB` no las mueve.
- **`page.tsx`**: si la lista falla, `BloqueAnio` devuelve ahora `AvisoDeError`, con el mensaje de
  `mensajeParaMotivo` (`lib/citas/densidad.ts:21`). El texto del error de la base no llega al
  cliente. Las pruebas de teclado y la espera de la spec no tocan datos ni permisos.

## Nota (no es hallazgo)

La cabecera de `scripts/rls/34-agenda-anual.sql`, líneas 13-15, se ha quedado atrás:
- dice que TEC1 «solo aparece como profesional en una cita, C34TEC», pero ahora también en `C34TECB`;
- la lista de perfiles propios no menciona a PRO34S.

Ninguna aserción depende de esa frase, así que no hay escenario de fallo. Se puede corregir de paso
la próxima vez que se toque el fichero.
