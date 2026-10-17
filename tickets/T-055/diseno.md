# T-055 · Diseño · Disponibilidad por centro

Arquitecto · 16-10-2026 · base main `d04288f`. Contrato: `tickets/T-055-disponibilidad-por-centro.md`.
Propuesta de partición: **T-055a** (esquema, riesgo alto) y **T-055b** (interfaz, riesgo medio). Este diseño sirve a los dos; §1.A es de T-055a y §1.B de T-055b.

## 0 · Hechos verificados contra el código

| Hecho | Dónde |
|---|---|
| La tabla `disponibilidad` (id, perfil_id, centro_id nulo, tipo `franja/ausencia/festivo`, dia_semana smallint 1–7, hora_inicio, hora_fin, desde, hasta, zona_horaria, motivo, creado_por, creado_en) tiene checks por tipo, y `hora_fin > hora_inicio` en las franjas | `supabase/migrations/20260906120000_agenda_esquema.sql:343-376` |
| Las políticas `disponibilidad_lectura` (cualquier autenticado), `disponibilidad_alta` y `disponibilidad_modificacion` (`perfil_id = auth.uid()` o administrador) se crean en | `20260906120000:786-819` |
| Grants a authenticated: `select, insert, update`, sin `delete` | `20260906120000:857` |
| La tabla se audita con `fn_auditar('id')` | `20260906120000:661` |
| El disparador `validar_zona_horaria_disponibilidad` solo valida que la zona sea IANA; no la fija a la del centro | `20260906120000` (bloque de validadores de zona) |
| La última versión de `agenda_bloques_profesional` está en `20261012120000_hueco_raro.sql`. Lee franjas con `centro_id is null or = p_centro_id`, resuelve la hora con `d.zona_horaria` y no mira la pertenencia | `supabase/migrations/20261012120000_hueco_raro.sql` |
| `alta_bloqueo_disponibilidad(p_profesional_id, p_centro_id, p_fecha)` devuelve `'festivo'`, `'ausencia'` o nulo, y evalúa las ausencias parciales con `at time zone d.zona_horaria` | `20261005120000_base_del_alta_de_cita.sql:139-177` |
| Última versión de `agenda_crear_cita`: tiene 11 argumentos y lanza 22023 «… festivo o ausencia …» si hay bloqueo | `20261007120000_cita_en_episodio_y_asistencia.sql:1143-1297`; la comprobación, en `:1248-1251` |
| La serie estricta rechaza la primera sesión en festivo | `20261007120000:1016-1018` |
| Ninguna migración posterior a `20261012120000` redefine esas tres funciones. La única de T-053 es `20261018120000`, que no está en main y hay que comprobar al implementar | `ls supabase/migrations` (la última en main es `20261017120000_agenda_densidad_anual.sql`) |
| Los bancos 21 y 23 comprueban que haya **una sola** `agenda_crear_cita`, y el 23 la nombra por su firma de 11 argumentos (`regprocedure`) | `scripts/rls/21-alta-de-cita.sql:162,172,180`; `scripts/rls/23-cita-en-episodio.sql:93-98` |
| La app solo llama a `agenda_crear_cita` desde `lib/citas/alta.ts:239`, con argumentos por nombre | grep sobre `lib`, `app` y `components` |
| La app no lee la tabla `disponibilidad` directamente | grep de `from('disponibilidad'` sobre `app`, `lib` y `components`: sin resultados |
| `perfiles_centros`: la pertenencia vigente es la que tiene `hasta is null`. `centros_actuales()` devuelve los centros del uid | migraciones de T-002 y T-006 |
| Siembra: Ana y Bruno tienen franjas de lunes a viernes en Madrid desde `current_date - 7`. Ana tiene además un `festivo` «Festivo local» en Madrid, el primer martes entre hoy+14 y hoy+20 | `supabase/seed-completo.sql:518-538` |
| Ana pertenece también a Las Palmas: la fila `a0080008…` de `perfiles_centros` se siembra antes | `supabase/seed-completo.sql` (bloque de pertenencias) |
| Formulario de alta: `Elegido = {clave, etiqueta}`. El recálculo desmarca el elegido si no es un hueco libre de la vista nueva. Al guardar se salta a la semana del elegido y salta el aviso de hueco raro | `app/(app)/agenda/nueva/formulario-alta.tsx:40,62,150-175,314-335` |
| `clasificarHoraLocal(fecha, hora, zona)` devuelve `normal`, `inexistente` o `ambigua`; `formatearHora(instante, zona)` usa `@date-fns/tz` | `lib/fechas/anomalias.ts:49`, `lib/fechas/formato.ts:8` |
| Ayudantes del banco: `assert`, `assert_lanza_codigo`, `assert_lanza_codigo_msg(consulta, codigo, fragmento, mensaje)`, `assert_no_lanza`, `contar`, `como`, `reset_sesion`. Fijación: `:ADM`, `:PRO1`, `:TEC1`, `:TEC2`, `:CA`, `:CB` | `scripts/rls/00-ayudantes.sql`, `scripts/rls/01-fijacion.sql:4-12` |
| Prototipo e interfaz: no hay ninguna pantalla de disponibilidad, solo el subtítulo «Citas, disponibilidad y salas por centro». Ajustes no tiene bloque de horario | `docs/interfaz.md` |

