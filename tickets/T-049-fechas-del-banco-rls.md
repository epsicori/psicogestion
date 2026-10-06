---
id: T-049
titulo: Banco de RLS sin fechas que caducan — anclajes relativos, franjas por módulo y lint de fechas fijas
modelo: sonnet
# medio: solo toca el banco de pruebas; sin migración, sin código de producto
riesgo: medio
fase: 1
# alta: mientras 15 cae, ningún ticket de riesgo alto puede cerrar «banco completo en verde»
prioridad: alta
depende_de: []
# contrato aprobado por el propietario el 06-10-2026; listo para diseño corto
estado: pendiente
# no: cada cambio toca una guarda del reloj y hay que razonar la colisión; ver §Delegable
delegable: no
# Notas por elemento (siempre en la línea anterior, nunca en la de la clave):
# - 15: el bloque de fechas fijas pasa a ancla relativa (§Decisión D1);
# - 17, 19, 26: solo la línea que define el ancla de sus citas y las inserciones que la usan (D2);
# - 01, 26, 27: solo comentarios `-- fecha-fija:` en la línea anterior a cada literal futuro (D3);
# - fechas-fijas.mjs: el lint nuevo (D4); README: regla 10 y tabla de franjas (D5).
territorio:
  - scripts/rls/15-agenda.sql
  - scripts/rls/17-vinculo-agenda.sql
  - scripts/rls/19-nota-en-episodio.sql
  - scripts/rls/26-economico.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/27-exportaciones.sql
  - scripts/rls/fechas-fijas.mjs
  - scripts/rls/README.md
  - docs/bitacora/T-049.md
---

# T-049 · Banco de RLS sin fechas que caducan

## Contexto

`npm run test:rls` concatena `scripts/rls/*.sql` en orden alfabético dentro de UNA transacción
(`begin … rollback`, `psql -v ON_ERROR_STOP=1`): `now()` es constante en todo el banco y el estado
de un módulo se filtra a los siguientes (README, punto 7). Desde el **06-10-2026 a las 10:50 de
Madrid** el módulo `15-agenda.sql` cae en la línea 492-497:

```
ASERCIÓN FALLIDA (lanzó 42501 en vez de 23P01): Mover una cita encima de otra por la funcion
CHOCA igual … Una cita pasada no se puede reprogramar ni reatribuir (constitución, regla 6)
```

`CITA1` está fijada a `2026-10-06 10:00–10:50+02`; al pasar su fin, `fn_proteger_cita_pasada`
(última definición en `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql`)
rechaza moverla con 42501 antes de que la restricción de exclusión pueda responder 23P01. Como
`ON_ERROR_STOP` corta en el primer fallo, **ningún módulo posterior a 15 corre**, y ningún ticket
de riesgo alto puede cerrar con el banco completo en verde (T-043 tiene su CA2 en FALLA por esto).

Comprobado (06-10-2026, en transacción con `rollback`): con las fechas de 15 desplazadas a
diciembre en memoria, el banco 00-28 de `main` termina con código 0. **El 18 no tiene fechas fijas**
(`grep -E "20[0-9]{2}-"` sobre él solo devuelve códigos `22023`): el hallazgo de `docs/state.md`
que dice lo contrario es inexacto.

El análisis encontró además tres **colisiones futuras calculadas** (no ejecutadas: no se puede
adelantar `now()`) entre anclajes relativos al día y anclajes relativos al año de otros módulos. Son
la misma clase de fallo («el banco se rompe por la fecha en que se ejecuta») y entran aquí.

## Inventario

### A · Literales que caducan por una comparación con el reloj

