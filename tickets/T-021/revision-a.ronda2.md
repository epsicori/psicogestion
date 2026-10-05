**Sin hallazgos ALTA.** T-021, revisor A, ronda 2: 0 ALTA, 0 MEDIA y 2 BAJA. Los siete hallazgos de la ronda 1 (A-H1…H7) están cerrados y medidos en la base local.

- Revisado: `git diff main...worktree-agent-a19ecdb63f2c1e386` (HEAD a982e0a; 12 ficheros).
- Contra qué: el contrato, el diseño §«Ronda 2 (05-10-2026)» con la lista R2.4, mi revisión de la ronda 1 y la constitución.
- Cómo se midió:
  - en `supabase_db_Psicogestion`, sin `db reset`;
  - cada medición dentro de `begin … rollback`, con `00-ayudantes.sql` y `01-fijacion.sql` del worktree delante.
- Los números de línea `mig:` son de `supabase/migrations/20261011120000_economico_esquema.sql` en HEAD.

## ALTA

Ninguna.

- La regla 6 se cumple en las cuatro tablas del catálogo (versiones, cobros, tarifas y caducidades), con sus tres capas.
- `bonos` lleva las capas 2 y 3, no tiene UPDATE para nadie y queda fuera del catálogo, como pide el diseño.
- Ningún dato económico se reescribe con UPDATE.

## MEDIA

Ninguna.

## BAJA

### H1 · `mig:140-141` y `mig:599-602` · El arreglo de A-H7.2 acota el signo, no el reparto: la cuota puede superar la parte en régimen general
- **Qué se arregló.** Mi escenario de la ronda 1 era base −50 y cuota 150. Ahora lo paran `signo_ck` y J42.
- **Qué sigue abierto.** El reparto entre base y cuota sigue siendo libre dentro del signo:
  - `signo_ck` admite `base = 0`;
  - 6.4 solo exige cuota ≠ 0 cuando hay líneas generales;
  - nada impide que la cuota supere lo que suman esas líneas.
- **Escenario medido** (PRO1, sobre coherente, rollback):
  1. Una línea `general` de 100 € al 21 %, con `base = 0,00`, `cuota_iva = 100,00` y `total = 100,00`. Se sella como versión 2. Lo correcto es 82,64 + 17,36.
  2. Una línea exenta de 1.000 € más una general de 100 €, con `base = 600`, `cuota_iva = 500` y `total = 1.100`. Se sella como versión 3. La cuota es cinco veces toda la parte general.
- **Efecto.**
  - Las dos quedan selladas para siempre en la cadena del borrador.
  - T-026 enviaría esos importes al proveedor.
  - Una versión nueva lo corrige, pero nada impide sellarlo.
- **Por qué no es redondeo** (el diseño excluye el redondeo en «Lo que no entra»):
  - basta un límite por categoría: `new.cuota_iva * 100 <= v_suma_general` cuando `v_suma_general > 0` (y el simétrico si es negativa);
  - como las líneas llevan el IVA incluido, eso equivale a «base ≥ parte exenta».
- **Severidad.** BAJA, igual que A-H7 en la ronda 1: es un borrador, no una factura (ADR-053).

### H2 · `mig:1119-1125` frente al paso 0 del sellado (`mig:336-348`) · Tras reasignar al paciente, el borrador lo lee quien ya no lo atiende, y no lo ve quien lo atiende ahora
- **Cuándo pasa.** La cabecera se valida solo al insertarla, con los pasos 0-2 de `fn_validar_cabecera_borrador`.
  - La lectura exige `profesional_id = auth.uid()` y no exige asignación.
  - Añadir una versión sí la exige.
- **Escenario medido** (rollback):
  1. PRO1 abre un borrador de P1 (su paciente).
  2. ADM reasigna P1 a PRO2 (`update pacientes set profesional_id = PRO2`).
  3. ADM añade una versión con destinatario «Nuevo destinatario».
- **Resultado:**
  - PRO1: `es_profesional_asignado(P1) = f`. Aun así ve la cabecera (1) y la versión que ADM añadió después, destinatario incluido.
  - Si PRO1 intenta añadir una versión, recibe 42501 «No puedes añadir una versión a este borrador».
  - PRO2, el titular actual, ve 0 cabeceras.
- **Efecto.**
  1. Quien ya no atiende al paciente sigue leyendo los datos económicos que se le añaden después de perder la asignación.
  2. El borrador de sus sesiones queda sin salida para él: solo el administrador lo continúa.
- **Decisión.** La lectura sin asignación está escrita así en el diseño (§«Políticas», fila `borradores_factura_lectura`). Si es intencionado, que conste; la alternativa es exigir `es_profesional_asignado` en la lectura del profesional. Decide el propietario.
- **Relevancia.** La reasignación es real: es lo que pasa en la baja de un profesional (architecture.md, titularidad).

## Los hallazgos de la ronda 1, medidos

