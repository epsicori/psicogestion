**Revisor B, ronda 3: no hay hallazgos ALTA, así que esta revisión no bloquea el gate.** Recuento: 0 ALTA, 1 MEDIA y 3 BAJA.

# T-021 · Revisión B, ronda 3 (disparadores y dinero)

**Diff revisado.** `git diff 503e6a6 58cd9a1`, con el foco en 567aad4 y 58cd9a1. El merge 5d9d778 solo trae de main la rama de la ronda 2.

**Comprobaciones previas**
- Los commits de la ronda no tocan `20261011120000_economico_esquema.sql`: `git diff --stat 5d9d778 58cd9a1` sobre ella sale vacío.
- `fn_sellar_version_borrador` aparece 3 veces en la migración nueva: en la cabecera, en el comentario de la función nueva y en el `comment on function`. No se redefine.
- No hay caracteres invisibles crudos. Lo he comprobado por punto de código en la migración, el banco, `mutantes.json`, la bitácora y el README.

**Base medida**
- `supabase_db_Psicogestion`, con `max(version) = 20261011130000`.
- La función viva lleva la clase con escapes `\u`, no crudos. Lo he comprobado con `od` sobre `prosrc`.
- La base es ICU `en_US.UTF-8`.

**Método**
- Todo como `postgres`, dentro de `begin … rollback`.
- Concatené `00`, `01` y `26` del worktree y añadí mis sondas al final. Para los mutantes, `create or replace` sobre `pg_get_functiondef()` con `replace()`, antes de `26`.
- Los invisibles los escribo con `chr(x'…'::int)`, nunca crudos.
- Con el código actual, el banco 26 sale completo.

No he leído `evidencia.json` ni el informe del implementador.

## Lo que pide §R3.5, punto por punto (lo que toca a B)

| # | Qué | Medido o leído | Estado |
|---|---|---|---|
| 1 | B-H1 mira `old.bono_id` | La condición es `old.bono_id is not null and old.bono_id is distinct from new.bono_id`. K21 (X → nulo) y K22 (postgres) dan 42501 con el fragmento | Bien |
| 2 | Concurrencia null → X frente a null → Y | Ver «Concurrencia de B-H1», debajo de la tabla | Bien, por lectura (B-H9 aceptado) |
| 3 | El paciente se comprueba en la primera asignación | K19a da 23514 «el bono es de otro paciente». Con M31 pasaría a 42501 | Bien |
| 4 | Otras puertas | INSERT y `paciente_id` sin cambios. Cancelar una cita realizada ya está en `state.md` | Sin novedad |
| 9 | Orden de los disparadores | Before insert sobre las versiones: `sellar_version_borrador` (tgtype 7) y después `sellar_version_borrador_cotas` (7). Los otros tres son after, update/delete o truncate. J28g da 42501 y no 23514 | Bien. La aserción de catálogo es en parte vacua (nota 1) |
| 10 | Banda de dos lados y con signo | J47b y J48 están. M45 y M46 mueren | Bien, salvo que la tolerancia se puede inflar (H1) |
| 11 | Límites exactos | J46 y J46g, J47 a J47c | Bien |
| 12 | Nulos y conversiones | El sellado ya ha validado cada clave (`json_typeof` y enteros) antes de que corran las cotas | Bien |
| 13 | Sin caracteres crudos | Ninguno | Bien |
| 14 | Fragmentos únicos | `Un concepto invisible`, `como mucho 10000 centésimas` y `fuera de la banda` no se pisan con los del paso 6 | Bien |
| 15 | `signo_ck` sigue viva | J42 se ha reescrito como documento mixto: la banda pasa (0,46) y para `signo_ck` | Bien. La nota de `state.md` falta (H4) |

**Concurrencia de B-H1.** `GetTupleForTrigger` bloquea la fila antes del disparador `before`. En READ COMMITTED, toma la versión más reciente como `old`. Así que el segundo `update` ve `old.bono_id = X` y lanza 42501.

**La aritmética de la banda, con el código actual**
- `Q = Σ cantidad·precio·tipo/(10000+tipo)` sobre precios con IVA, como dice la cabecera de 6.4.
- Con `desglosarDesdeTotal` (`lib/dinero/iva.ts:85-99`, la base redondeada y la cuota por diferencia), el error es ≤ 0,5 céntimos por llamada. Por eso el documento legítimo S2 (tres líneas de 33,33 € desglosadas una a una, 1,36 céntimos de Q) se sella.
- La división `numeric` no cambia ningún caso del banco.
- `>` frente a `>=` es equivalente para los documentos legítimos, porque su error máximo es 0,5·U < U. No lo cuento como superviviente.

---

## MEDIA

### H1 · `supabase/migrations/20261011130000_economico_ronda_3.sql:107` · la tolerancia de la banda crece con unidades que no mueven dinero: una línea general de precio 0 con una cantidad grande la desactiva, y la base 0 con la cuota llena vuelve a sellarse