| Módulo · líneas | Literal | Qué lo compara con el reloj | Caduca |
|---|---|---|---|
| `15-agenda.sql` 101-108, 128, 138, 152, 167, 180, **492-497** | `2026-10-06` 10:00-12:05 `+02` (CITA1, CITA2, CITA3, negativas de solape) | `agenda_actualizar_cita` sobre CITA1 → `fn_proteger_cita_pasada` (`old.fin <= now()`) | **06-10-2026 10:50 Madrid (ya caducado)** |
| `15-agenda.sql` 115-120 | `2026-10-07` (inserción con `rango_bloqueante` a mano) | ninguna: 42501 por la guarda de columna, pasada o no | no caduca, se mueve con el bloque |
| `15-agenda.sql` 206-216 | `2026-10-08 09:00` (gemela del rango congelado) | ninguna (inserción directa, solo se lee el rango) | no caduca, se mueve con el bloque |

Es el único literal que caduca hoy por el camino actual del código. El bloque se mueve **entero**:
las negativas de solape (10:30, 10:55, 11:15) son relativas a CITA1.

### B · Anclajes relativos al día que barren el calendario de otro módulo (colisión calculada)

| Módulo · líneas | Ancla | Choca con | Primera fecha de ejecución en que cae (calculada) |
|---|---|---|---|
| `17-vinculo-agenda.sql` 25 (y sus 15 usos) | `current_date + 300`, PRO1/CA 09:00 (gemela positiva de l.46-51) y festivo PRO1 en `f29 + 30` | 16: citas PRO1/CA de 09:00 en `domingo_marzo(año+1) + 60/67/74/90/200` (`fecha_festivo`, `fecha_ocupada`, `fecha_festivo_l`) | **18-12-2026** (D+300 = 2027-10-14 = domingo_marzo+200, si la propuesta confirmada en l.596 queda a las 09:00); segura el **29-08-2027** (la cita manual `fecha_ocupada` 09:00 de l.236) |
| `26-economico.sql` 191-199 | `current_date + 1500..1502`, PRO1/CA y PRO2/CB 10:00-10:50 | 21: series PRO1/CA de 10:00 en `lunes_21 + 301/308/315/322` (año+3 → año+4) | **21-01-2027** (D+1500 = 2031-03-03); 14-01-2027 si la ocurrencia de `l294` llega a materializarse. Se repite cada enero-febrero |

Un ancla `current_date + k` con k grande recorre un año entero de calendario a lo largo del año: tarde
o temprano cae encima de un módulo anclado al año. Por eso la regla D5 los prohíbe más allá de la
banda corta.

### C · Literales futuros que no caducan por ningún camino actual (vigilar)

| Módulo · líneas | Literal | Por qué no caduca hoy | Pasa a ser pasado |
|---|---|---|---|
| `19-nota-en-episodio.sql` 96-99 | cita PD/PRO1/CA `2030-01-07 10:00+01` | 19 no la muta; `episodio_para_nota` solo la lee | 07-01-2030 |
| `19-nota-en-episodio.sql` 579-581 | cita PADM/PRO2/CB `2030-01-14` | ídem | 14-01-2030 |
| `26-economico.sql` 1439 | tarifa K13 `2027-01-01` como TEC1, espera 42501 | TEC1 no lee tarifas: `v_max` es nulo en `fn_alta_tarifa` y el 42501 es de permiso | 01-01-2027 (frágil si cambia el orden de las guardas) |
| `26-economico.sql` 182, 211, 604-642, 650, 1632 | caducidades de bono `2030-01-31`, `2031-12-31`, `2032-*`, `2033-*` | ninguna migración compara `caducidad` con `now()`, `current_date` ni con la fecha de la cita (grep) | 2030-2033 |
| `01-fijacion.sql` 251 | `CAD21` caducidad `2031-12-31` | ídem | 31-12-2031 |
| `27-exportaciones.sql` 102-128 | `creada_en 2029-03-01` de versiones, como `postgres` | el ±1 minuto de `fn_sellar_version_nota` (6.20) solo aplica a `authenticated` | 01-03-2029 |

