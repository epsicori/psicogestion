# T-056 · Diseño · Festivos, cierres y vacaciones

Arquitecto · 16-10-2026 · base main `d04288f`. Contrato: `tickets/T-056-festivos-y-ausencias.md`. Se apoya en `tickets/T-055/diseno.md`: las funciones que aquí se tocan son las de T-055a.
Partición: **T-056a** (esquema, riesgo alto) y **T-056b** (interfaz, riesgo medio).

## 0 · Hechos verificados contra el código

| Hecho | Dónde |
|---|---|
| El único festivo que existe es por profesional: `disponibilidad.tipo = 'festivo'`, con `desde`/`hasta` y `centro_id` opcional | `supabase/migrations/20260906120000_agenda_esquema.sql:343-376` |
| Las ausencias de día entero (`tipo = 'ausencia'`, sin horas) ya representan vacaciones, y `centro_id` nulo vale para todos los centros | idem; `agenda_bloques_profesional` en `20261012120000_hueco_raro.sql` |
| `alta_bloqueo_disponibilidad` devuelve `'festivo'`, `'ausencia'` o nulo, y alimenta las propuestas de la serie y la desviación | `20261005120000_base_del_alta_de_cita.sql:139-177`; serie en `20261007120000:1016-1018` |
| Los bancos 16, 17, 21, 23 y 29 insertan `disponibilidad` de tipo `festivo` | `grep -ln "'festivo'" scripts/rls/*.sql` |
| Añadir un valor a un enum y usarlo en la misma transacción falla en Postgres (`ALTER TYPE … ADD VALUE`): las migraciones corren en una transacción | comportamiento de Postgres 17; precedente en la regla de `supabase/**` |
| La siembra ya tiene un «Festivo local» **de Ana** (por profesional) en Madrid, el primer martes entre hoy+14 y hoy+20 | `supabase/seed-completo.sql:528-538` |
| `11-cobertura.sql` exige que cada política de `public` esté en su lista | `scripts/rls/11-cobertura.sql` |
| `fn_auditar('id')` es el disparador de auditoría genérico | `20260906120000:661` (uso sobre `disponibilidad`) |
| No hay pantalla de festivos ni en el prototipo ni en `docs/interfaz.md` | `docs/interfaz.md` |
| Lo que T-055a deja: `franjas_vigentes`, `agenda_horario_del_dia`, la pura `avisosDeHorario` y `p_aceptar_aviso` | `tickets/T-055/diseno.md` §1.A |

## 1 · Piezas y contratos

### 1.A · T-056a

#### 1.A.1 · Migración `supabase/migrations/20261020120000_festivos_y_cierres.sql`

1. `create type public.clase_dia_sin_consulta as enum ('nacional', 'autonomico', 'local', 'cierre');`
2. Tabla:
   ```sql
   create table public.dias_sin_consulta (
     id          uuid primary key default gen_random_uuid(),
     centro_id   uuid not null references public.centros(id),
     clase       public.clase_dia_sin_consulta not null,
     nombre      text not null check (char_length(btrim(nombre)) between 1 and 120),
     desde       date not null,
     hasta       date not null,
     creado_en   timestamptz not null default now(),
     creado_por  uuid references public.perfiles(id),
     constraint dias_sin_consulta_rango_ck   check (hasta >= desde),
     constraint dias_sin_consulta_un_dia_ck  check (clase = 'cierre' or desde = hasta),
     constraint dias_sin_consulta_tope_ck    check (hasta - desde <= 366),
     constraint dias_sin_consulta_unico      unique (centro_id, clase, desde)
   );
   create index dias_sin_consulta_centro_fechas on public.dias_sin_consulta (centro_id, desde, hasta);
   ```
   - El FK de `creado_por` apunta a la misma tabla que el de `disponibilidad.creado_por`; hay que comprobarlo en la migración de T-010.
3. **Disparador `fijar_dia_sin_consulta`**, BEFORE INSERT OR UPDATE, con `fn_fijar_dia_sin_consulta()`, definer y `search_path` vacío.
   - En INSERT: `creado_por := auth.uid()` y `creado_en := now()`.
   - En UPDATE: cambiar `centro_id`, `creado_por` o `creado_en` da 42501 «día sin consulta: centro y alta no se cambian.».