## 1 · Piezas y contratos

### 1.A · T-055a

#### 1.A.1 · Migración `supabase/migrations/20261019120000_disponibilidad_por_centro.sql`

Si el número está ocupado al implementar, se usa el siguiente libre posterior a T-053 y se anota en la bitácora.

Contenido, en este orden:

1. **Guarda previa.** Un bloque `do` lanza `raise exception 'T-055: hay franjas sin centro o sin desde; corrígelas antes de migrar.'` si existe alguna fila con `tipo = 'franja' and (centro_id is null or desde is null)`. No hay relleno: producción no existe y la siembra y los bancos ya ponen centro y `desde`. Comprobarlo con `grep -n "'franja'" scripts/rls/*.sql supabase/seed*.sql`. Si un banco inserta una franja sin centro, ese banco se corrige en este ticket y se añade al territorio.
2. **Check.** `alter table public.disponibilidad add constraint disponibilidad_franja_centro_ck check (tipo <> 'franja' or (centro_id is not null and desde is not null));`
3. **Exclusión.**
   ```sql
   alter table public.disponibilidad add constraint disponibilidad_franjas_sin_solape
     exclude using gist (
       perfil_id extensions.gist_uuid_ops with =,
       centro_id extensions.gist_uuid_ops with =,
       dia_semana extensions.gist_int2_ops with =,
       daterange(desde, hasta, '[]') with &&,
       tsrange(date '2000-01-03' + hora_inicio, date '2000-01-03' + hora_fin, '[)') with &&
     ) where (tipo = 'franja');
   ```
   - Con `[)` en las horas, las adyacentes (9–14 y 14–18) se permiten.
   - Con `[]` en las fechas, dos franjas que se tocan el mismo día chocan: una que acaba el 10 y otra que empieza el 10, a la misma hora, se solapan.
   - `daterange(desde, null, '[]')` es un rango sin fin, que es correcto para `hasta` nulo.
   - Si Postgres rechaza la expresión por no ser inmutable, se crea `public.rango_de_horas(time, time) returns tsrange language sql immutable` (con `search_path` vacío y sin grant) y se usa en la exclusión. El precedente del operador es `citas_sin_solape_profesional`: btree_gist vive en `extensions` y la opclase va cualificada.
4. **Disparador `fijar_disponibilidad`**, BEFORE INSERT OR UPDATE FOR EACH ROW. Ejecuta `public.fn_fijar_disponibilidad()`, que es `security definer` con `set search_path = ''`. Su nombre ordena antes de `validar_zona_horaria_disponibilidad`, así que corre primero.
   - En INSERT:
     - `new.creado_por := auth.uid()`; queda nulo si siembra el usuario postgres;
     - `new.creado_en := now()`;
     - si `new.tipo = 'franja'` y no existe `perfiles_centros(perfil_id = new.perfil_id, centro_id = new.centro_id, hasta is null)`, `raise exception 'disponibilidad: el profesional no pertenece a ese centro.' using errcode = '22023'`.
   - Solo las franjas exigen pertenencia: el módulo 29 (K6) inserta una ausencia de PRO1 en CB.
   - En UPDATE: si cambia alguno de `perfil_id`, `tipo`, `centro_id`, `creado_por` o `creado_en` (`is distinct from`), `raise exception 'disponibilidad: perfil, tipo, centro y alta no se cambian; cierra la fila y crea otra.' using errcode = '42501'`.
   - En ambos casos, si `new.centro_id is not null`, `new.zona_horaria := public.zona_horaria_centro(new.centro_id)`. Si `centro_id` es nulo, la zona la sigue validando el disparador existente.
5. **RLS.** Se hace `drop policy` y `create policy` **con los mismos tres nombres**, así que `scripts/rls/11-cobertura.sql` no cambia.
   - `disponibilidad_lectura` FOR SELECT TO authenticated USING `(public.es_administrador() or (public.tiene_rol('profesional_sanitario') and perfil_id = auth.uid()))`. Hay que usar los ayudantes de rol que ya usan las políticas vecinas, con el mismo nombre que tengan; se comprueba en la migración de T-010 antes de escribir.
   - `disponibilidad_alta` FOR INSERT WITH CHECK y `disponibilidad_modificacion` FOR UPDATE USING/WITH CHECK, con la misma condición.
   - Los grants no cambian (`select, insert, update`). Sin DELETE.
6. **`public.franjas_vigentes(p_profesional_id uuid, p_centro_id uuid, p_fecha date) returns table (hora_inicio time, hora_fin time)`**.
   - `language sql stable`, invocadora, `set search_path = ''`.
   - Filtra `tipo = 'franja'`, `perfil_id = p_profesional_id`, `centro_id = p_centro_id` (sin la rama `is null`), `dia_semana = extract(isodow from p_fecha)`, `desde <= p_fecha` y `(hasta is null or hasta >= p_fecha)`.
   - Además exige `exists` de pertenencia vigente en `perfiles_centros`.
   - Ordena por `hora_inicio`.
   - `revoke all on function … from public, anon, authenticated`: solo la llaman funciones definer.
