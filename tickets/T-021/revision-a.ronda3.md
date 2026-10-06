**Sin hallazgos ALTA.** T-021 ronda 3: 0 ALTA · 1 MEDIA · 2 BAJA (suma de los revisores que han escrito; A: 0/1/2).

<!-- REVISOR-A-INICIO -->
## Revisor A · ronda 3 (seguridad, RLS y solo adición): 0 ALTA · 1 MEDIA · 2 BAJA

- **Revisado:** `git diff 503e6a6 58cd9a1`, en concreto los commits 567aad4 y 58cd9a1 de la rama `worktree-agent-a2cc04ba9ba7302c8`.
- **Contra qué:** el contrato, el diseño (§Ronda 3, R3.5 «Qué revisar» y Respuestas del propietario del 06-10) y la constitución.
- **Cómo se midió:**
  - en `supabase_db_Psicogestion`, con `max(version) = 20261011130000`;
  - cada medición dentro de `begin … rollback`, con `00-ayudantes.sql`, `01-fijacion.sql` y la cabecera de `26-economico.sql` (ids y ayudantes) delante.
- **Rutas abreviadas:** `r3:` es `supabase/migrations/20261011130000_economico_ronda_3.sql` y `26:` es `scripts/rls/26-economico.sql`.

### ALTA

Ninguna.

**Solo adición (CLAUDE.md §6):**
- La migración 20261011120000 está intacta: `git diff a982e0a 58cd9a1 -- supabase` solo trae la nueva.
- La ronda no añade ningún `grant`. La migración nueva solo trae un `before insert`, un `alter policy` de lectura y el `create or replace` de un disparador de `citas`.
- Medido en el catálogo:
  - sobre `borradores_factura_versiones` y `cobros`, `authenticated` tiene `INSERT,SELECT` y `SELECT`, y `postgres` tiene `INSERT,REFERENCES,SELECT,TRIGGER`;
  - los cuatro disparadores `impedir_*` siguen habilitados (`O`).
- No queda ningún camino de UPDATE ni de DELETE sobre versiones ni sobre cobros.

### MEDIA

#### A-H1 · `r3:107` y `r3:111` · La holgura U la elige quien sella: una línea general de 0 céntimos con cantidad grande reabre «base 0 con la cuota llena»

- **El fallo.** La banda tolera `U` céntimos, y `U` es la suma de `cantidad` de las líneas generales.
  - El sellado admite cualquier cantidad entera ≥ 1 y cualquier precio entero, también 0 y negativos (paso 6.3, sin techo).
  - Por eso basta añadir una línea general de precio 0 y cantidad alta. No cambia el total ni `Q`, pero ensancha la banda hasta donde se quiera.
- **Escenario medido** (rollback; R5 como PRO1 `authenticated` sobre BORR1, los demás como `postgres`):

  | # | Líneas | Base / cuota / total | Resultado |
  |---|---|---|---|
  | R1 | general 1 × 10000 al 2100 **+ general 1.000.000 × 0 al 2100** | 0,00 / 100,00 / 100,00 | **SELLA** (sin la segunda línea, J44: `23514 fuera de la banda`) |
  | R2 | general 1 × 10000 al 2100 + general 5000 × 1 + general 5000 × −1 | 0,00 / 100,00 / 100,00 | **SELLA** |
  | R3 | exenta 1 × 100000 + general 1 × 10000 + general 100000 × 0 | 600,00 / 500,00 / 1100,00 | **SELLA**: es el escenario 2 de mi R2-H1, la cuota cinco veces toda la parte general |
  | R4 | exenta 1 × 20000 + general 1 × −10000 + general 100000 × 0 | 82,64 / 17,36 / 100,00 | **SELLA**: J48, la cuota de signo contrario |
  | R5 | R1, como PRO1 autenticado | 0,00 / 100,00 / 100,00 | **SELLA** |

- **Efecto.** Los tres casos que la decisión del propietario del 05-10 metió en la ronda vuelven a sellarse con una línea más:
  - cuota mayor que la parte general;
  - base 0 con la cuota llena;
  - cuota de signo contrario.

  Quedan sellados para siempre en la cadena, y T-026 los mandaría al programa.
- **Por qué el banco no lo ve.** J43, J44, J47 y J48 (`26:1121-1179`) llevan como mucho una o dos líneas útiles y nunca una línea de relleno. Siguen verdes con la banda burlada.
- **Por qué no es el residuo aceptado en R3.6-4.**
  - Ese residuo es «±U céntimos» pensado con U del orden de las sesiones del documento.
  - Aquí `U` lo controla quien sella y no tiene techo: 1.000.000 de unidades a 0 € dan ±10.000 € de holgura.
- **Arreglo (lo decide el arquitecto).** La tolerancia no debe crecer con unidades que no aportan cuota. Opciones:
  - por unidad, `least(0.5, |precio·tipo/(10000+tipo)|)`: una unidad de 0 € suma 0;
  - rechazar las líneas generales de precio 0.

  Las parejas de ±1 céntimo (R2) quedan acotadas por la cuota de las propias líneas de relleno (unos 0,17 céntimos por unidad), no por su número. Cada opción necesita su negativa con línea de relleno junto a J44.

### BAJA