4. **Auditoría**: `create trigger auditar_dias_sin_consulta after insert or update or delete … execute function public.fn_auditar('id')`, igual que `disponibilidad`.
5. **Privilegios**:
   - `revoke all on public.dias_sin_consulta from public, anon, authenticated;`
   - `grant select, insert, update, delete on public.dias_sin_consulta to authenticated;`
   - DELETE sí se concede: un festivo dado de alta por error se borra, y el borrado queda en `auditoria`. No es un dato clínico ni económico (CLAUDE.md, regla 6).
   - TRUNCATE no se concede.
6. **RLS** (`enable row level security`), con cuatro políticas:
   - `dias_sin_consulta_lectura` FOR SELECT: administrador; `profesional_sanitario`; o técnico con `centro_id in (select public.centros_actuales())`. Se usan los mismos ayudantes de rol que en T-055a.
   - `dias_sin_consulta_alta` FOR INSERT WITH CHECK, `_modificacion` FOR UPDATE USING/WITH CHECK y `_baja` FOR DELETE USING: solo el administrador.
7. **`public.dia_sin_consulta_en(p_centro_id uuid, p_fecha date) returns table (clase public.clase_dia_sin_consulta, nombre text)`**: SQL `stable`, invocadora, `search_path` vacío, sin grant (revoke a public, anon y authenticated). Devuelve las filas con `centro_id = p_centro_id and p_fecha between desde and hasta`, ordenadas por clase.
8. **`agenda_bloques_profesional`**: `create or replace` desde la versión de T-055a. El único cambio: al recorrer los días, si `exists (select 1 from public.dia_sin_consulta_en(p_centro_id, v_dia))`, el día se salta y no ofrece huecos.
9. **`alta_bloqueo_disponibilidad`**: `create or replace` desde T-055a. Antes de mirar `disponibilidad`, si existe un día sin consulta del centro en esa fecha, devuelve `'festivo'` (D3).
10. **`agenda_horario_del_dia`**: `create or replace` desde T-055a, con la misma puerta. Añade la clave `"dias_sin_consulta": [{"clase":"local","nombre":"Fiesta local (inventada)"}]`. Es siempre un array, vacío si no hay. No devuelve `id` ni `creado_por`.
11. **`agenda_crear_cita`** no cambia: con `p_aceptar_aviso` falso, el 22023 ya salta por `alta_bloqueo_disponibilidad`, y con la marca, crea.

#### 1.A.2 · Pura (`lib/agenda/aviso-horario.ts`)

- `EntradaAvisoHorario` añade `diasSinConsulta: { clase: 'nacional'|'autonomico'|'local'|'cierre'; nombre: string }[]`.
- `AvisoHorario` añade `{ tipo: 'dia_sin_consulta'; clase; nombre }`: uno por día sin consulta, el primero en el orden.
- Pruebas nuevas:
  - un festivo local nombrado;
  - un cierre y un festivo del profesional el mismo día, en orden;
  - la entrada vacía, que da `[]`.

#### 1.A.3 · Banco `scripts/rls/38-festivos-y-cierres.sql`

- Lleva fijación propia, con sufijo 38 y uuids de prefijo `05600038-…`.
- Ancla temporal: `extract(year from now())::int + 16`.
- Un profesional propio, PRO38, en CA y en CB, con franjas de lunes a viernes de 09:00 a 14:00 en los dos centros.

Bloques del banco, cada negativa con su gemela:

1. **Catálogo.** La tabla, los checks, la unicidad y el disparador de auditoría. Las cuatro políticas. Grants: authenticated tiene SELECT, INSERT, UPDATE y DELETE y no tiene TRUNCATE; anon no tiene nada. `dia_sin_consulta_en` no tiene execute para authenticated.
2. **Checks.**
   - Un festivo local de dos días: 23514. Un cierre de dos días: pasa.
   - `hasta < desde`: 23514.
   - Un duplicado (centro, clase, desde): 23505. La misma fecha en el otro centro: pasa.