7. **`agenda_bloques_profesional`**: `create or replace` con **la misma firma y la misma salida**. Se copia literal de `20261012120000_hueco_raro.sql` con tres cambios y ninguno más:
   - el bucle de franjas lee `public.franjas_vigentes(p_profesional_id, p_centro_id, v_dia)`;
   - la zona es `v_zona := public.zona_horaria_centro(p_centro_id)`, ya calculada o leída una vez, y `resolver_hora_local(v_zona, …)` sustituye a la zona de la fila;
   - las ausencias parciales usan `at time zone v_zona` en los dos sitios: el cálculo del límite y el `not exists` del hueco raro.
8. **`alta_bloqueo_disponibilidad`**: `create or replace` con la misma firma. El único cambio es `at time zone public.zona_horaria_centro(p_centro_id)` en lugar de `d.zona_horaria`.
9. **`public.agenda_horario_del_dia(p_profesional_id uuid, p_centro_id uuid, p_fecha date) returns jsonb`**: `stable`, `security definer`, `set search_path = ''`.
   - La puerta de permisos se copia literal de la de `agenda_bloques_profesional`:
     - con la sesión nula, 42501;
     - con algún parámetro nulo, 22023;
     - `alta_exigir_profesional(p_profesional_id)`;
     - administrador, o el propio profesional, o técnico con `p_centro_id` en `centros_actuales()`; si no, 42501.
   - Salida exacta:
     ```json
     {"fecha":"2026-10-20","zona":"Europe/Madrid",
      "franjas":[{"inicio":"09:00","fin":"14:00"}],
      "bloqueos":[{"tipo":"festivo","inicio":null,"fin":null},{"tipo":"ausencia","inicio":"10:00","fin":"12:00"}]}
     ```
   - `franjas` sale de `franjas_vigentes`.
   - `bloqueos` son las filas del perfil con `tipo in ('festivo','ausencia')`, `centro_id is null or = p_centro_id`, que cubren `p_fecha`. Las horas se dan en la zona del centro: `inicio` y `fin` son nulos si la ausencia es de día entero o si el festivo es del día. Va primero el festivo y después las ausencias por inicio.
   - **Nunca** devuelve `motivo`, `id`, `creado_por` ni `perfil_id`.
   - `revoke all … from public, anon`; `grant execute … to authenticated`. Lleva un `comment on function`.
10. **`agenda_crear_cita`**:
    - `drop function public.agenda_crear_cita(uuid, uuid, uuid, uuid, date, time, smallint, text, text, public.modalidad_asistencia, uuid);`
    - `create function` con los mismos 11 parámetros más `p_aceptar_aviso boolean default false` al final. El cuerpo se copia de la última redefinición. El único cambio es la condición de `:1248-1251`, que pasa a ser `if not coalesce(p_aceptar_aviso, false) and public.alta_bloqueo_disponibilidad(...) is not null then raise … using errcode = '22023'`, con el texto «Ese día el profesional tiene festivo o ausencia.» (o el texto actual, si ya contiene «festivo o ausencia»: se conserva).
    - Se repiten el `comment`, el `revoke … from public, anon` y el `grant execute … to authenticated`.
    - Con `drop` + `create` queda una sola función, que es lo que exigen los bancos 21 y 23. **El banco 23 nombra la firma de 11 argumentos**: hay que actualizar `scripts/rls/23-cita-en-episodio.sql:96,98` a la de 12, y `scripts/rls/23-cita-en-episodio.sql` entra en el territorio de T-055a.
11. El resto de las funciones no se toca. La serie (`agenda_plan_serie`, `agenda_crear_serie`) sigue usando `alta_bloqueo_disponibilidad` y hereda la corrección de zona sin más cambios.

#### 1.A.2 · Función pura `lib/agenda/aviso-horario.ts`

```ts
export interface FranjaDelDia { inicio: string; fin: string }            // 'HH:MM'
export interface BloqueoDelDia { tipo: 'festivo' | 'ausencia'; inicio: string | null; fin: string | null }
export interface EntradaAvisoHorario {
  fecha: string;            // 'AAAA-MM-DD', fecha local del centro
  hora: string;             // 'HH:MM', hora local de inicio
  duracionMinutos: number;  // > 0
  zona: string;             // IANA, la del centro
  franjas: FranjaDelDia[];
  bloqueos: BloqueoDelDia[];
}
export type AvisoHorario =
  | { tipo: 'hora_inexistente' }
  | { tipo: 'festivo_profesional' }
  | { tipo: 'ausencia'; inicio: string | null; fin: string | null }
  | { tipo: 'fuera_de_franja'; franjas: FranjaDelDia[] };   // franjas vacía = «ese día no tiene horario en este centro»
export function avisosDeHorario(e: EntradaAvisoHorario): AvisoHorario[];
```