Las dos citas de 19 se mueven (D2): son citas, la clase de dato que guarda el reloj. El resto se
anota (D3).

### D · Lo que no es problema

Los literales pasados (14: 179 × `2026-08-29` del vector congelado; 01, 20, 23, 28: notas y
borradores de 2026 como `postgres`; 02: `2020-01-01` intencionado; 26: `2025-01-01` en negativas de
permiso) no caducan: ya son pasado y se quedan. El 16, 18, 20, 21, 22, 23 y 24 no tienen literales
futuros.

## Mapa de franjas del banco (base de la regla de no colisión)

Año de referencia `Y = extract(year from now())`, día `D = current_date`.

| Módulo | Profesional/centro | Franja hoy | Franja tras T-049 |
|---|---|---|---|
| 15 | PRO1/CA (y PRO2/CB en `now()`) | 2026-10-06..08 fijo | **martes de D+14..D+20, y los dos días siguientes** |
| 16 | PRO1/CA, PRO2 | D−10..D+68 (puntual) · `domingo_marzo(Y+1) − 21` .. ~febrero Y+4 | sin cambio |
| 17 | PRO1/CA | D+300 (barre oct Y .. oct Y+1) | **Y+7** |
| 18 | PRO18 propio | `now()` ± 1 día | sin cambio |
| 19 | PRO1/CA, PRO2/CB | 2030-01-07 y 2030-01-14 fijos | **Y+8** |
| 20, 22 | PRO1/CA | pasado (D−45..D−1) | sin cambio |
| 21 | PRO1/CA, PRO2/CB | primer lunes de mayo Y+3 .. +350 (abril Y+4) | sin cambio |
| 23 | PRO1/CA | D−40..D+11 · primer lunes de mayo Y+4 .. +42 | sin cambio |
| 26 | PRO1/CA, PRO2/CB | D+1500..D+1502 (barre feb Y+4 .. feb Y+5) | **Y+6** |
| 29 (T-043) | PRO1/CA | primer lunes de febrero Y+4 .. +84 | primer lunes de febrero **Y+10** (T-043 ronda 2) |

Con T-049 el banco 00-28 deja de escribir agenda en Y+5 y más allá salvo en los años propios de
17, 19 y 26 (Y+6, Y+7, Y+8); el 29 queda solo en Y+10.

## Decisión

**D1 · El 15 se ancla a `current_date`, no a un año fijo lejano.**
`d15` = el martes que cae entre D+14 y D+20:
`(current_date + 14 + ((9 - extract(isodow from current_date + 14)::int) % 7))::date`.
Cada instante se escribe en hora local: `((:'d15'::date + n) + time 'HH:MM') at time zone 'Europe/Madrid'`
(`n` = 0, 1, 2 para el martes, el miércoles y el jueves de antes), nunca con desplazamiento `+02` escrito
a mano, porque la fecha relativa puede caer en horario de invierno. Las cadenas de `format(... %L ...)`
reciben el instante ya calculado con `\gset`.
Por qué: (1) es el patrón de la casa (16, 18, 21, 23 y 26 ya anclan relativo); (2) una cita en 2099
es un dato irreal: la primera guarda de horizonte que añada el producto («no se agenda a más de N
meses») la rompería igual que el reloj ha roto la de 2026; (3) D+14..D+22 no toca ninguna otra franja
de PRO1: el 16 usa D+3, D+10 y D+40 en adelante; el 23 llega a D+11; la franja anual más cercana (16)
empieza en `domingo_marzo(Y+1) − 21`, como pronto a ~60 días; (4) el martes fijo conserva el reparto
de días de la semana del bloque original y nunca cae en domingo de cambio de hora.
Descartado: año fijo 2099. No caduca ni se desplaza, pero choca con cualquier guarda de horizonte y
obliga a anotar como excepción cada línea del bloque.