3. **Disparador.**
   - `creado_por` falsificado queda en uid.
   - UPDATE de `centro_id`: 42501.
   - UPDATE de `nombre`: pasa.
4. **RLS.**
   - ADM inserta, corrige y borra.
   - PRO1 inserta: 42501. PRO1 lee todos.
   - TEC1 (de CA) cuenta solo los de CA. TEC2 no ve los de CA.
   - TEC1 borra: 0 filas afectadas (USING filtra) o 42501. La aserción comprueba que la fila sigue.
5. **Auditoría.** El insert, el update y el delete del ADM dejan tres filas en `auditoria` con la tabla `dias_sin_consulta`.
6. **Bloques.**
   - Un festivo local en CA el martes M: `agenda_bloques_profesional(PRO38, CA, …)` no tiene huecos ese día, sí el lunes y el miércoles. En CB, el martes M sí tiene huecos (la gemela).
   - Un cierre de CA de lunes a viernes: ningún hueco ninguno de los cinco días, el viernes incluido. El lunes siguiente, sí.
7. **Alta.**
   - `agenda_crear_cita` el martes M en CA, sin la marca: 22023 «festivo o ausencia». Con `p_aceptar_aviso`: crea. En CB el martes M sin la marca: crea.
8. **Serie.**
   - El plan de serie (`agenda_plan_serie` o el nombre real, que se lee en `20261007120000`) con la segunda sesión en el cierre la propone con alternativa y motivo `festivo`.
   - La serie estricta con la primera sesión en el festivo local: 22023.
9. **`agenda_horario_del_dia`.** El martes M en CA lleva `dias_sin_consulta` con la clase y el nombre. En CB, `[]`. Las claves de cada elemento son exactamente `{clase, nombre}`.

El README recibe la fila del módulo 38 y la ancla Y+16. `11-cobertura.sql` recibe las cuatro políticas.

#### 1.A.4 · Siembra (`supabase/seed-completo.sql`, tras el bloque de T-055)

```
-- DATOS INVENTADOS (T-056): festivos locales y cierres sin entregar por el propietario.
-- Los nacionales y autonómicos son los públicos de 2026 y 2027; el local y el cierre, inventados.
```

- Ids `e0560001-0000-4000-8000-…`, con `on conflict (id) do nothing`.
- **Nacionales de 2026 y 2027**, en `k_c_madrid` y en `k_c_canarias`: 1-ene, 6-ene, Viernes Santo (2026-04-03 y 2027-03-26), 1-may, 15-ago, 12-oct, 1-nov, 6-dic, 8-dic y 25-dic. El 1-nov de 2026 cae en domingo y se siembra igual.
- **Autonómicos**: Madrid, el 2 de mayo; Canarias, el 30 de mayo; ambos en los dos años. Son las fechas habituales; el propietario confirma las reales.
- **Local de Madrid** «Fiesta local (inventada)»: el primer jueves entre hoy+21 y hoy+27.
- **Local de Las Palmas** «Fiesta local (inventada)»: el primer sábado a partir de hoy+28. Cae sobre la franja de sábado de T-055.
- **Cierre de Madrid** «Cierre por obras (inventado)»: del primer lunes a partir de hoy+35 al viernes de esa semana.
- Las fechas relativas se calculan con `isodow`, como el festivo de T-028. No pueden chocar con el «Festivo local» de Ana (hoy+14 a hoy+20).

#### 1.A.5 · Mutantes (`tickets/T-056/mutantes/Mxx.sql`; el método y el formato son los de T-055)

| id | Cambio | Debe caer en |
|---|---|---|
| M01 | Bloques sin el salto de día sin consulta | el martes M en CA sin huecos |
| M02 | `dia_sin_consulta_en` sin el filtro de centro | el martes M en CB con huecos |
| M03 | `alta_bloqueo_disponibilidad` que ignora la tabla | crear sin marca → 22023 |
| M04 | Lectura del técnico sin el filtro de centro | TEC2 no ve CA |
| M05 | `_alta` abierta al profesional | PRO1 inserta → 42501 |
| M06 | `p_fecha between desde and hasta` cambiado por `>= desde and < hasta` | el viernes del cierre sin huecos |
| M07 | `agenda_horario_del_dia` sin `dias_sin_consulta` | la clave en CA |
| M08 | `drop constraint dias_sin_consulta_un_dia_ck` | un festivo de dos días → 23514 |
| M09 | Sin el disparador de auditoría | tres filas en `auditoria` |
| M10 | Disparador sin la congelación de `centro_id` | UPDATE de centro → 42501 |
| M11 | `grant truncate` a authenticated | catálogo de grants |