- Sin reloj ni `Date.now()`, sin zona del sistema ni E/S.
- `clasificarHoraLocal(fecha, hora, zona)`:
  - si da `inexistente`, devuelve `[{tipo:'hora_inexistente'}]` y para;
  - si da `ambigua`, toma la primera ocurrencia (`.rules/fechas.md`).
- El fin es el instante de inicio más `duracionMinutos`, y se lleva a reloj de pared con `format(…, 'yyyy-MM-dd HH:mm', { in: tz(zona) })`. Si la fecha local del fin es distinta de `fecha`, la cita cruza la medianoche y es `fuera_de_franja`.
- Se compara en minutos de reloj de pared. La cita cabe si existe una franja con `inicioFranja <= inicioCita` y `finCita <= finFranja`. No se unen franjas adyacentes: una cita de 13:30 a 14:20 sobre 9–14 y 14–18 está fuera. Es lo mismo que hace `agenda_bloques_profesional`, que no ofrece huecos que crucen franjas; se comprueba al implementar y, si bloques une adyacentes, la pura también las une y se anota.
- La ausencia avisa si es de día entero o si su intervalo `[inicio, fin)` se cruza con el de la cita.
- El orden de salida es fijo: `festivo_profesional`, después `ausencia` (una por bloqueo que se cruza) y por último `fuera_de_franja`.
- T-056a añade la variante `{ tipo: 'dia_sin_consulta'; clase: …; nombre: string }`, que va la primera.

Pruebas en `lib/agenda/aviso-horario.test.ts`, todas con fecha fija:

1. Dentro de la franja: `[]`.
2. Borde exacto, de 13:10 a 14:00 sobre 9–14 con 50 minutos: `[]`.
3. Un minuto de más (13:11): `fuera_de_franja`.
4. Día sin franjas: `fuera_de_franja` con `franjas: []`.
5. Salto de marzo en Madrid, el 29-03-2026 a las 02:30: `hora_inexistente`.
6. Salto de marzo, cita a la 01:30 de 60 minutos con franja de 01:00 a 03:00: el fin de pared es 03:30, así que fuera.
7. Solape de octubre en Madrid, el 25-10-2026 a las 02:30, ambigua: se toma la primera; una cita de 60 minutos acaba a las 02:30 de pared (la segunda), y con franja de 02:00 a 03:00 cabe.
8. `Atlantic/Canary`, el 29-03-2026 a la 01:30, que es inexistente en Canarias (el salto es a la 01:00 UTC): `hora_inexistente`. Hay que comprobar el instante con `clasificarHoraLocal` antes de escribir el caso, y elegir la hora que la función dé por inexistente.
9. Cita de 23:30 con 60 minutos: cruza la medianoche, `fuera_de_franja`.
10. Festivo y fuera de franja a la vez: devuelve los dos, en orden.
11. Ausencia parcial que se cruza; y su gemela, una ausencia que no se cruza (acaba justo a la hora de inicio): `[]`.
12. Franjas adyacentes y una cita que las cruza: fuera.

#### 1.A.3 · Banco `scripts/rls/37-disponibilidad-por-centro.sql`

- Lleva fijación propia, con variables de sufijo 37 y uuids de prefijo `05500037-…`.
- Ancla temporal: `extract(year from now())::int + 15`. Las fechas son lunes, sábados, etc. de ese año, calculadas con `isodow`.
- Profesionales propios PRO37A y PRO37B, creados insertando en `auth.users` con la metadata de rol y centro, igual que el módulo 34. Pertenecen a CA. PRO37B es el que tiene la pertenencia cerrada.

Bloques del banco, cada negativa con su gemela positiva:

1. **Catálogo.**
   - Existen `disponibilidad_franja_centro_ck` y `disponibilidad_franjas_sin_solape`, y el disparador `fijar_disponibilidad`.
   - Las tres políticas, con su `qual` sin la rama de técnico. Se comprueba que el técnico no lee, no la cadena.
   - `agenda_horario_del_dia` es `prosecdef` con `proconfig` igual a `search_path=""`, con execute para authenticated y sin execute para public ni anon.
   - `franjas_vigentes` sin execute para authenticated.
   - Hay **una** `agenda_crear_cita`, con 12 argumentos.
2. **Check.**
   - Franja sin `centro_id`: 23514. Gemela: con centro, pasa.
   - Franja sin `desde`: 23514.
   - Ausencia sin centro: pasa (gemela).
3. **Exclusión.**
   - Solape de 10–12 sobre 9–14, el mismo día, centro y vigencia: 23P01.
   - Gemelas que pasan:
     - la adyacente, de 14 a 18;
     - la misma hora en CB, con PRO37A dado de alta en CB;
     - vigencias disjuntas: una con `hasta = Y-03-01` y otra con `desde = Y-03-02`.
   - Vigencias que se tocan el mismo día: 23P01.
4. **Disparador.**
   - Una franja insertada en CA con zona `Atlantic/Canary` queda con `zona_horaria_centro(:CA)`.
   - `creado_por` falsificado queda en `auth.uid()`.
   - Cambiar `perfil_id`, `centro_id` o `tipo` en UPDATE: 42501.
   - Cambiar `hasta`: pasa.
   - Una franja en un centro sin pertenencia: 22023. Su gemela es la ausencia en ese centro, que pasa.