| Ronda 1 | Estado | Medición (dentro de rollback) |
|---|---|---|
| A-H1 (ALTA) · condiciones de un bono reescritas en sitio | **Cerrado** | TEC1 `update bonos set caducidad` → `permission denied for table bonos`. Como `postgres` → «La tabla bonos es de solo adición» (capa 2). La caducidad nueva es una fila de `bonos_caducidades`, y `bonos_consumo` toma la última. Grants del catálogo: `bonos` solo SELECT para authenticated, más INSERT por columnas sin `creado_en` |
| A-H2 · `creado_por` libre en la cabecera | **Cerrado** | PRO1 con `creado_por = PRO2` → 42501 «No puedes abrir este borrador» (paso 0 y política). N1, N7 |
| A-H3 · tarifa con fecha pasada | **Cerrado** | La segunda tarifa del par fechada 2026-01-02, y también la fechada `current_date - 1`, dan 23514 «no puede empezar antes de hoy». `update vigente_desde` da `permission denied for table tarifas_paciente`. `vigente_hasta` ya no existe: la deriva `lead()` en `tarifas_paciente_vigencias` (invoker) |
| A-H4 · técnico titular lee y escribe tarifas | **Cerrado** | Con TEC1 titular de P1 (`es_asig = t`): ve 0 tarifas y 0 vigencias, su alta falla por RLS, y la cabecera de ADM con TEC1 da 23514 «debe tener rol profesional_sanitario o administrador» |
| A-H5 · `profesional_id` de la cabecera sin validar | **Cerrado** | ADM con la cabecera (P1, PRO2) → 23514 «no atiende a ese paciente». Igual como `postgres`, porque los pasos 1 y 2 no dependen del rol |
| A-H6 · bono de una cita pasada y realizada | **Cerrado** | Una cita realizada y pasada con bono da consumo 1. PRO1 `set bono_id = null` → 42501 «realizada o pasada ya no se cambia de bono»; la comparación es con `is distinct from`, así que quitar el bono también está congelado. Cancelar la cita realizada baja el consumo: es la familia anotada en `docs/state.md` y fuera de alcance según el diseño |
| A-H7.1 · línea exenta con IVA | **Cerrado** | Por línea: exento ⇒ tipo 0 y general ⇒ tipo > 0 (`mig:554-561`). J27b, J27c, J31b |
| A-H7.2 · reparto base/cuota libre | **Cerrado a medias** | El signo está cerrado (J42). El reparto dentro del signo no: hallazgo H1 de esta ronda |

## Lista R2.4, punto por punto

**Qué elige quien llama.** Medido en el catálogo con `information_schema.column_privileges`.
- `tarifas_paciente`: INSERT solo en `creada_por, id, importe, paciente_id, regimen_iva, tipo_terapia_id, vigente_desde`. Ni `orden` ni `creada_en`.
- `bonos_caducidades`: `bono_id, caducidad, id, registrada_por`.
- `cobros`: sin `registrado_en`.
- Cabecera: `creado_por, id, paciente_id, profesional_id`.
- `bonos`: sin `creado_en`, sin UPDATE.
- Versiones: siguen con INSERT de tabla entera, como decide el diseño. Lo que fija el sistema lo pisan el disparador y 6.5 (±1 minuto).
- 6.2.bis (centro): presente.

**Qué prueba debe fallar y por qué.**
- M7 lleva un sobre coherente y exige el fragmento del paso 0. Una versión coherente de PRO1 tras perder la asignación (H2) muere exactamente con ese mensaje, así que el paso 0 discrimina.
- J42 pide el nombre de `signo_ck`.
- N1-N7 piden fragmentos únicos.
- C8, E18d/e/g, K12 y N2 piden `permission denied for table …`.
- Los mutantes de R2.6 no los he ejecutado: es el carril del verificador.

**Invariantes por otra puerta.**
- **I-T1, I-B1 e I-B2:** las condiciones de lectura y de alta son idénticas, rama por rama, sin contar la autoría. `fn_alta_tarifa` y `fn_numerar_caducidad_bono` son invoker, con `search_path = ''`, y toman el candado consultivo antes de `max`.
- **`lead()`:** la RLS de tarifas oculta pacientes enteros (admin, o profesional asignado), nunca filas sueltas.
- **Nulos:**
  - `is distinct from` en la congelación y en el paso 1;
  - `v_rol` null se rechaza;
  - el paso 0 va envuelto en `coalesce`.
- **Duplicados:** están los dos índices únicos.
- **`postgres` y TRUNCATE:**
  - capa 1 revocada también a `postgres` en las cuatro tablas del catálogo (`postgres` solo tiene INSERT, REFERENCES, SELECT y TRIGGER);
  - `bonos` conserva sus privilegios de tabla, porque es destino de FK, y lleva las capas 2 y 3;
  - `bonos` no está en el catálogo, que tiene 4 filas.
- **Disparadores en `citas`:** la congelación vive dentro de `fn_bono_de_la_cita` (`mig:259-264`) y lee `old`.
- **Permisos antes que cotejo:** `fn_validar_cabecera_borrador` hace el paso 0 antes de leer `pacientes` y `perfiles`, y el sellado hace el suyo con el rol en positivo.
- **`bonos_consumo`:** `reloptions = {security_invoker=false, security_barrier=true}`, y su `where` coincide con `bonos_lectura`.
- **EXECUTE:** las seis funciones nuevas solo las ejecuta `postgres` (`verificar_cadena_borrador` revocada a authenticated).

**Greps de R2.3 sobre la migración final.**
1. Sin comentarios: 0.
2. Comentarios de bloque `/*`: 0.
3. Literal: 1 línea, `mig:5`, el comentario de cabecera que exige el contrato.

El grep del criterio 13 (`espejo` y `proveedor` fuera de comentarios) da 0.

**Alcance y territorio.**
- `territorio.mjs T-021`: los 12 ficheros dentro.
- `lint:migraciones`: 30 migraciones limpias, con `tarifas_paciente`, `bonos` y `bonos_caducidades` añadidas a `TABLAS_SOLO_ADICION`.
- No aparece nada de ADR-053 (series, numeración, QR ni registro de facturación).

**Auditoría.** Las seis tablas nuevas tienen disparador de auditoría (`mig:992-1076`).

## Descartado

**Una tarifa con `vigente_desde = hoy` vuelve a poner precio a una sesión ya celebrada esta mañana.** El diseño lo eligió de forma explícita (K5c, `<` y no `<=`), y no hay escenario que viole lo que se pidió.

T-021 revisor A: 0 ALTA · 0 MEDIA · 2 BAJA
