**Sin hallazgos ALTA.** 0 ALTA · 1 MEDIA · 4 BAJA.

# T-041 · Revisión A (base de datos, RLS y seguridad) — ronda 1

- Diff: `git diff main...worktree-agent-ada3a424c2ef63d80`, base común `afbbfcc`, HEAD `9e0033c`.
- Mi parte:
  - `supabase/migrations/20261010120000_altas_de_centro.sql`;
  - `scripts/rls/28-altas-de-centro.sql` y su línea del README;
  - `supabase/seed-completo.sql`;
  - `lib/supabase/tipos-bd.ts`;
  - `lib/cuentas/{altas,invitar}.ts`, solo lo que llama a la base;
  - `docs/architecture.md`.
- La interfaz es del revisor B.
- Todo medido en la base compartida dentro de `begin … rollback`, sin `db reset`.
- Mutantes: cada uno con `create or replace` del cuerpo mutado justo después del `begin`, seguido del banco entero (`scripts/rls/*.sql` del worktree) y `rollback`.
- Línea base: el banco entero en verde, con «28-altas-de-centro: completo.».

## Lista «Qué revisar» del diseño (§5), lo que me toca

| Punto | Resultado |
|---|---|
| Destino técnico → 22023 | Sí. Lista cerrada `not in ('profesional_sanitario','administrador')` en las dos RPC (`:60`, `:145`). Lo prueba F1, y G2/G3 la leen del catálogo. El mutante `= 'tecnico_administrativo'` muere en G2. |
| Destino suspendido **o de baja** → 23514 | El código sí lo cumple (`v_estado <> 'activo'`, `:66`). El banco solo prueba `suspendido`. Ver **A-H3**. |
| Centro inactivo → 23514 | Sí (`:78`, F4). |
| Sin parámetro `p_principal` | Sí. La firma es `(uuid, uuid)` (G5) y la marca la calcula la función (`:93-97`). |
| `retirar` no cierra filas de otro par: el `where` lleva `perfil_id`, `centro_id` y `hasta is null` | El código sí (`:151-155`). Pero quitar `hasta is null` deja el banco verde. Ver **A-H1**. |
| Gemela del criterio 1: 23514 **con** el texto de 7c | Sí (A3, B3 y B5 con `assert_lanza_codigo_msg`). |
| Criterio 3: 42501 y la fila no cambia | Sí (C1-C5). El mutante `<>` por `is distinct from` muere en C6, tanto en `dar` como en `retirar` (medido). |
| Criterio 4: recuento global igual al de antes, el de P41 a 0 y la gemela de PRO1 | Sí (D0/D2/D3/D5). La versión de coterapia de PRO1 en el episodio de C41A existe (D5 = 1) y ADM no la ve. |
| Disparador: un mutante por comprobación | Medido. Sin `old.hasta is not null` muere en E1. El de `centro_id` lo midió el implementador (README). **Sobrevive** el de `id`: ver **A-H5**. |
| Nulos: `rol_actual()` nulo → 42501 y `p_centro_id` nulo → 23503 | Sí (C6, F3). `centro_id` es `not null` desde 0829. |
| Duplicados: dar dos veces deja una fila (D6) | Sí (F7). Pero la idempotencia no distingue lo cerrado de lo vigente. Ver **A-H1**. |
| Concurrencia: `for update` (D7) | El código lo tiene (`:54`, `:138`). Ninguna prueba lo defiende. Ver **A-H4**. |
| Sin `grant delete`/`truncate` a `authenticated` | Sí (G7). La migración no añade grants de tabla ni políticas. |
| `revoke … from public, anon`, y `search_path = ''` con todo cualificado | Sí: `public.` en todos los nombres, y el `execute` de la función del disparador revocado también a `authenticated`. |
| `fn_exigir_episodio_coherente_en_nota` sin tocar | Sí: un solo fichero de migración nuevo, sin `create or replace` de 7c. |
| Llamada con `sesion.supabase`, nunca con la clave de servicio | Sí (`altas.ts`, `invitar.ts` paso 4). |
| TRUNCATE y DELETE como `postgres` | Aceptado en el diseño. No lo elevo: `perfiles_centros` no está en la invariante 6. |

## Mutantes medidos (banco entero)