5. **RLS.**
   - Como TEC1, `contar('select … from disponibilidad')` es 0. El ADM ve todas. PRO1 ve solo las suyas, y 0 de PRO37A.
   - TEC1 inserta una ausencia propia: 42501.
   - PRO1 inserta para PRO37A: 42501.
   - PRO37A inserta la suya: pasa.
6. **Bloques.**
   - `agenda_bloques_profesional` de PRO37A en CB no ofrece las franjas de CA.
   - Antes de `desde` y después de `hasta` no ofrece nada; dentro, sí.
   - Al cerrar la pertenencia de PRO37B en CA, sus franjas dejan de ofrecerse. Gemela: antes de cerrarla, sí.
   - Zona: una ausencia parcial de PRO37A con `centro_id` nulo y `zona_horaria = 'Atlantic/Canary'`, de 10:00 a 11:00, bloquea el hueco de las 10:00 **de pared en CA**, no el de las 11:00.
7. **`agenda_horario_del_dia`.**
   - TEC1, que es de CA, recibe un jsonb con `franjas` y `bloqueos`. TEC2, que no es de CA, recibe 42501.
   - Con la sesión nula, 42501.
   - Una ausencia con `motivo = 'Secreto37'`: `position('Secreto37' in resultado::text) = 0`. Las claves de cada bloqueo son exactamente `{tipo, inicio, fin}`.
8. **`agenda_crear_cita`.**
   - En un día con festivo de PRO37A y sin la marca: 22023, con el fragmento «festivo o ausencia».
   - El mismo con `p_aceptar_aviso => true`: crea la cita.
   - Fuera de franja, sin la marca: crea la cita (D2).
   - TEC1 con la marca en CA: la crea.
   - Una cita creada en festivo con la marca deja su fila en `auditoria`.

Al final, `reset_sesion()`. El README del banco recibe la fila del módulo 37, Y+15 en la tabla de anclas y la línea de comprobación del año propio. Anclas usadas hasta ahora: +1, 3, 4, 6–14 (la 14 es del banco 36 de T-053).

#### 1.A.4 · Siembra (`supabase/seed-completo.sql`, justo después del bloque del festivo, línea ~538)

```
-- DATOS INVENTADOS (T-055): el propietario no ha entregado el horario de sus centros.
```

- Dos franjas de Ana (`k_ana`) en `k_c_canarias`, los sábados (`dia_semana = 6`), con ids `e0550001-0000-4000-8000-00000000000{1,2}` y `on conflict (id) do nothing`:
  - de 16:00 a 19:00, `desde current_date - 7`, `hasta current_date + 13`;
  - de 10:00 a 14:00, `desde current_date + 14`, `hasta null`.
- `zona_horaria` se pasa como `'Atlantic/Canary'`; el disparador la fija igualmente.
- Ana ya pertenece a Canarias por la fila `a0080008…`, sembrada antes. Si al implementar el orden no es ese, la franja falla con 22023 y la siembra se reordena; nunca se quita la exigencia.
- El nombre de la variable del centro (`k_c_canarias` u otro) se lee en la siembra.

#### 1.A.5 · Mutantes (`tickets/T-055/mutantes/Mxx.sql` y `tickets/T-055/mutantes.json`)

Cada mutante es un fichero SQL que se aplica dentro de `begin … rollback`, antes del banco:

```
( echo "begin;"; cat tickets/T-055/mutantes/M01.sql; cat scripts/rls/00-ayudantes.sql scripts/rls/01-fijacion.sql scripts/rls/37-disponibilidad-por-centro.sql; echo "rollback;" ) | docker exec -i supabase_db_Psicogestion psql -U postgres -v ON_ERROR_STOP=1
```

Tiene que salir con un código distinto de 0 en la aserción anotada. El JSON tiene la forma `{ "ticket": "T-055", "metodo": "<el comando>", "mutantes": [{ "id", "cambio", "cae" }] }`.

| id | Cambio | Debe caer en |
|---|---|---|
| M01 | `drop constraint disponibilidad_franja_centro_ck` | franja sin centro → 23514 |
| M02 | `drop constraint disponibilidad_franjas_sin_solape` | solape → 23P01 |
| M03 | Exclusión recreada con horas `'[]'` | gemela adyacente 14–18 |
| M04 | Lectura reabierta (`using (true)`) | TEC1 cuenta 0 |
| M05 | `franjas_vigentes` sin la pertenencia | PRO37B con pertenencia cerrada |
| M06 | `franjas_vigentes` sin `hasta >= p_fecha` | después de `hasta` no ofrece |
| M07 | `franjas_vigentes` con `centro_id is null or =` (sin el check, M01 incluido) o con `centro_id` cualquiera | bloques de CB no ofrece CA |
| M08 | `agenda_crear_cita` que ignora `p_aceptar_aviso` (siempre rechaza) | festivo con marca crea |
| M09 | `agenda_crear_cita` que nunca rechaza | festivo sin marca → 22023 |
| M10 | `agenda_horario_del_dia` que añade `'motivo', d.motivo` | «Secreto37» no aparece |
| M11 | Disparador sin la asignación de la zona | zona fijada a la del centro |
| M12 | Disparador sin `creado_por := auth.uid()` | `creado_por` falsificado |
| M13 | `disponibilidad_alta` con `perfil_id = auth.uid()` sin el rol | TEC1 inserta → 42501 |
| M14 | Bloques con `d.zona_horaria` en la ausencia parcial | ausencia de Canarias evaluada en CA |
| M15 | `agenda_horario_del_dia` sin la puerta del técnico | TEC2 → 42501 |

