**Sin hallazgos ALTA.** T-021 ronda 4, revisor A (corrección y constitución): 0 ALTA · 0 MEDIA · 3 BAJA.

Diff: `git diff 58cd9a1 worktree-agent-a8507d244f215480d` (HEAD 379a233). Ficheros revisados: `supabase/migrations/20261011140000_economico_ronda_4.sql`, `scripts/rls/26-economico.sql`, `scripts/rls/README.md`, `tickets/T-021/mutantes.json`, `docs/state.md` y `docs/bitacora/T-021.md`.

Método: las mediciones se hicieron sobre la base compartida (`supabase_db_Psicogestion`, `max(version)` = 20261011140000). En cada una se ejecutó `begin` + 00 + 01 + 26 del worktree + sondas + `rollback`, y al terminar quedaban 0 filas en `borradores_factura_versiones`. Sin mutar, el banco sale con exit 0, 399 OK, 34 J28h y 67 J28i.

## R4.5 · Qué revisar, punto por punto

| # | Punto | Resultado |
|---|---|---|
| 1 | `v_hay_general` abre la banda, no `T > 0` | Correcto (`:100`). J50f lo fija. |
| 2 | `abs` dentro de `least` | Correcto (`:95`). J52g lo fija. |
| 3 | La cantidad dentro de `Q_i` y de `least` | Correcto (`:92-95`). J53g lo fija. |
| 4 | Comparación `>` y no `>=` | Correcto (`:100`). J50fg lo fija: con diferencia 0 y T 0, `>=` la rechaza. |
| 5 | Mensajes y código | Idénticos a los de la ronda 3, con 23514. |
| 6 | Sin barras invertidas ni caracteres crudos | Correcto. En la migración, 0 barras y 0 crudos. En el banco, 0 crudos (contados con `\p{DI}\p{Cf}\p{Mn}\p{Cc}\p{White_Space}` y U+2800), y las únicas barras invertidas añadidas son los dos `\gexec`. J28e solo cambia el rótulo. |
| 7 | Solo `create or replace`, `revoke` y `comment` | Correcto. Los cinco disparadores siguen iguales y en el mismo orden por nombre (`sellar_version_borrador` < `sellar_version_borrador_cotas`), según `pg_trigger`. La función es invoker, con `search_path=""` y ACL `{postgres=X}`. |
| 8 | Los 34 pares y los 67 vecinos, contra el generador | `diff` vacío en los tres sitios: migración, tramos del banco y vecinos del banco. Node 24.14.1, Unicode 17.0. |
| 9-12 | Nulos, concurrencia, permisos, solo adición | Sin cambios. `lineas`, `cuota_iva` y `total` son `NOT NULL`. No hay ningún `update`, `delete` ni `grant`. |
| 13 | Las seis negativas de B-H3 | Están dentro de sus tramos de J28h. |

**Inflado de T.** No encontré ninguna entrada que sume más de 1 por línea general:
- `least` lo acota;
- la cantidad es entera y ≥ 1 (6.3);
- las líneas de 0 € suman 0 (J49, J50);
- las parejas ±1 céntimo suman 1 por línea (J50a, J50b);
- los tipos bajos con cantidad alta suman 1.

La pareja ±6 céntimos (medida: T = 3, diferencia 2,463, se sella) cuesta 0 € netos. Está dentro del residuo D5 que ya recoge `state.md`: «un céntimo por línea general visible».

**Memoria (R4.9).**
- `state.md` tiene 78 líneas, recoge la línea de la ronda 4 y la de `supabase/`, y trae las tres entradas nuevas: documentos mixtos, banda y residuo, y marcas combinantes.
- La bitácora recoge las tres reglas de R3.9 con la enmienda, y la entrada de la ronda 4 con la trampa del `\gexec`.
- Conforme.

## Hallazgos

### BAJA

**H1 · Un documento cuya parte general tiene `Q < 0,5` céntimos no se puede sellar con ninguna cuota**