| Mutante | Resultado |
|---|---|
| M1 · `dar`: `is distinct from` → `<>` | Muere en 28.C6 (sale 23514 en lugar de 42501) |
| M1b · `retirar`: ídem | Muere en 28.C6 («debía lanzar 42501 y no lanzó nada») |
| M2 · `dar`: lista cerrada → `= 'tecnico_administrativo'` | Muere en 28.G2, solo en el catálogo, como pedía el diseño |
| M10 · disparador sin `old.hasta is not null` | Muere en 28.E1 |
| M3 · `dar`: `<> 'activo'` → `= 'suspendido'` | **Sobrevive** (A-H3) |
| M4 · `dar`: idempotencia sin `hasta is null` | **Sobrevive** (A-H1) |
| M5 · `retirar`: `where` sin `hasta is null` | **Sobrevive** (A-H1) |
| M8 · `dar`: cálculo del principal sin `hasta is null` | **Sobrevive** (A-H1) |
| M6 · `dar` sin `for update` | **Sobrevive** (A-H4) |
| M11 · `retirar` sin `for update` | **Sobrevive** (A-H4) |
| M7 · disparador sin `new.id is distinct from old.id` | **Sobrevive** (A-H5) |

## MEDIA

- **A-H1** `scripts/rls/28-altas-de-centro.sql:400`
  - **Qué pasa:** el banco nunca recorre el ciclo «dar → retirar → volver a dar → retirar» en el mismo par. Por eso sobreviven los tres mutantes que quitan `hasta is null`:
    - la idempotencia (M4, `migración:86`);
    - el `where` de `retirar` (M5, `:155`), que el diseño §5 nombra expresamente;
    - el cálculo del principal (M8, `:97`).
  - **Escenario M5:**
    1. ADM retira a Ana de Canarias el lunes y se la vuelve a dar el jueves. Hay dos filas del par: una cerrada y una vigente.
    2. Al volver a retirarla, el `update` también toca la fila cerrada.
    3. El disparador lanza 42501 «Una pertenencia cerrada no se modifica».
    4. `altas.ts` traduce el 42501 como si el problema fuera el permiso, y el alta ya no se puede retirar nunca.
  - **Escenario M4:** al volver a dar el alta, la función devuelve el id de la fila cerrada y no inserta nada. La pantalla dice «alta dada», pero 7c le da a Ana 23514 al ponerla de coprofesional.
  - **Escenario M8:** a INV2 se le retira el principal (F10) y luego se le da otro centro. La fila nueva entra como no principal, cuando el diseño dice «la primera alta sin principal vigente lo es». El perfil queda sin principal y sus pacientes futuros, sin centro.
  - **Arreglo:** una sola prueba con el ciclo completo sobre un par mata los tres mutantes. Debe comprobar:
    - id distinto al volver a dar;
    - dos filas del par, una cerrada y una vigente;
    - el segundo `retirar` pasa y cierra la vigente;
    - tras F10, la siguiente alta es principal.

## BAJA

- **A-H2** `supabase/migrations/20261010120000_altas_de_centro.sql:185`
  - **Qué pasa:** el disparador «solo cierre» congela la fila después de cerrarla, pero deja que el cierre lleve cualquier fecha que pase los checks, incluida una anterior a lo que ocurrió con esa alta.
  - **Medido:** en `begin … rollback`, `update perfiles_centros set hasta = desde` sobre una fila vigente con `desde = 2026-09-01` pasa (UPDATE 1).
  - **Quién puede:** `authenticated` tiene UPDATE sobre las 7 columnas y la política `perfiles_centros_cierre_administrador` deja hacerlo al administrador.
  - **Escenario:**
    1. Ana es coprofesional en notas firmadas el 20-09 en un episodio de Madrid, con alta vigente en Madrid.
    2. El 05-10 un administrador hace `PATCH /perfiles_centros?id=eq.X {"hasta":"2026-09-01"}`.
    3. La pertenencia dice ahora que Ana no tenía alta en Madrid cuando se firmaron esas notas, y la fila queda congelada así para siempre.
  - **Por qué BAJA:** la auditoría guarda el UPDATE con su instante real, y antes de este ticket el UPDATE era libre del todo. No es una regresión, pero la garantía nueva («de una vigente solo cambia el cierre») no cubre el *cuándo*.
  - **Arreglo:** exigir `new.hasta is null or new.hasta = current_date` en el disparador (la RPC ya usa `current_date`), o decidir y anotar que fechar el cierre en el pasado es legítimo.