La pasada final es el banco entero (`npm run test:rls`) sin mutantes: exit 0.

#### 1.A.6 · Documentación

- `docs/architecture.md`, matriz de quién ve qué, fila nueva: «Disponibilidad (franjas y ausencias) | Todas, las escribe | La suya, la escribe | Solo por las funciones de agenda de sus centros, sin motivo».
- `lib/supabase/tipos-bd.ts` con `npm run tipos`.

### 1.B · T-055b

1. **`lib/citas/horario.ts`**: `leerHorarioDelDia(sesion, {profesionalId, centroId, fecha}) → Promise<{ok:true, horario:HorarioDelDia} | {ok:false, mensaje}>`. Valida la salida de `agenda_horario_del_dia` con un esquema Zod `esquemaHorarioDelDia`, `.strict()` en cada objeto: si la base añade una clave, falla, en lugar de dejarla pasar. Prueba en `horario.test.ts` con un cliente simulado: salida válida, clave extra que se rechaza, error de la RPC.
2. **`lib/citas/esquemas.ts`**: `esquemaAltaCita` añade `aceptarAviso: z.boolean().default(false)`. El mismo esquema se usa en cliente y en servidor.
3. **`lib/citas/alta.ts`**: `crearCitaSuelta` pasa `p_aceptar_aviso: datos.aceptarAviso`. No hay otro cambio.
4. **`guardarAlta`** (`app/(app)/agenda/nueva/acciones.ts`):
   - En la cita suelta, antes de crear: `leerHorarioDelDia` y luego `avisosDeHorario` con la duración del tipo de terapia. Si hay avisos y `aceptarAviso` es falso, devuelve `{ ok:false, motivo:'aviso_horario', avisos }` sin crear nada. Si es verdadero, crea.
   - `avisos` solo lleva lo que da la pura: tipo y horas, nunca un motivo.
   - En la serie no cambia nada: el festivo de la primera sesión sigue dando 22023, que se traduce con `errores.ts`.
5. **`lib/citas/errores.ts`**: el fragmento nuevo «tiene festivo o ausencia» se traduce como «Ese día el profesional tiene festivo o ausencia. Confírmalo para agendar igualmente.». `errores.test.ts` lee también `supabase/migrations/20261019120000_disponibilidad_por_centro.sql` en su lista de migraciones, para que el texto exista en SQL.
6. **Formulario de alta** (`app/(app)/agenda/nueva/`):
   - `Elegido` pasa a `{ clave; etiqueta; origen: 'hueco' | 'otraHora' }`.
   - `otra-hora.tsx` (cliente): un `input type=date` y un `input type=time step=300`, cada uno con su etiqueta, y el botón «Usar esta hora», que fija `fecha` y `horaLocal` con `origen:'otraHora'`.
   - `aviso-horario.tsx`: se calca de `aviso-hueco-raro.tsx`. Es un `<section aria-labelledby>` con encabezado `tabIndex={-1}` que recibe el foco al aparecer. Pinta una línea por aviso, a partir de i18n, y dos botones: «Agendar igualmente», que reenvía con `aceptarAviso: true`, y «Elegir otra hora», que cierra el aviso y devuelve el foco a «Otra hora».
   - **Trampas**: el efecto de recálculo (`:168-172`) y el salto de semana o el hueco raro al guardar (`:318-330`) se saltan si `elegido.origen === 'otraHora'`. Si no, el recálculo desmarca la hora a mano y Guardar la descarta.
7. **Ajustes › Horario** (`app/(app)/ajustes/horario/page.tsx`, `acciones.ts`, `tabla-franjas.tsx`, `formulario-franja.tsx`):
   - El servidor resuelve la sesión: el técnico recibe `notFound()`; el profesional se ve a sí mismo; el administrador elige con un selector por `?profesional=<uuid>`, validado como uuid y como profesional existente.
   - Lista las franjas por centro, solo de los centros con pertenencia vigente, que lee `lib/citas/franjas.ts` con el cliente de sesión, sujeto a RLS.
   - Tres acciones Zod: añadir; corregir (solo si `desde > hoy` en la zona del centro, comprobado en servidor); cerrar, que pone `hasta`, una fecha no anterior a hoy-1.
   - Mensajes para los errores: 23P01 «Se solapa con otra franja de ese día.», 22023 «No pertenece a ese centro.» y 23514 «Falta el centro o la fecha de inicio.».
   - `app/(app)/ajustes/page.tsx` enlaza «Horario» para el profesional y el administrador, no para el técnico.