### 1.B · T-056b

1. **`lib/citas/horario.ts`**: el Zod `.strict()` añade `dias_sin_consulta`. `guardarAlta` pasa `diasSinConsulta` a la pura.
2. **`lib/citas/festivos.ts`**:
   - `listarDiasSinConsulta(sesion, {centroId, anio})`;
   - las acciones `crearDiaSinConsulta`, `corregirDiaSinConsulta` y `borrarDiaSinConsulta`, con Zod. Si `clase !== 'cierre'`, se fija `hasta = desde`.
   - Errores: 23505 «Ya hay un día así en ese centro.» y 23514 «Un festivo es de un solo día; para varios, usa «Cierre».».
3. **`/ajustes/festivos`** (`app/(app)/ajustes/festivos/page.tsx`, `acciones.ts`, `lista-festivos.tsx`, `formulario-festivo.tsx`):
   - si no es administrador, `notFound()`;
   - un selector de centro y uno de año;
   - una lista agrupada por mes;
   - el alta, con clase, nombre y fecha (o desde y hasta si es cierre);
   - el borrado con confirmación en un `Dialogo` con foco gestionado. Es la pieza de foco, no delegable.
4. **Vacaciones en `/ajustes/horario`**:
   - sección «Vacaciones y ausencias» con un formulario: desde, hasta, centro opcional («Todos los centros» = nulo) y motivo opcional;
   - se inserta como `disponibilidad` `tipo='ausencia'`, sin horas;
   - la lista muestra las vigentes y futuras;
   - el cierre anticipado pone `hasta`; no hay borrado (sin DELETE en `disponibilidad`).
5. **`aviso-horario.tsx`**: el texto de la variante, «Festivo nacional: Navidad», «Festivo local: …», «Centro cerrado: …». Las claves de i18n van por clase.
6. `app/(app)/ajustes/page.tsx`: el enlace «Festivos», solo para el administrador.

## 2 · Decisiones y alternativas descartadas

- **D1. Una tabla nueva por centro, no `disponibilidad` con `perfil_id` nulo.** Mezclaría la RLS de lo personal con lo del centro y obligaría a relajar el `not null` de `perfil_id`.
- **D2. Todos los festivos son por centro, los nacionales también (pregunta 1).** Se descarta una fila sin centro «para todos»: añade una rama nula a cada consulta y a cada política, y no permite excepciones.
- **D3. Un cierre devuelve `'festivo'` en `alta_bloqueo_disponibilidad`.** Se descarta un valor nuevo en el enum: `ADD VALUE` no se puede usar en la misma transacción de la migración, y cambia los motivos de la serie (T-011) sin efecto práctico.
- **D4. Las vacaciones siguen siendo `disponibilidad.tipo='ausencia'`.** Se descarta una tabla de vacaciones: el dato ya existe, bloquea en bloques y en el alta y tiene RLS (T-055a).
- **D5. DELETE concedido y auditado en `dias_sin_consulta`.** No es clínico ni económico, y un festivo mal dado de alta tiene que poder desaparecer. La auditoría conserva quién y cuándo.
- **D6. El técnico lee los días sin consulta de sus centros, sin más.** Es información pública (un festivo) y la necesita para entender la agenda.
- **D7. El `tipo='festivo'` personal queda como legado.** Prohibirlo rompe cinco bancos y no aporta nada.

## 3 · Cómo se cierra cada criterio de aceptación