**D2 · Ningún módulo ancla agenda a `current_date + k` con k > 30: lo largo va a un año propio.**
- 26: `CITA1..3` y `CITAP2` pasan a `primer lunes de junio de Y+6 + 0/1/2`, a las mismas horas.
- 17: `f29` pasa a `primer lunes de junio de Y+7`. Una sola línea: los 15 usos cuelgan de `f29`.
- 19: `CITA` y `CITA2` pasan a `primer lunes de enero de Y+8` y `+7`, a las mismas horas locales y
  escritas en hora local (D1).

Por qué: un ancla al día barre un año entero de calendario y colisiona por temporadas (§B); un ancla al
año ocupa siempre la misma franja. Los años propios Y+6..Y+8 quedan por encima del máximo de los demás
(febrero de Y+5 era el techo del 26, que desaparece con este cambio) y por debajo del Y+10 del 29.

**D3 · Los literales futuros que no son agenda se quedan y se anotan.** Se escribe
`-- fecha-fija: <motivo>` en la línea anterior a cada literal de §C que no se mueve. La anotación nunca
va en la misma línea si el literal está dentro de una cadena `$sql$`/`format`: ahí sería texto SQL.

**D4 · Lint anti-recurrencia: `scripts/rls/fechas-fijas.mjs`.**
- Recorre `scripts/rls/*.sql`, o los ficheros que se le pasen como argumentos.
- Busca literales `AAAA-MM-DD` con mes y día válidos y marca los que son **≥ hoy** (fecha de
  Europe/Madrid; con `--hoy AAAA-MM-DD` se puede fijar para probarlo).
- Un literal se acepta si su línea, o la anterior, contiene `fecha-fija:` seguido de un motivo no vacío.
- Sale con código 1 y lista `fichero:línea: fecha` si hay alguno sin anotar, y con 0 en otro caso.
- Node puro, sin dependencias (no se toca `package.json`).

Es monótono: un literal pasado nunca se vuelve rojo, así que el lint no puede caer solo con el paso de
los días; solo cae quien escribe una fecha futura sin justificarla.

**D5 · Regla de no colisión, verificable por grep (README, punto 10 y tabla de franjas).**
1. **Banda corta.** Un ancla al día de agenda (`now() ± interval`, `current_date ± k`) solo con
   |k| ≤ 30. Comprobación:
   `grep -nE "current_date *\+ *[0-9]{2,}|now\(\) *\+ *interval '([3-9][0-9]|[0-9]{3,}) days" scripts/rls/*.sql`.
   No debe devolver nada salvo 16 (C7, D+40..D+68, citas de su propia serie S7) y `current_date + 14`
   de 15, ambos en la tabla.
2. **Año propio.** Cada ancla al año usa un desplazamiento declarado en la tabla del README:
   16 → +1; 21 → +3; 23 → +4; 26 → +6; 17 → +7; 19 → +8; 29 → +10.
   Comprobación: `grep -noE "extract\(year from (now\(\)|current_date)\)(::int)? *\+ *[0-9]+" scripts/rls/*.sql`.
   La salida debe coincidir con la tabla, módulo por módulo.
3. **Literal futuro de agenda: prohibido** (D4 lo caza; la anotación `fecha-fija:` no vale para citas,
   series, ausencias ni festivos, y así lo dice el README).

Solape ya existente y conocido, que queda fuera: 16 (hasta ~febrero de Y+4) y 21 (mayo Y+3 a abril Y+4)
comparten calendario. Coinciden un lunes (`lunes_21 + 259`) en 2026-2028 y en verde; dejan de coincidir
en 2029-2031. Va a `docs/state.md` como hallazgo (§Lo que no entra).

## Tareas

1. **Precondición: base limpia.** La base local compartida quedó con filas del banco confirmadas por
   una simulación fallida del análisis de este contrato (ver Notas). `npx supabase db reset` desde el
   árbol de T-049 (migraciones de `main`; `max(version)` = `20261011140000`), luego `npm run seed`.