8. **Si P3 = sí**: `dialogo-reprogramar.tsx`, al cambiar la fecha o la hora, pide a una acción nueva `avisoDeHorario` (en `app/(app)/agenda/acciones.ts`), que devuelve los avisos de la pura, y los pinta como texto `role="status"`. No bloquea ni pide confirmación: `agenda_actualizar_cita` no mira festivos y no cambia.
9. `docs/interfaz.md`: «Otra hora», el aviso y Ajustes › Horario.

## 2 · Decisiones y alternativas descartadas

- **D1. El técnico no lee la tabla; ve el horario por funciones definer sin `motivo`.** Descartado dejarle leer la tabla y ocultar el motivo con una vista: sería una segunda puerta que la RLS no cierra.
- **D2. La franja no prohíbe; solo festivo o ausencia piden confirmación en la base.** Descartado exigir `p_aceptar_aviso` también fuera de franja: obliga a duplicar en SQL el cálculo de la pura y no protege nada, porque fuera de horario no hay dato sensible.
- **D3. El aviso se calcula en servidor (`guardarAlta`) con la función pura.** Descartado calcularlo solo en cliente: un envío directo a la acción se saltaría el aviso.
- **D4. La exclusión es por (perfil, centro, día).** Descartado prohibir el solape entre centros: las horas de pared de dos zonas no se comparan, y la cita ya bloquea el hueco en todos los centros.
- **D5. La zona es siempre la del centro, y la columna queda fijada y vestigial.** Descartado borrar `zona_horaria`: es destructivo y no hace falta (CLAUDE.md, migraciones solo hacia delante).
- **D6. La pertenencia se exige al crear una franja y al leerla en bloques.** Exigirla solo al crear no basta: una baja de centro dejaría huecos ofrecidos.
- **D7. Sin DELETE.** Una franja se cierra con `hasta`. Se conserva qué horario valía cada día.
- **D8. Partir en a y b.** El esquema y la RLS tienen un banco y mutantes propios. La interfaz no toca la base y puede ir en paralelo con T-056a.
- **D9. `drop` + `create` de `agenda_crear_cita`, no un overload.** Dos funciones con el mismo nombre rompen los bancos 21 y 23 y abren una puerta sin el parámetro.

## 3 · Cómo se cierra cada criterio de aceptación

| Criterio | Comprobación |
|---|---|
| a · test:rls sobre reset | `npx supabase db reset && npm run test:rls`; exit 0; `select max(version) from supabase_migrations.schema_migrations` = `20261019120000`; el log lista el módulo 37 |
| a · banco sobre la siembra | `npx supabase db reset && npm run seed && npm run test:rls`; exit 0 |
| a · mutantes | el bucle de §1.A.5 sobre M01–M15, cada uno con exit ≠ 0 y la aserción anotada; después, `npm run test:rls` en verde |
| a · pura | `npx vitest run lib/agenda/aviso-horario.test.ts`; los 12 casos de §1.A.2 |
| a · suite | `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx tsc --noEmit`, `npx next build --webpack` y `npm run verificar:huellas` («cadena íntegra») |
| a · QA | `qa.mjs visita /agenda/nueva` como Ana en Las Palmas: el sábado anterior a hoy+14 da huecos de 16:00 a 18:10; el posterior, de 10:00 a 13:10. Como técnico de Madrid: huecos en Madrid. La consola, limpia |
| b · componente y acción | vitest de `aviso-horario.tsx`, `otra-hora.tsx` y `acciones` de alta: foco en el encabezado; «Agendar igualmente» llama con `aceptarAviso: true`; el recálculo conserva `origen:'otraHora'`; el resultado de acción del técnico no contiene `motivo` (una prueba que serializa el resultado y busca la clave) |
| b · errores | `npx vitest run lib/citas/errores.test.ts` |
| b · suite | la misma de a, más `npm run test:rls` sin cambios |
| b · QA | `qa.mjs visita /agenda/nueva /ajustes/horario` a 1280 y 360 px, como en el contrato; el «Festivo local» de Ana es el sembrado en `seed-completo.sql:533` |

## 4 · Riesgos, por probabilidad

1. **Alta.** El banco 23 nombra la firma de 11 argumentos y falla tras el `drop`. Se actualiza en T-055a (§1.A.1.10); hay que buscar cualquier otro `regprocedure` de `agenda_crear_cita` con grep.
2. **Alta.** El recálculo del formulario desmarca la hora a mano (`:168-172`). La prueba de T-055b que lo cubre es obligatoria.
3. **Media.** T-053 u otra migración redefine `agenda_crear_cita` o bloques antes de que esto entre. Se parte de la última redefinición, con `rg -n "function public.agenda_crear_cita" supabase/migrations`.
4. **Media.** Algún banco inserta franjas sin centro o sin `desde`, o una franja de un profesional sin pertenencia vigente. La guarda previa no lo ve, porque los bancos corren después del reset; lo ve el disparador o el check. Se corrige el banco y se añade al territorio.
5. **Media.** Postgres rechaza la expresión de la exclusión por no inmutable. Se usa el ayudante `rango_de_horas`.
6. **Baja.** Cambia la zona de un centro con franjas ya escritas. Las funciones leen la del centro; la columna queda vieja hasta el próximo UPDATE. Es aceptable: la columna es vestigial.
7. **Baja.** El banco entero tarda unos 4 minutos por el módulo 34. El verificador tiene que dar un timeout de 600 s.
8. **Baja.** El número de migración queda ocupado: se renumera.