#### A-H2 · `r3:86` · La clase de invisibles deja fuera caracteres de formato (Cf) que no se ven
- **Escenario medido** (rollback; una línea exenta de 60 € sobre BORR1, cada carácter como escape): se sellan sin error conceptos que solo llevan uno de estos caracteres:
  - U+1D173 o U+1D17A (formato musical);
  - U+FFF9 (anotación interlineal);
  - U+1BCA0 (control de taquigrafía);
  - U+13430 (formato jeroglífico);
  - U+0300 sola (marca combinante sin base).
- **Efecto.** Es el mismo B-H3, por otro punto de código: una línea con un concepto en blanco queda en la cadena.
- **Arreglo.** El motor de expresiones regulares de Postgres no tiene `\p{Cf}`, así que la clase explícita es la vía correcta. Le faltan:
  - `￹-￻`;
  - `\U00013430-\U0001343F`;
  - `\U0001BCA0-\U0001BCA3`;
  - `\U0001D173-\U0001D17A`.

  Las marcas combinantes, U+0300 sola incluida, conviene dejarlas escritas como residuo en el comentario de la función.
- **Severidad.** BAJA: es un borrador, y Zod de T-026 y T-046 puede normalizar antes.

#### A-H3 · `docs/state.md` · Falta la anotación de los documentos mixtos que el diseño manda escribir (R3.6-3 y R3.9)
- **Lo que se pidió.** El diseño acepta que `signo_ck` rechace los documentos mixtos (exento negativo con general positivo) y dice que «se anota en `state.md`» para que lo decida T-026.
- **Lo que hay.** El diff de `state.md` solo cambia la línea de T-021 y la de 16/23. `grep -i "mixto\|signo_ck" docs/state.md docs/bitacora/T-021.md` no devuelve nada.
- **Escenario de fallo.** T-026 implementa un abono parcial mixto, recibe `23514 borradores_factura_versiones_signo_ck` (J42 lo fija como comportamiento) y no encuentra la decisión fuera de `diseno.md`.
- **Arreglo.** Una línea en `docs/state.md` §Hallazgos anotados.

### Lista R3.5, punto por punto (A)

| # | Punto | Resultado |
|---|---|---|
| 1 | B-H1 mira `old` | Mira `old` (`r3:31`). K21 (pasar a nulo) y K22 (`postgres`) piden 42501 con fragmento |
| 2 | Concurrencia | Revisado leyendo. En READ COMMITTED, el `before` del segundo `update` recibe como `old` la versión que ha bloqueado, con `bono_id = X`, así que lanza 42501 |
| 3 | La comprobación del paciente sigue | Sigue. K19a da 23514 y no 42501 |
| 4 | Otras puertas | `paciente_id` lo congela `fn_proteger_cita_pasada`. Pasar una realizada futura a programada para cambiarle el bono es la familia «cancelar una realizada», ya anotada en `state.md` |
| 5 | Ninguna lectura con el patrón viejo | El grep da 5 líneas: el paso 0 del sellado (`mig:342`), el paso 0 de la cabecera (`mig:861`), la lectura vieja que sustituye el `alter policy` (`mig:1124`) y las dos altas (`mig:1133` y `mig:1152`). El catálogo muestra la política nueva, todavía `to authenticated` |
| 6 | Fusiones | Coherente con citas, cobros y bonos. Leen el titular del absorbido y el del superviviente |
| 7 | TEC1 titular | Solo lo para el rol en positivo: O7 y M36 |
| 8 | Escribir no se abre | O6 da 42501 a PRO2, y O6g sella como ADM. Medí M34 a mano: con la política de la ronda 2 dentro del rollback, caen exactamente O3, O4 y L10r3 |
| 9 | Orden de disparadores | `sellar_version_borrador` va antes que `sellar_version_borrador_cotas` en `collate "C"`. `auditar_*` es `after` (tgtype 29), así que no se mete en medio |
| 12 | `::numeric` | Sin riesgo: el disparador corre después de 6.3 |
| 13 | Caracteres crudos | Ninguno en `r3` ni en `26` (`grep -P` con `LC_ALL=C.UTF-8`, con exit 1) |
| 16 | Palabras prohibidas | Ninguna en `r3` |
| 17 | Solo añadir | La 20261011120000 está intacta |
| — | Funciones nuevas | `fn_cotas_version_borrador` y `fn_bono_de_la_cita` con `proacl = {postgres=X/postgres}`. La de cotas es invoker y no lee tablas |
| — | Linter y territorio | `lint:migraciones`: 31 limpias. `territorio.mjs T-021`: 14 ficheros, todos dentro |
| — | Banco | 00 + 01 + 26 en una transacción con `ON_ERROR_STOP=1`: exit 0 |

### Descartado
- **Tras reasignar, PRO1 sigue leyendo en `auditoria` las filas de las versiones que él mismo selló.** La política es `auditoria_lectura_propia` (por actor), anterior a este ticket y común a todas las tablas. Solo ve lo que él escribió, no lo que se añada después, así que no es una puerta nueva de esta ronda.
- **Oráculo de existencia de un bono por `fn_bono_de_la_cita` (definer).** El 23503 de la clave ajena ya lo da. La ronda 3 solo hace alcanzable en citas pasadas lo que ya pasaba en las futuras.
<!-- REVISOR-A-FIN -->