2. **15:** sustituir los literales de las líneas 101-216 y 492-497 por `d15` (D1). No cambia ningún
   mensaje, código esperado ni número de aserciones.
3. **26, 17, 19:** mover las anclas (D2), una línea de ancla y las inserciones que la usan.
4. **01, 26, 27:** anotar `-- fecha-fija:` los literales de §C que se quedan (D3).
5. **`scripts/rls/fechas-fijas.mjs`** (D4).
6. **README:** punto 10, con la regla D5 y la tabla de franjas; corregir en el punto 5 que «no dependas
   del reloj» incluye «no escribas una fecha futura literal».
7. **Bitácora** `docs/bitacora/T-049.md`: el inventario, las fechas calculadas de §B y el solape 16/21.

## Criterios de aceptación (verificables)

- **CA1 · 15 sin literales.**
  `grep -cE "\b20[0-9]{2}-[01][0-9]-[0-3][0-9]\b" scripts/rls/15-agenda.sql` → `0`.
- **CA2 · 15 sigue probando lo mismo.** Esta comparación, en `main` y en la rama, da salidas idénticas:
  `grep -oE "assert[a-z_]*\(|'(23P01|42501|23514|22023)'" scripts/rls/15-agenda.sql | sort | uniq -c`
- **CA3 · La gemela del motivo correcto.** En una copia temporal (fuera del árbol) de la rama, con `d15`
  forzado a `current_date - 7`, el banco 00-15 cae en la aserción de la antigua l.494 con
  «lanzó 42501 en vez de 23P01 … Una cita pasada». Con `d15` sin tocar, pasa. Demuestra que lo que la
  hace verde es que CITA1 sea futura, y no otra cosa.
- **CA4 · Banco completo en verde.** Tras la Tarea 1, `npm run test:rls` sale con código `0`. La línea
  `Módulos (N)` cuenta lo mismo que `ls scripts/rls/*.sql | wc -l`, y la salida incluye el último aviso
  del último módulo (`28-…`). Se ejecuta en la rama de T-049 (= `main` + T-049), sin el 29.
- **CA5 · Lint en verde sobre el árbol.** `node scripts/rls/fechas-fijas.mjs` → código `0`.
- **CA6 · El lint caza el caso real.**
  `git show main:scripts/rls/15-agenda.sql > "$TMP/15.sql" && node scripts/rls/fechas-fijas.mjs --hoy 2026-10-01 "$TMP/15.sql"`
  → código `1`, y lista las líneas 104, 107, 108, 117, 118, 128, 138, 152, 167, 180, 209, 212, 213,
  215 y 496.
- **CA7 · La anotación exige motivo.** Un fichero temporal con
  `-- fecha-fija:` vacío seguido de `date '2099-01-01'` → código `1`. Con `-- fecha-fija: prueba` → `0`.
  Y `--hoy 2026-01-01` sobre `14-cadena-huellas.sql` → código `1`, porque `2026-08-29` es futuro para
  esa fecha: el umbral es la fecha y no el texto.
- **CA8 · Regla de no colisión.** Las dos órdenes de grep de D5 devuelven exactamente lo que dice la
  tabla del README. En particular, `current_date + 1500` y `current_date + 300` ya no aparecen.
- **CA9 · Territorio.** `node ~/.claude/pipeline/territorio.mjs T-049` sale en verde.
  `git diff main --stat -- scripts/rls/18-agenda-rango.sql scripts/rls/21-alta-de-cita.sql scripts/test-rls.mjs package.json`
  sale vacío.
- **CA10 · Lint del proyecto.** `npm run lint` sale con código `0` (el `.mjs` nuevo entra en ESLint).

## Guion de comprobación manual

Leer el diff de 15 junto a la salida de CA3. Cada negativa conserva su código y su mensaje, y
`CITA1` es futura por construcción, no por casualidad del día de ejecución.