## 5 · Qué revisar

- **Entradas que elige el llamante**:
  - `agenda_horario_del_dia(profesional, centro, fecha)`: un técnico de CB que pide el horario de un profesional de CA tiene que recibir 42501; un profesional que pide el de otro, también, salvo si es técnico del centro. Comprobar que la puerta es la de bloques, letra por letra.
  - `p_aceptar_aviso`: cualquiera que pueda crear la cita puede marcarlo. Es intencionado (decisión del propietario: avisa y deja); el revisor tiene que ver que la marca solo salta el bloqueo de festivo o ausencia y ninguna otra comprobación (solape, rol, centro, paciente).
  - `zona_horaria` y `creado_por` en el INSERT: el disparador los sobrescribe. Mutantes M11 y M12.
- **Pruebas que deben fallar y por qué**:
  - el solape de 10–12 sobre 9–14 cae por 23P01, no por el check;
  - la franja sin pertenencia cae por 22023 del disparador, no por RLS;
  - la del técnico que inserta cae por 42501 de RLS. Si cayera por el disparador, la política estaría mal escrita.
- **Otras puertas**:
  - `centro_id` nulo en una franja: lo cierra el check;
  - `hasta` nulo en la exclusión: rango sin fin, que solapa con todo lo posterior; tiene que haber una prueba;
  - UPDATE que mueve una franja a otro centro: 42501;
  - UPDATE de `dia_semana` u horas sobre una franja que ya ha empezado: la base lo permite, y solo la acción de T-055b lo limita a `desde > hoy`. Revisar que la acción lo comprueba en servidor;
  - DELETE: sin grant, y una prueba lo intenta y espera 42501;
  - TRUNCATE: sin grant, que no cambia;
  - una tabla completa vía PostgREST como técnico: 0 filas.
- `franjas_vigentes` no tiene execute para authenticated. Si lo tuviera, sería invocadora y respetaría RLS, pero no tiene que ser API.
- `agenda_bloques_profesional` cambia en tres sitios y en ningún otro: hay que hacer un diff contra `20261012120000` y comprobarlo.
- La pura: sin `new Date()` ni `Date.now()`; la zona llega como dato; el caso de Canarias usa una hora que `clasificarHoraLocal` da por inexistente.
- La salida de `agenda_horario_del_dia` no tiene `motivo` (M10), y el Zod de T-055b es `.strict()`.
- La siembra lleva el comentario «DATOS INVENTADOS» y es idempotente: `npm run seed` dos veces sin error.

## 6 · Territorio

El que declara el contrato, más `scripts/rls/23-cita-en-episodio.sql` (en T-055a: la firma de `agenda_crear_cita`) y cualquier banco que haya que corregir por §4.4, que se anota en la bitácora.

## 7 · Delegable

- **T-055a: nada.** Esquema, RLS, banco, mutantes y la pura que decide un criterio.
- **T-055b**:
  - claves de i18n de «Otra hora», el aviso y Ajustes › Horario. Nivel `rapido`; salida `lib/i18n/es.ts`; contexto: la lista de claves de §1.B, que la fija el implementador antes de encargarlo; comprobación `npx tsc --noEmit`;
  - `app/(app)/ajustes/horario/tabla-franjas.tsx`, la tabla que solo pinta franjas por centro (Server Component, sin estado ni eventos). Nivel `rapido`; contexto: el tipo `FranjaDeAjustes` de `lib/citas/franjas.ts` y una tabla vecina (`app/(app)/ajustes/centros/`); comprobación `npx tsc --noEmit && npm run lint`.

## Lo que no entra, y por qué

- Festivos de centro y cierres: son T-056.
- El aviso en las series y la alternativa dentro de franja: preguntas 2 y 4; cambian T-011.
- DELETE de franjas (D7), franjas que cruzan la medianoche (el check de T-010) y el solape entre centros (D4).
- Borrar `disponibilidad.zona_horaria` (D5).
- Exigir la confirmación fuera de franja en la base (D2).

## Gate del propietario (17-10-2026)

- Diseño y partición en T-055a y T-055b: **aprobados, implementa**.
- P1: cada profesional edita sus franjas y el administrador las de todos; el técnico no: **sí**.
- P2: la primera sesión de una serie en festivo se sigue rechazando: **sí** (la serie no cambia).
- P3: mover una cita fuera de horario o a un festivo avisa como texto dentro del diálogo, sin paso de confirmación, en T-055b: **sí**.
- P4: las alternativas de serie no se ajustan a franja en este ticket: **sí**.
- Siembra: horario **inventado** hasta que el propietario entregue el real.