- **Dónde:** `supabase/migrations/20261011140000_economico_ronda_4.sql:95`, junto con `20261011120000_economico_esquema.sql:599`.
- **Por qué:** cuando todas las líneas generales tienen `|Q_i| < 1`, la tolerancia es `T = Σ|Q_i| = |Q|`. La banda admite entonces `c ∈ [0, 2Q]`, y como la cuota va en céntimos enteros, solo cabe `c = 0`. Pero el 6.4 rechaza la cuota 0 en cuanto la suma general es distinta de 0.
- **Medido:**

  | Documento | Cuota 0 | Cuota 0,01 |
  |---|---|---|
  | `('Fotocopia', 1, 2, 'general', 2100)`, total 0,02 (Q = 0,347) | «la cuota de IVA no puede ser 0» | «fuera de la banda» |
  | Sesión exenta 60,00 + `('Fotocopias', 1, 12, 'general', 400)` | lo mismo | lo mismo |
  | 0,05 € al 10 % | lo mismo | lo mismo |

  El control, 0,03 € al 21 % (Q = 0,52), sí se sella con 0,01.
- **Es nuevo de esta ronda:**
  - con la ronda 3 (`U = Σ cantidad = 1`), la cuota 0,01 entraba;
  - `desglosarDesdeTotal(0,02)` da cuota 0, que el 6.4 ya paraba.
- **Efecto:** T-026 no puede sellar ese borrador de ninguna forma: es un estado sin salida.
- **Qué haría falta, una de estas dos:**
  - que el 6.4 admita la cuota 0 cuando `|Q| < 0,5`, con su positiva (fotocopia de 0,02 con cuota 0) y una negativa con `Q ≥ 0,5` y cuota 0;
  - o anotar en `state.md` el caso como residuo, para que T-026 lo rechace en el Zod con un mensaje propio.

**H2 · La clase de invisibles no cubre U+1D159 (MUSICAL SYMBOL NULL NOTEHEAD)**

- **Dónde:** `supabase/migrations/20261011140000_economico_ronda_4.sql:24`, en la lista de `:27-62`.
- **Medido:**
  - un concepto `chr(0x1D159)` en una línea exenta 1 × 60,00 se sella en BORR3;
  - `chr(0x1D159) || chr(0x1D159) || chr(0x200B)`, también.
- **Por qué se escapa:** el carácter es So y no tiene DI, Cf, White_Space ni Cc, así que el generador no lo ve. Sin embargo, está en las mismas listas de «caracteres en blanco» de las que la ronda 3 tomó U+2800, que la ronda 4 mantiene a mano, y U+1D173-1D17A, que sí entra por Cf. Su glifo es vacío.
- **No es un residuo aceptado:** `state.md` solo acepta las marcas combinantes de una escritura concreta, y este carácter no es una marca combinante.
- **Escenario:** el concepto de una línea es U+1D159, y la línea queda sellada para siempre en la cadena con un texto que no se ve.
- **Qué haría falta, una de estas dos:**
  - añadir `[0x1D159, 0x1D159]` a la lista de excepciones `ex` del generador, y con ello a los 35 pares, su J28h y sus dos J28i;
  - o anotarlo en `state.md` junto al residuo de las marcas combinantes.

**H3 · Un tramo de más que no toca a ningún otro sobrevive al banco**

- **Dónde:** `scripts/rls/26-economico.sql:1154-1172` (J28i) y `tickets/T-021/mutantes.json:653` (M57).
- **Lo que se afirma:** R4.5-8 y M57 dicen que un par de más lo detectan sus J28i. Eso solo es cierto si el tramo de más ensancha uno de los existentes, porque así cubre el vecino.
- **Medido:** se añadió `[0x0400, 0x04FF]` (cirílico) al array dentro de la transacción.
  - Resultado: 00 + 01 + 26 con exit 0, los mismos 399 OK que sin mutar.
  - Un concepto `chr(0x0421) || chr(0x0435) || chr(0x0441)` («Сес») da 23514 «Un concepto invisible».
- **Por qué importa:** la función es copia viva, y cada ronda la reescribe entera con `create or replace`. Un par pegado de más en una redefinición futura deja el banco en verde y rechaza conceptos escritos en otra escritura.
- **Qué haría falta:** una aserción de catálogo en el banco 26 que extraiga los pares del bloque `tramos:inicio/fin` de `pg_proc.prosrc`, por ejemplo con `regexp_matches(prosrc, '0x[0-9A-F]+', 'g')`, y los compare con el array del propio banco. Así se detecta cualquier diferencia entre los dos, sea de más o de menos, y esté o no junto a otro tramo.
- **Severidad:** BAJA, porque la lista de esta ronda coincide con el generador (diff vacío).

## Fuera del diff, sin hallazgo

- **Signos de formato visibles dentro de la clase.** La clase contiene U+0600-0605, U+06DD, U+0890-0891 y U+110BD, que son signos visibles. Solo rechazan un concepto formado entero por ellos, y ninguno de esos conceptos es legítimo. No es un hallazgo.