- **A-H3** `scripts/rls/28-altas-de-centro.sql:381`
  - **Qué pasa:** el diseño §5 pide «suspendido **o de baja** → 23514», y F6 solo prueba `suspendido`. El mutante `if v_estado = 'suspendido'` (M3) deja el banco verde.
  - **Escenario:** con el mutante, ADM llama a `rpc/dar_alta_centro` sobre un perfil de baja y la función inserta un alta vigente.
    - Si es su primera alta, entra como principal y el espejo le escribe `perfiles.centro_id`.
    - El perfil de baja aparece como «con alta» en lo que lea `perfiles_centros`.
  - **Arreglo:** una prueba F6 con un perfil `estado = 'baja'`.
- **A-H4** `supabase/migrations/20261010120000_altas_de_centro.sql:54`
  - **Qué pasa:** D7 (el `for update` sobre `perfiles`) no tiene ninguna prueba. Quitarlo de `dar` (M6) o de `retirar` (M11, `:138`) deja el banco verde. El banco ya lee el catálogo para `is distinct from` (G4), así que la misma técnica sirve aquí.
  - **Escenario:** alguien quita el `for update` en una refactorización y el banco sigue verde. Después, dos administradores (o dos pestañas) dan a la vez la primera alta a un perfil sin principal:
    1. las dos ven «no hay principal» e insertan `principal = true`;
    2. la segunda choca con `perfiles_centros_un_principal_vigente`;
    3. sale el 23505 «Otro cambio se ha cruzado con este», que D7 quería dejar solo como red.
  - **Arreglo:** una aserción G con `pg_get_functiondef(...) ~* 'for update'` para las dos RPC.
- **A-H5** `supabase/migrations/20261010120000_altas_de_centro.sql:185`
  - **Qué pasa:** el cotejo `new.id is distinct from old.id` no tiene prueba negativa. E2 y E3 cubren `centro_id`, `desde`, `perfil_id` y `creado_en`, pero no `id`, y el mutante sin esa línea (M7) deja el banco verde.
  - **Escenario:** con el mutante, ADM hace `PATCH /perfiles_centros?id=eq.X {"id":"<uuid nuevo>"}` (el UPDATE de `authenticated` cubre `id`).
    - La fila vigente cambia de identidad.
    - El INSERT de la auditoría (`registro_id = X`) ya no apunta a ninguna fila.
    - El rastro del alta (ADR-051) pierde su enlace.
  - **Arreglo:** una línea más en E3 con `set id = gen_random_uuid()` → 42501.

## Comprobado sin hallazgo

- **Orden de las guardas.** El rol va antes del bloqueo y de la búsqueda: un no administrador no bloquea filas de `perfiles` ni distingue «no existe» de «no puedes».
  - Después vienen la existencia (23503), la lista cerrada (22023), el estado (23514), el centro (23503/23514), la idempotencia y el insert.
  - `retirar` no mira el estado del destino, como dice el diseño.
- **Columnas de `perfiles`.** Las RPC no escriben ninguna. El espejo lo hace el disparador ya existente, y G1 es la alarma ADR-065.
- **Disparador.** Es `security invoker`, con `search_path = ''`, `before update for each row`, y su función no la ejecuta nadie.
  - Sin `grant delete`, el DELETE de `authenticated` da 42501 (E5).
  - El cierre por la RPC deja su UPDATE auditado con actor ADM (E8).
- **Otros escritores de la tabla.** Ninguna migración ni nada de `app/` o `lib/` actualiza `perfiles_centros`, así que el disparador no rompe ninguna ruta existente.
  - `scripts/rls/12` y `19` cierran filas vigentes y pasan.
  - `scripts/t002-enmienda-multicentro.sql` queda fuera de CI.
- **El alta no amplía la lectura de notas.** Todas las referencias a `centros_actuales()` están acotadas a `rol_actual() = 'tecnico_administrativo'`, salvo `episodio_para_nota` (`20261007…:808`), que solo valida el centro del episodio que uno abre para sí.
  - El texto nuevo de `architecture.md` («Un alta de centro no amplía la matriz» y el punto de `centros_actuales()`) coincide con eso.
- **Siembra.** La fila de ADM en Madrid es `principal = true` con id fijo y `on conflict do nothing`.
  - ADM no tiene pacientes, así que el principal no mueve la retención de nadie.
  - Su `desde` (01-09-2026) pasa los checks.
- **`tipos-bd.ts`.** Las dos firmas coinciden con la migración (`string` y `undefined`).
- **`altas.ts`.** Traduce por SQLSTATE y solo deja pasar el texto de la base en el 23514, que es un texto propio. El 42501, el 22023 y el P0002 llevan su propio literal.

---