**Qué pasa**
- La tolerancia es `U = Σ cantidad` de las líneas generales (`:107`, comprobada en `:111`).
- El sellado exige `cantidad ≥ 1`, pero no acota el precio por abajo: 0 es válido y los negativos también.
- Por eso una línea general de precio 0 suma tantas unidades como se quiera a U, y no cambia ni la suma, ni `Q`, ni el total.
- Pasa lo mismo con un par de líneas `+1` y `−1` céntimo con la misma cantidad.

**Escenarios.** Medidos como `postgres` con `pg_temp.sv` sobre BORR3. Todos se sellan:

| Sonda | Líneas | Base / cuota / total | Resultado |
|---|---|---|---|
| S1a (control = J44) | general 1 × 100,00 al 21 % | 0,00 / 100,00 / 100,00 | 23514 «fuera de la banda» |
| **S1b** | la misma + «Ajuste», general, **100000 × 0** | 0,00 / 100,00 / 100,00 | **SELLA** |
| **S1c** (J45 + par) | exenta 60 + «Material», general, 1000000 × +0,01 + «Descuento material», 1000000 × −0,01 | 50,00 / 10,00 / 60,00 | **SELLA** |
| **S1d** (B v4 aumentado) | exenta 500 + general 100 + «Ajuste» 60000 × 0 | 100,00 / **500,00** / 600,00 | **SELLA**: 500 € de IVA sobre 100 € de base imponible |

**Efecto**
- La «base 0 con cuota llena» es exactamente la que nombra la decisión del propietario del 05-10 (A esc. 1, B v5). Vuelve a entrar en la cadena de solo adición con una línea que no cambia ningún importe.
- No hace falta mala fe. Una línea legítima de precio 0 («Material de evaluación, incluido», cantidad 30) afloja la banda en 30 céntimos sin que nadie lo vea. Un error de cuota de la aplicación de hasta 30 céntimos queda sellado.
- D3 justifica `U` como «una unidad por unidad general». Esa premisa (redondear cada unidad) no la produce `lib/dinero`, que redondea una vez por llamada. Y es la que deja inflar la cota.

**Qué haría falta.** Lo decide el arquitecto. Hace falta una tolerancia que no crezca con lo que no mueve dinero, por ejemplo una por línea general de precio distinto de 0, o una cota de la cuota que no dependa de la cantidad. Con dos pruebas:
- S1b y S1c como negativas «fuera de la banda»;
- S2 como positiva (ver H2), para que el arreglo no se pase al otro lado.

---

## BAJA

### H2 · `scripts/rls/26-economico.sql:1174` · la decisión D3 (tolerancia por unidad general y no un céntimo fijo) no tiene ninguna prueba: la alternativa que el diseño descarta sobrevive

**Qué pasa**
- Todas las positivas de la banda tienen `U = 1` o una diferencia de 0:
  - J47g y J47c: 0,46 y 0,54;
  - J43g: 0,36;
  - J46g y J47d: 0;
  - J45g: 0.
- Ninguna sella un documento legítimo con una diferencia entre 1 y U.
- Es la misma familia que «enum de tres valores probado con uno».

**Medido**, con el banco 26 completo bajo cada mutante:
- **MB1**: `> v_unidades` cambiado por `> 1` (el «céntimo fijo» que D3 descarta). **Sobrevive.**
- **MB2**: `v_unidades + v_cantidad` cambiado por `v_unidades + 1` (U = número de líneas). **Sobrevive.**

**Escenario de fallo.** Tres líneas generales de 33,33 €, cada una desglosada con `desglosarDesdeTotal` (cuota 5,78 por línea). Da base 82,65 / cuota 17,34 / total 99,99, con Q = 1735,36 y una diferencia de 1,36.
- Hoy se sella (S2, medido).
- Con MB1 daría 23514, y el banco seguiría verde. Si el arreglo de H1, o T-026, toca la tolerancia, puede rechazar borradores legítimos sin que ninguna prueba lo vea.

**Qué haría falta**
- S2 como positiva, que mata MB1.
- Si D3 se mantiene, además una línea con cantidad 3 y una diferencia entre 1 y 3, que mata MB2.

### H3 · `supabase/migrations/20261011130000_economico_ronda_3.sql:86` y `scripts/rls/26-economico.sql:1076` · la clase de invisibles deja fuera caracteres que no se ven, y 6 de sus tramos no tienen negativa; J28e no prueba lo que dice

**1. Caracteres que se sellan como concepto único.** Medidos sobre BORR3, cada uno en su propia sentencia:
- U+1D173 (MUSICAL SYMBOL BEGIN BEAM);
- U+1BCA0 (SHORTHAND FORMAT LETTER OVERLAP);
- U+FFF9 (INTERLINEAR ANNOTATION ANCHOR);
- U+E0080 y U+E01F0, que son ignorables por defecto y están sin asignar.

Todos dan **SELLA**. Son de la lista Default_Ignorable_Code_Point de Unicode, que la clase quiere cubrir y solo cubre en parte: las etiquetas llegan hasta U+E007F y no hasta U+E0FFF. Faltan además U+FFF0-FFFB, U+1BCA0-1BCA3 y U+1D173-1D17A.