| Criterio | Comprobación |
|---|---|
| a · test:rls | `npx supabase db reset && npm run test:rls`; exit 0; `max(version)` = `20261020120000`; módulo 38 en el log |
| a · siembra | `npm run seed && npm run seed && npm run test:rls`; exit 0 |
| a · mutantes | el bucle de T-055 §1.A.5 con `38-*.sql` sobre M01–M11 |
| a · pura | `npx vitest run lib/agenda/aviso-horario.test.ts` |
| a · suite | `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx tsc --noEmit`, `npx next build --webpack` y `npm run verificar:huellas` |
| a · QA | `qa.mjs visita /agenda/nueva`, como Ana en Madrid: la semana del cierre y el jueves de la fiesta sin huecos; el día de antes y el de después, con huecos |
| b · pruebas | vitest de `lib/citas/festivos.test.ts`, de la acción de `/ajustes/festivos` (sin administrador, `notFound`) y del componente del aviso |
| b · QA | `qa.mjs visita /ajustes/festivos /ajustes/horario /agenda/nueva` a 1280 y 360 px, con los pasos del contrato |

## 4 · Riesgos, por probabilidad

1. **Media.** T-055a cambia al implementarse (nombres o salida de `agenda_horario_del_dia`). Se parte de lo que haya en main, no de este diseño.
2. **Media.** La siembra relativa cae encima de otra fecha sembrada (el festivo de Ana o las citas de Lucía). Las ventanas están separadas: hoy+14 a 20, hoy+21 a 27, hoy+28 en adelante y hoy+35 en adelante.
3. **Media.** Las citas sembradas que caen en un festivo nacional (por ejemplo, las de Lucía de los martes) quedan en un día sin consulta. No es un error: el aviso no toca lo ya creado. La QA no tiene que tomarlo por fallo.
4. **Baja.** La unicidad (centro, clase, desde) choca con un cierre y un festivo del mismo día: son clases distintas y no chocan, que es lo deseado.
5. **Baja.** El tope de 366 días es insuficiente: un cierre de más de un año no es un cierre.

## 5 · Qué revisar

- **Entradas del llamante**: `centro_id` en el alta es libre para el administrador (que es de todos los centros). `clase` y el rango los cierra el check.
- **Que la lectura del técnico se filtre por `centros_actuales()`**: M04. Un técnico con la pertenencia cerrada deja de ver.
- **Pruebas que deben fallar**:
  - un festivo de dos días cae por `dias_sin_consulta_un_dia_ck` y no por el de rango;
  - el profesional que inserta cae por RLS (42501), no por el disparador.
- **Otras puertas**:
  - TRUNCATE sin grant (M11);
  - DELETE del técnico sin efecto;
  - UPDATE que mueve un festivo a otro centro (42501);
  - un `nombre` en blanco (el check con `btrim`);
  - duplicados (23505).
- **Que el último día del cierre también bloquee**: `between` es inclusivo (M06).
- **Que `alta_bloqueo_disponibilidad` siga devolviendo `'festivo'` o `'ausencia'` y nada más**: diff contra T-055a.
- **Que `agenda_horario_del_dia` no exponga `id` ni `creado_por`** de los días sin consulta.
- **Siembra**: el comentario «DATOS INVENTADOS» y la palabra «inventada» en los nombres no reales.

## 6 · Territorio

El que declara el contrato.

## 7 · Delegable

- **T-056a: nada.**
- **T-056b**:
  - claves de i18n de Festivos, Vacaciones y las clases del aviso. Nivel `rapido`; salida `lib/i18n/es.ts`; comprobación `npx tsc --noEmit`;
  - `app/(app)/ajustes/festivos/lista-festivos.tsx`, la lista agrupada por mes que solo pinta (sin el borrado, que va en el formulario). Nivel `rapido`; contexto: el tipo `DiaSinConsulta` de `lib/citas/festivos.ts`; comprobación `npx tsc --noEmit && npm run lint`.

## Lo que no entra, y por qué

- Importar festivos de un calendario oficial o de un .ics, y los festivos recurrentes: ver el contrato.
- Avisar de las citas existentes cuando se crea un festivo encima: es otra pieza (bandeja).
- Distinguir el cierre del festivo en la serie (D3).
- Retirar el festivo personal (D7).