## Dependencias y orden con T-043

- **T-049 se fusiona antes que T-043.** T-043 (ronda 2) añade `29-hueco-raro.sql` y amplía el README.
  Su CA2 («banco completo en verde») no puede cerrarse mientras 15 caiga.
- T-043 rebasa sobre T-049 y ancla el 29 en el primer lunes de febrero de **Y+10**, como ya decidió su
  ronda 2. Fuera de toda franja de la tabla, con o sin T-049. Añade su fila (29 → +10) a la tabla del
  README y pasa el lint de D4.
- Conflicto previsible: solo `scripts/rls/README.md`, que tocan los dos, y en secciones distintas.
  Se resuelve conservando ambas.
- La base: la verificación de T-049 resetea desde `main` y **quita la migración `20261012120000` de
  T-043**. El verificador de T-043 debe resetear desde su árbol después (memoria «migración de rama
  antes de verificar»).

## Delegable

No. El lint (D4) es una función pura, pero va acoplado a la regla D5 y a CA6-CA7. Cada movimiento de
ancla exige razonar la colisión. Sin parte de pintura.

## Preguntas abiertas al propietario

1. **¿Engancho el lint a `npm run test:rls`?** Hoy queda fuera del territorio: habría que tocar
   `scripts/test-rls.mjs` o `package.json`. **Recomendación: sí**, ampliando el territorio solo con
   `scripts/test-rls.mjs`. Ejecutaría `fechas-fijas.mjs` antes de `psql` y cortaría con su código. Si
   no, el lint solo protege a quien se acuerde de lanzarlo.
2. **¿Entran 17, 19 y 26 en este ticket o en uno aparte?** **Recomendación: entran.** Son tres líneas
   de ancla y la misma clase de fallo. Sin ellas, «banco verde» dura hasta el 18-12-2026 o el
   21-01-2027 (calculado, §B).
3. **¿Puede T-049 reescribir `docs/state.md`?** Hay que corregir el hallazgo del 18 y anotar el solape
   16/21, y la constitución (regla 4) pide dejar `state.md` al día. **Recomendación: sí**, añadiéndolo
   al territorio; si no, lo hace el orquestador al cerrar.

## Lo que no entra

- El solape de calendario 16/21 (`lunes_21 + 259`). Es estable y verde en 2026-2028; su
  comportamiento cambia en 2029. Va a hallazgo, para un ticket propio.
- La colisión interna del 16: C7 (D+40..D+68 a la hora de `now()`) frente a la serie de 12:00 de
  `desde_8_martes`, solo si el banco se ejecuta un jueves hacia mediodía en enero-febrero. Es interna
  del 16; va a hallazgo.
- Simular el reloj: `now()` no se puede adelantar en Postgres sin tocar las guardas. Las fechas de §B
  están calculadas, no ejecutadas.
- Cambiar los literales pasados del 14 (vector congelado), del 01, del 20, del 23 y del 28.

## Notas para el agente

- **La base local está contaminada.** Una simulación del análisis de este contrato perdió su
  `begin` y confirmó en autocommit un pase entero del banco más uno parcial: usuarios `@rls.test`,
  citas y ~1 750 filas de auditoría. Hasta el `db reset` de la Tarea 1, `test:rls` cae por claves
  duplicadas en 01. No es un fallo de T-049.
- Para saber qué hace hoy una guarda, busca su última redefinición:
  `grep -ln fn_proteger_cita_pasada supabase/migrations/*.sql | tail -1`.
- Las anclas nuevas de D2 se calculan con `make_date(extract(year from now())::int + k, mes, 1)` más el
  ajuste al primer lunes, igual que `lunes_39` en `23-cita-en-episodio.sql:195`.
- 15 deja `descanso_minutos = 20` en PRO1 para los módulos siguientes. Las horas de D2 no cambian, así
  que los rangos tampoco.