Escenario: una línea cuyo concepto es `chr(x'1D173'::int)` entra en el borrador y se pinta vacía. Es lo que la ronda quería cerrar. La probabilidad es baja, porque ningún procesador de textos inserta estos caracteres al pegar.

**2. Tramos sin prueba.** Medido con el banco 26 completo bajo cada mutante:
- quitar `\U000E0000-\U000E007F` (MB3): **sobrevive**;
- quitar `­` (MB4): **sobrevive**;
- quitar `︀-️` (MB5): **sobrevive**;
- quitar ` - ` (MB6): **sobrevive**;
- quitar `　` (MB8): **sobrevive**;
- quitar `ㅤ` (MB7, control de que el método aplica el mutante): muere en J28e.

Solo tienen negativa U+200B, U+FEFF, U+2060 y U+3164. Que «M31-M47 sin supervivientes» sea cierto depende de que la lista de mutantes solo traiga M38 para la clase.

**3. J28e.**
- El diseño la pedía con `　 `, para comprobar que la clase no depende del locale (R3.6-5). El banco la cambió a `ㅤ　`, porque en esta base (ICU) `[:space:]` ya cubre U+3000 y U+00A0, y la comprobación vieja la paraba antes.
- Por eso J28e no prueba la independencia del locale: MB8 sobrevive.
- Su etiqueta dice «espacio ideográfico y espacio duro», pero el concepto lleva un relleno hangul y no un espacio duro.

**Qué haría falta**
- Ampliar las etiquetas a `\U000E0000-\U000E0FFF`, y añadir `￰-￻`, `\U0001BCA0-\U0001BCA3` y `\U0001D173-\U0001D17A`.
- Una negativa por tramo; basta con un `unnest` de puntos de código, cada uno en su propia sentencia.
- La etiqueta de J28e corregida.

### H4 · `docs/state.md:27` · falta en §Hallazgos la entrada que pide R3.9 sobre los documentos mixtos

**Qué pasa**
- R3.6-3 dice «Se anota en `state.md`», y R3.9 da el texto: «documentos mixtos (exento negativo y general positivo) no se sellan por `signo_ck`; lo decide T-026».
- `grep -i "mixt\|signo" docs/state.md` no devuelve nada. La decisión solo vive en el comentario de J42 (`26-economico.sql:1105-1107`).
- Tampoco están en la bitácora las tres reglas que R3.9 pide dejar: el orden por nombre, la tolerancia U y los prefijos de los mensajes. Solo están las trampas.

**Escenario**
1. T-026 diseña una rectificación que devuelve una sesión exenta (−100) y factura un informe pericial (+100 al 21 %). Total 0, base −17,36, cuota 17,36.
2. El sellado da 23514 `borradores_factura_versiones_signo_ck` en la implementación, no en el diseño.
3. Nadie lo tenía delante: está en un comentario del banco. Es el patrón «decisión en un comentario».

---

## Notas que no son hallazgo

1. **L10r3 compara dos literales.** `'sellar_version_borrador_cotas' collate "C" > 'sellar_version_borrador' collate "C"` es siempre verdadero, así que no mira el nombre real del disparador que sella.
   - Si T-026 recrea el sellado como `sellar_version_borrador_v2`, esa parte sigue verde.
   - Lo caza J28g: TEC1 recibe 23514 en vez de 42501.
   - Por eso no hay fallo, pero la etiqueta promete más de lo que mira. Lo correcto sería leer `tgname` de los dos disparadores before insert del catálogo.
2. **M32 y M33** figuran como muertos en K14 y K17, de la ronda 2, y no en K21 y K22, que es lo que decía el diseño. Las dos son correctas: K14 es X → nulo sobre una cita pasada, y K17 la hace como postgres. K21 y K22 también los matan.
3. **La cabecera de `26-economico.sql`** (líneas 5-30) sigue listando las secciones A-N. Le falta el bloque O. El README sí lo tiene.
4. **K23** cuenta citas y no lee `bonos_consumo`, porque bajo `postgres` la vista no devuelve filas (lo dice la bitácora). Es equivalente: el consumo es ese recuento, y con M33 K23 se pone rojo.

## Descartados tras mirar

- **Las cotas lanzan después del cerrojo consultivo del sellado.** Un error revierte la sentencia (o el savepoint) y libera el cerrojo; lo mismo pasaba con las 6.x.
- **`fn_cotas_version_borrador` es invoker con `revoke execute from public`.** Postgres no comprueba EXECUTE al disparar un disparador. Las positivas `authenticated` del banco (B2) pasan por él.
- **Asignar una sola vez el bono a una cita pasada `cancelada` o `no_asistida`, que queda fija para siempre.** No consume nada. Que el bono equivocado quede fijo en una cita realizada es la decisión del propietario («después queda fijo»).
- **El techo de 10000 centésimas.** Es la decisión P-R3.2.
