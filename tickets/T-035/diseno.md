# T-035 · Diseño: el centro del episodio se congela con notas, y el director sanitario puede ser coprofesional

Arquitecto, 02-10-2026. Contrato: `tickets/T-035-centro-congelado-y-coprofesional-director.md`.
Ley: ADR-073 (puntos 1 y 2), ADR-072 y ADR-065. Hallazgos que cierra: SQL-H3 y SQL-H4 de
`tickets/T-034/revision-sql.md`. La base local estaba ocupada y no se ha usado. Todo lo de §0
sale de leer los ficheros.

---

## 0 · Hechos verificados contra el código

**Funciones que se re-emiten**

| # | Hecho | Dónde |
|---|---|---|
| H1 | Solo una migración define `fn_exigir_episodio_coherente_en_nota()` y `fn_congelar_episodio_con_notas()`. Ninguna posterior las redefine: `20261001…`, `20261002…` y `20261003…` tocan la firma y el borrador, no estas. | `supabase/migrations/20260929120000_nota_siempre_en_episodio.sql` |
| H2 | `fn_congelar_episodio_con_notas()` es `plpgsql`, `security definer`, `set search_path = ''`. Lanza 42501 con `'El episodio % tiene notas: su paciente y su profesional no cambian (ADR-071, T-034)'` si `exists (select 1 from public.notas_clinicas n where n.episodio_id = old.id)`. | ídem, líneas 202-216 |
| H3 | Su disparador es `congelar_episodio_con_notas`: `before update of paciente_id, profesional_id`, con `when (new.paciente_id is distinct from old.paciente_id or new.profesional_id is distinct from old.profesional_id)`. **`centro_id` no aparece ni en `update of` ni en el `when`**: ese es el hueco SQL-H3. | ídem, líneas 218-223 |
| H4 | Paso 7b de `fn_exigir_episodio_coherente_en_nota()`: `if v_rol is distinct from 'profesional_sanitario'::public.rol_usuario then raise … 'El coprofesional tiene que ser un profesional sanitario (ADR-072)' using errcode = '23514'`. Ese es el hueco SQL-H4. 7c exige alta vigente (`hasta is null`) en `e.centro_id` y rechaza también un episodio sin centro. | ídem, líneas 118-152 (7b en 132-135) |
| H5 | El paso 3 lee el episodio con `… from public.episodios_asistenciales ea where ea.id = new.episodio_id for share`. El paso 5 lee el participante con `for share`. La prueba 19.48 lo comprueba con una regex sobre `pg_get_functiondef`, así que **la re-emisión tiene que conservar ese texto**. | ídem, y `scripts/rls/19-nota-en-episodio.sql:589-596` |
| H6 | Los `revoke execute … from public, anon, authenticated` de las dos funciones están en las líneas 392-393. Los comentarios que hay que reescribir son `notas_clinicas.coprofesional_id` («Profesional sanitario distinto del autor…», 404-409), `fn_exigir_…` («coprofesional profesional sanitario…», 420-426) y `fn_congelar_episodio_con_notas` (428-429). | ídem |
| H7 | Ningún fichero del repositorio usa `create or replace trigger`. El precedente para re-emitir un disparador es `drop trigger if exists …; create trigger …`. | grep en `supabase/migrations/` |

**Esquema y permisos**

| # | Hecho | Dónde |
|---|---|---|
| H8 | `episodios_asistenciales.centro_id` es `uuid references public.centros (id)`, anulable y sin acción `on delete`/`on update`, es decir, `no action`. Ninguna acción referencial reescribe la columna por debajo. | `20260822094547_…sql:517-529` |
| H9 | `authenticated` tiene `update` sobre la tabla entera. La política `episodios_modificacion` deja escribir a quien está desbloqueado y es asignado del paciente o dueño del episodio. Es la puerta de SQL-H3. No hay `delete`. | `20260822160000_rls_funciones_y_politicas.sql` |
| H10 | Nada fuera del banco escribe en `episodios_asistenciales`: ni la siembra, ni `lib/`, ni `app/`, ni ninguna función de la base. | grep `update public.episodios_asistenciales` en `supabase/`, `lib/`, `app/`, `scripts/` |
| H11 | Dentro del banco, las únicas escrituras sobre episodios están en el módulo 19, y ninguna cambia `centro_id`: 321, 324, 328, 512, 658 y 665. | `scripts/rls/19-nota-en-episodio.sql` |
| H12 | El enum `rol_usuario` tiene tres valores, en este orden: `administrador`, `profesional_sanitario`, `tecnico_administrativo`. `perfiles.rol` es `not null`. | `20260815192424_…sql` |

**ADR-065 y la autoría**

| # | Hecho | Dónde |
|---|---|---|
| H13 | El ADR-065 deja abierto cómo se guarda el director administrativo: «dos columnas, un valor más en el enum, una marca en el perfil». También dice que «no puede ser profesional asignado ni autor de notas». | `docs/decisions/ADR-065*.md` |
| H14 | La autoría no tiene una lista de roles en ningún sitio. `notas_clinicas_alta` exige `historia_desbloqueada() and autor_id = auth.uid() and es_profesional_asignado(paciente_id)`, y `es_profesional_asignado` exige perfil activo. | `20260822160000_…sql` |

**Firma y concurrencia**

| # | Hecho | Dónde |
|---|---|---|
| H15 | `fn_sellar_version_nota` (la última definición) **no lee ni bloquea `episodios_asistenciales`**. Paso 2: `for no key update` sobre la nota. Paso 3: cerrojo consultivo de la cadena. 6.16 coteja el coprofesional con la cabecera, sin mirar el rol. `fn_vaciar_borrador_al_firmar` solo actualiza columnas del borrador, que no están en el `update of` de `exigir_episodio_coherente_en_nota`. | `20261003120000_firma_cotejada_con_borrador_y_cita.sql` |

**Banco de RLS: datos de partida**

| # | Hecho | Dónde |
|---|---|---|
| H16 | Perfiles y centros de partida: ADM (`b0030001-…0001`, administrador) **no tiene ninguna fila en `perfiles_centros`**. TEC1 tiene alta en CA. PROBAJA tiene alta en CA y el módulo 04 lo deja `estado = 'baja'` con un `update` directo como `postgres`. | `scripts/rls/01-fijacion.sql`, `04-baja.sql:52` |
| H17 | Estado de ADM y PRO1 en el módulo 19: la 19.54 fija el PIN de ADM `'333333'` (`como_con_2fa` y `fijar_pin_historia`), y ADM pasa la comprobación de rol de `episodio_para_nota`. La 19.55 cierra el alta de PRO2 en CA y es la última prueba. PRO1 desbloquea con `'111111'`. | `19-nota-en-episodio.sql:713-772` |
| H18 | Aserciones que dependen de los mensajes que cambian: 19.28 y 19.52 buscan `'tiene notas'` (322, 659). 19.35 busca `'tiene que ser un profesional sanitario'` (396). 19.39 busca `'profesional sanitario'` (435). | ídem |
| H19 | `fn_espejar_centro_principal` corre `after insert` sobre `perfiles_centros`. Insertar filas con `principal = false` no mueve el espejo de ningún perfil. | `20260829120000_perfiles_centros_multicentro.sql:103-141` |
| H20 | Todo el banco corre en una sola transacción y se deshace al final. Los módulos van en orden alfabético, y el 20 no usa ni ADM ni TEC1. | `scripts/test-rls.mjs`, `scripts/rls/20-nota-borrador.sql` |

**Tipos, aplicación y T-012**

| # | Hecho | Dónde |
|---|---|---|
| H21 | `lib/supabase/tipos-bd.ts` no lista funciones de disparador, así que re-emitirlas no lo cambia. | `lib/supabase/tipos-bd.ts` |
| H22 | `ROLES_COPROFESIONAL = ['profesional_sanitario'] as const`, con el comentario «T-035 añade `'administrador'` (ADR-073.2) en esta línea y en ningún otro sitio». Su prueba exige `toEqual(['profesional_sanitario'])`. **Ninguno de los dos ficheros está en el territorio de T-035** (véase P-1). | `lib/notas/coprofesional.ts`, `lib/notas/coprofesional.test.ts` |
| H23 | `servidor.ts` filtra los candidatos con `rol in ROLES_COPROFESIONAL`, `estado = 'activo'` y alta vigente en el centro del episodio. `fijarCoprofesional` traduce el 23514 a `coprofesional_invalido` **solo por el código**, no por el mensaje. | `lib/notas/servidor.ts:269-298, 605-621` |
| H24 | La última migración es `20261003120000`. `docs/state.md` pone T-035 primero en la cola de `supabase/`. | `supabase/migrations/`, `docs/state.md` |

---

## 1 · Piezas y contratos

### 1.1 Migración nueva: `supabase/migrations/20261004120000_centro_congelado_y_coprofesional.sql`

Si cuando se implemente `main` ya tiene una marca igual o posterior, se elige la siguiente libre
(regla 5 del linter). Va hacia delante y no es destructiva: no borra tablas, columnas ni tipos, y
`drop trigger` no necesita la marca `-- destructivo:`. Lleva cinco secciones, en este orden.

**§1 · La puerta del centro, en el mismo disparador.**

```sql
create or replace function public.fn_congelar_episodio_con_notas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notas_clinicas n where n.episodio_id = old.id) then
    raise exception
      'El episodio % tiene notas: su paciente, su profesional y su centro no cambian (ADR-071, ADR-073)', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists congelar_episodio_con_notas on public.episodios_asistenciales;
create trigger congelar_episodio_con_notas
  before update of paciente_id, profesional_id, centro_id on public.episodios_asistenciales
  for each row
  when (new.paciente_id is distinct from old.paciente_id
        or new.profesional_id is distinct from old.profesional_id
        or new.centro_id is distinct from old.centro_id)
  execute function public.fn_congelar_episodio_con_notas();
```

Esto responde a lo que pide el contrato:
- **Qué disparador:** `congelar_episodio_con_notas`, el mismo.
- **Errcode:** 42501.
- **Mensaje:** el de arriba. Lo reconocen el fragmento nuevo `'y su centro no cambian'` y el viejo `'tiene notas'` (19.28 y 19.52).
- **Si `update of` cambia:** sí, se añade `centro_id`, y el `when` también.

**§2 · La regla del coprofesional.** Se escribe `create or replace function public.fn_exigir_episodio_coherente_en_nota()`.
- Se **copia literalmente** de `20260929120000…sql:50-152`: cabecera, `declare`, pasos 1 a 7c y `return new`.
- Solo cambia 7b, que queda **exactamente** así (el texto lo fija la prueba 19.62):

```sql
        -- 7b · ADR-073.2: coprofesional es quien puede ser autor de notas. Lista CERRADA
        --      de roles admitidos, nunca «todo salvo el técnico»: un rol nuevo (el director
        --      administrativo del ADR-065) queda fuera hasta que su ticket lo decida aquí.
        --      Si ADR-065 se guarda como marca en el perfil y no como valor del enum, su
        --      ticket añade la condición en este paso.
        if v_rol not in ('profesional_sanitario'::public.rol_usuario,
                         'administrador'::public.rol_usuario) then
          raise exception 'El coprofesional tiene que ser un profesional sanitario o un administrador (director sanitario): quien puede ser autor de notas (ADR-072, ADR-073)'
            using errcode = '23514';
        end if;
```

- El disparador `exigir_episodio_coherente_en_nota` **no se toca**. `create or replace function` conserva su vínculo, y su `update of` (`paciente_id, episodio_id, autor_id, coprofesional_id`) no cambia.
- El mensaje nuevo contiene `'tiene que ser un profesional sanitario'` y `'profesional sanitario'`, así que 19.35 y 19.39 siguen casando.
- Su fragmento único es `'quien puede ser autor de notas'`; un grep confirma que no aparece en ninguna otra migración.
- `v_rol` no puede ser nulo dentro del `if found` (H12), así que `not in` no tiene el caso del nulo.

**§3 · Permisos.** Se re-emiten los dos `revoke` tal cual (H6):
```sql
revoke execute on function public.fn_exigir_episodio_coherente_en_nota() from public, anon, authenticated;
revoke execute on function public.fn_congelar_episodio_con_notas()        from public, anon, authenticated;
```

**§4 · Comentarios.** Se re-emiten los tres de H6.

- `notas_clinicas.coprofesional_id`. Se cambia la frase «Profesional sanitario distinto del autor» por «Quien puede ser autor de notas (profesional sanitario o administrador, director sanitario; ADR-073) y distinto del autor». El resto del texto se queda igual.
- `fn_exigir_episodio_coherente_en_nota()`. Se cambia «coprofesional profesional sanitario» por «coprofesional que puede ser autor de notas: profesional sanitario o administrador, lista cerrada (ADR-073)». La mención de `for share` y de las dos puertas se mantiene.
- `fn_congelar_episodio_con_notas()`. Queda: `'T-034, T-035. Un episodio con notas no cambia de paciente, de profesional ni de centro (42501, ADR-071, ADR-073).'`

**§5 · Nada más.**
- **Políticas:** ni `create policy` ni `alter policy`.
- **Guarda de datos previa:** no hace falta. El punto 2 relaja la regla y no puede invalidar filas existentes. El punto 1 solo afecta a `update` futuros. El ADR-073 afirma que ninguna base real tiene notas.
- **Guarda de prerrequisito:** no hace falta, porque el orden de las migraciones es fijo.

### 1.2 Banco: `scripts/rls/19-nota-en-episodio.sql`

Va un bloque nuevo **después de la 19.55** con las pruebas 19.56 a 19.63, y el `\echo` final pasa a
`(19.1-19.63)`. Ninguna prueba existente se reescribe.

**Variables.** Se definen con `\set` al principio del bloque, con el prefijo `0350001` para que no choquen con `:PE`, `:CC` y el resto.

| Variable | Valor | Qué es |
|---|---|---|
| `C35E` | `c0350001-0000-4000-8000-00000000000e` | Centro E. Tienen alta PRO1, ADM, TEC1 (y PROBAJA si P-2 sale que sí). |
| `C35F` | `c0350001-0000-4000-8000-00000000000f` | Centro F. Solo tiene alta PRO1. |
| `P35A` | `d0350001-0000-4000-8000-000000000001` | Paciente de PRO1, en C35E. |
| `P35B` | `…002` | Paciente de ADM, en C35E. |
| `P35C` | `…003` | Paciente de PRO1, en C35F. |
| `P35D` | `…004` | Paciente de PRO1, en C35E. Su episodio no tendrá notas. |
| `N35A` | `f0350001-0000-4000-8000-000000000001` | Nota. |
| `N35B` | `…002` | Nota. |

**Fijación**, como `postgres`:
- `insert into public.centros` C35E y C35F.
- `insert into public.perfiles_centros (perfil_id, centro_id, principal)`, todas con `principal = false`: (PRO1, C35E), (ADM, C35E), (TEC1, C35E) y (PRO1, C35F).
- `insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id)` con los cuatro pacientes.
- Controles con `pg_temp.assert`, que se fijan y no se suponen:
  - ADM y TEC1 tienen alta vigente en C35E;
  - ADM **no** tiene ninguna fila vigente en C35F;
  - el rol de ADM es `administrador` y el de TEC1 es `tecnico_administrativo`.
- `call pg_temp.como_con_2fa(:ADM); select public.fijar_pin_historia('333333'); call pg_temp.reset_sesion();`. Se fija el PIN en el propio bloque y no se da por hecho el que dejó la 19.54.

**Episodios por el camino de la aplicación** (regla de `supabase.md`: «se cierra llamando a lo que llamaría la Server Action»):
- Como PRO1, desbloqueado con `'111111'`:
  - `select public.episodio_para_nota(:P35A, null, null, :C35E) as e35a \gset`;
  - `… (:P35C, null, null, :C35F) as e35c \gset`;
  - `… (:P35D, null, null, :C35E) as e35d \gset`.
- Como ADM, desbloqueado con `'333333'`: `… (:P35B, null, null, :C35E) as e35b \gset`.
- Control: los cuatro episodios tienen el `centro_id` pedido.

**Pruebas.** En cada negativa: 23514 o 42501 y el fragmento exacto, con `assert_lanza_codigo_msg`.

| Nº | Sesión | Qué | Resultado esperado | Gemela | Mutante que mata |
|---|---|---|---|---|---|
| 19.56 | PRO1 | `insert into notas_clinicas (id, paciente_id, episodio_id, autor_id, coprofesional_id) values (:N35A, :P35A, :'e35a', :PRO1, :ADM)` | Entra. Se comprueba como `postgres` que `coprofesional_id = :ADM`. **Criterio 3a.** | de 19.58 y 19.59 | M3 (7b vuelto a solo `profesional_sanitario`) |
| 19.57 | ADM | `insert … values (:N35B, :P35B, :'e35b', :ADM, :PRO1)` | Entra. Se comprueba `autor_id = :ADM` y `coprofesional_id = :PRO1`. Después, `update … set coprofesional_id = null`, y luego `= :PRO1` otra vez, que es el camino de `fijarCoprofesional`: los dos pasan. **Criterio 3b.** | de 19.57b | M11 (7 exige que el AUTOR sea `profesional_sanitario`). M3 no la mata, porque el coprofesional es PRO1. |
| 19.57b | ADM | `update notas_clinicas set coprofesional_id = :TEC1 where id = :N35B` | 23514 con `'quien puede ser autor de notas'`. Con un administrador como AUTOR, el rol del coprofesional también se valida. | 19.57 | M8 (salida temprana del paso 7 cuando el autor es `administrador`) |
| 19.58 | PRO1 | `insert` en `:'e35a'` con coprofesional `:TEC1`, que tiene alta en C35E | 23514 con `'quien puede ser autor de notas'`. Mismo episodio y mismo centro que 19.56: solo cambia el rol. | 19.56 | M4 (7b borrado) |
| 19.59 | PRO1 | `insert` en `:'e35c'` (C35F) con coprofesional `:ADM` | 23514 con `'no tiene alta en el centro del episodio'` | 19.56 (ADM en C35E entra) | M5 (rama de administrador que se salta 7c) |
| 19.60a | PRO1 | Primero dos controles. Uno: PRO1 ve la fila de `:'e35a'`. Otro: `update … set motivo_consulta = 't035' where id = :'e35a'` deja ese valor, lo que demuestra que la RLS le deja escribir la fila. Después, `update episodios_asistenciales set centro_id = :C35F where id = :'e35a'`. | 42501 con `'y su centro no cambian'` | 19.61 | M1, M2, M7 |
| 19.60b | PRO1 | `… set centro_id = null where id = :'e35a'` | 42501 con `'y su centro no cambian'` (valor → nulo) | 19.61 | M2 |
| 19.60c | `postgres` | `… set centro_id = :C35F where id = :'e35b'` | 42501 con el mismo fragmento. **Criterio 4, «también como postgres».** | 19.61 | M1, M7 |
| 19.60d | `postgres` | `… set centro_id = :CA where id = :ECN`. ECN no tiene centro y tiene nota desde 19.37. | 42501 con el mismo fragmento (nulo → valor) | 19.61 | M2 |
| 19.61 | PRO1 | `update … set centro_id = :C35F where id = :'e35d'`. Antes, un control: `:'e35d'` tiene 0 notas. | Pasa, y `centro_id = :C35F` como `postgres`. **Criterio 4, gemela.** | de 19.60 | M9 (la función congela aunque no haya notas) |
| 19.61b | PRO1 | `update … set centro_id = centro_id, motivo_consulta = 't035b' where id = :'e35a'`, sobre el episodio con notas | Pasa. Se comprueba `motivo_consulta`. | de 19.60 | M10 (sin el `is distinct from` del centro en el `when`) |
| 19.62 | catálogo | Tres aserciones sobre `pg_get_functiondef('public.fn_exigir_episodio_coherente_en_nota()'::regprocedure)`: **(i)** `~* 'v_rol\s+not\s+in\s*\(\s*''profesional_sanitario''::public\.rol_usuario\s*,\s*''administrador''::public\.rol_usuario\s*\)'`; **(ii)** `!~* 'tecnico_administrativo'`; **(iii)** las dos regex de 19.48 siguen casando, porque 19.48 corre antes y ya lo cubre. | Verdadero. | — | M6 (lista negativa `v_rol = 'tecnico_administrativo'`). Ninguna prueba de comportamiento lo mata con tres valores de enum. |
| 19.63 | catálogo | Alarma: `enum_range(null::public.rol_usuario)::text[] = array['administrador','profesional_sanitario','tecnico_administrativo']`. Texto del mensaje: «Si falla, hay un rol nuevo (ADR-065): decide si puede ser autor de notas y revisa el paso 7b de fn_exigir_episodio_coherente_en_nota». | Verdadero. | — | Ninguno de T-035. Obliga al ticket del ADR-065 a pasar por 7b. |

Al final del bloque, `call pg_temp.reset_sesion();`.

**Si P-2 sale que sí**, entra la 19.57c:
- Fijación como `postgres`: `insert` (PROBAJA, C35E, false) y `update public.perfiles set estado = 'baja', estado_desde = now() where id = :PROBAJA and estado <> 'baja'`, con un control de que queda de baja. Es el mismo `update` que usa el módulo 04 (H16).
- Prueba como PRO1: `insert` en `:'e35a'` con coprofesional `:PROBAJA` da 23514 con `'está de baja'`.
- Gemela: 19.56.
- Mutante: quitar la condición de estado.

En la función se añade un 7b' justo después de 7b:
- `select f.rol, f.estado into v_rol, v_estado`, con `v_estado public.estado_perfil` declarada. **Antes de escribirlo hay que comprobar el nombre real del tipo** de `perfiles.estado`.
- `if v_estado is distinct from 'activo' then raise exception 'El coprofesional está de baja: no puede ser autor de notas (ADR-073)' using errcode = '23514'`.
- El fragmento `'está de baja'` es único. Ninguna aserción vieja depende de ese mensaje.

### 1.3 `scripts/rls/README.md`

A la línea del módulo 19 se le añade: «T-035 (ADR-073), 19.56-19.63:
- coterapia simétrica ADM ↔ PRO1 en el mismo centro;
- el técnico sigue fuera y el administrador sin alta en el centro también;
- el centro del episodio se congela con notas (valor → otro, valor → nulo y nulo → valor; como `authenticated` y como `postgres`), con su gemela sin notas y el *no-op* que pasa;
- la lista cerrada de roles (catálogo) y la alarma del enum para el ADR-065.»

### 1.4 `docs/architecture.md`, en la viñeta «Toda nota cuelga de un episodio», líneas 384-391

Son dos cambios mínimos dentro de la misma viñeta:
- El paréntesis queda así: «(quien puede ser autor de notas —profesional sanitario o administrador, el director sanitario del ADR-065—, distinto del autor, con alta vigente en el centro del episodio; la lista de roles es cerrada y el director administrativo no entra, ADR-073)».
- «Un episodio con notas no cambia de paciente ni de profesional» pasa a «Un episodio con notas no cambia de paciente, de profesional ni de centro (ADR-073)».

### 1.5 `lib/supabase/tipos-bd.ts`

Debería quedar sin cambios (H21). Se regenera con `npm run tipos` justo después del `db reset`, y si el diff no está vacío se explica.

### 1.6 Solo si P-1 sale que sí: `lib/notas/coprofesional.ts` y `lib/notas/coprofesional.test.ts`

- `coprofesional.ts`: `export const ROLES_COPROFESIONAL = ['profesional_sanitario', 'administrador'] as const;`. El comentario pasa a «La misma lista cerrada que el paso 7b del disparador (ADR-073.2); el disparador manda».
- `coprofesional.test.ts`:
  - `toEqual(['profesional_sanitario', 'administrador'])`;
  - `expect(ROLES_COPROFESIONAL).not.toContain('tecnico_administrativo')`.

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Por qué | Descartada |
|---|---|---|---|
| D1 | El centro lo congela el **mismo** disparador `congelar_episodio_con_notas`, añadiendo `centro_id` al `update of` y al `when`. | La invariante es una sola, «un episodio con notas no cambia de identidad», y el ADR-073.1 dice «igual que el paciente y el profesional». | Un disparador y una función aparte para el centro: dos sitios para la misma regla, y un orden de disparo alfabético que nadie quiere tener que pensar. |
| D2 | Errcode **42501**. | Es la familia de sus hermanas (19.28, 19.52), es una puerta prohibida y no una incoherencia de datos, y la aplicación no la traduce. | 23514: rompería la regla «42501 guarda, 23514 coherencia» de `pruebas.md`. |
| D3 | Un **solo mensaje** para las tres columnas, que las nombra. | No hace falta saber qué columna se tocó: la acción es la misma (no se cambia), y conserva `'tiene notas'` para 19.28 y 19.52. | Un mensaje por columna: haría falta ramificar con `if` sobre `old` y `new` dentro de la función, más código para el mismo 42501. |
| D4 | Re-emitir el disparador con `drop trigger if exists` + `create trigger`, dentro de la transacción de la migración. | Es el precedente del repositorio (H7) y no deja ventana sin disparador. | `create or replace trigger`: válido en Postgres 17, pero sin precedente aquí; no merece estrenarlo en un ticket de riesgo alto. |
| D5 | 7b es una **lista cerrada** con `not in (profesional_sanitario, administrador)`. | Cualquier valor nuevo del enum queda fuera por defecto. Así se cumple el ADR-073.2, «cuando exista el director administrativo, tampoco podrá serlo», si se guarda como valor del enum. | Lista negativa, `v_rol = 'tecnico_administrativo'`: dejaría entrar en silencio al director administrativo. |
| D6 | **Alarma** sobre el enum (19.63) y **prueba de catálogo** de la lista cerrada (19.62). | La lista cerrada solo protege si nadie la convierte en negativa. Con tres valores de enum, ninguna prueba de comportamiento lo detecta (M6), y la alarma obliga al ticket del ADR-065 a mirar 7b. | Una función auxiliar `puede_ser_autor_de_notas(uuid)`. La política `notas_clinicas_alta` no la usaría (el criterio 5 prohíbe tocar políticas), así que no centralizaría nada. Además añadiría `grant`/`revoke` y quizá diff en `tipos-bd.ts`. |
| D7 | 7b **cuelga del rol**, no de «puede ser autor» calculado (`es_profesional_asignado` o similar). | El coprofesional no es asignado del paciente por definición (ADR-072, no da acceso), así que la autoría del paciente concreto no es el criterio: lo es la capacidad del rol. | Derivarlo de la política de alta: no aplica a un tercero. |
| D8 | Se copia el cuerpo de `fn_exigir_…` **literalmente** salvo 7b. | 19.48 fija el texto de los pasos 3 y 5, y un diff de una sola zona es lo que el revisor puede comprobar. | Reescribir o «limpiar» la función: fuera de alcance, y rompería 19.48. |
| D9 | Ninguna guarda de datos en la migración. | Relajar el rol no invalida filas, y congelar el centro solo afecta a `update` futuros. | Una comprobación previa de «episodios con notas cuyo coprofesional no tiene alta en el centro»: es el residuo de SQL-H3, y el ADR-073 dice que ninguna base real tiene notas. |
| D10 | Los episodios del banco se abren con `episodio_para_nota`, no con un `insert` a mano. | Es lo que hace la aplicación, y además demuestra que ADM abre episodio en un centro donde tiene alta. | `insert` como `postgres`: prueba el esquema y no el producto (`supabase.md`). |

---

## 3 · Cómo se cierra cada criterio de aceptación

| # | Criterio | Comprobación que lo demuestra |
|---|---|---|
| 1 | `db reset` y `seed` limpios | `npx supabase db reset && npm run seed`, con salida 0 y la salida pegada en la evidencia. La migración se aplica también de forma incremental (`supabase migration up` sobre una base que ya tenía `20261003120000`) para comprobar que `drop trigger if exists` y `create or replace` funcionan sobre una base existente. |
| 2 | `test:rls` en 0, y cada negativa nueva se pone roja sin su guarda | `npm run test:rls`, salida 0 y la línea `19-nota-en-episodio: completa (19.1-19.63).` El verificador aplica a mano los mutantes de §5.3 en una transacción aparte (`create or replace` o `drop trigger`) y pega, por cada uno, la prueba que se pone roja y su texto. |
| 3 | Coterapia simétrica | Son 19.56 (PRO1 autor, ADM coprofesional) y 19.57 (ADM autor, PRO1 coprofesional, por `insert` y por `update`), las dos en C35E. Con M3 la 19.56 da 23514. |
| 4 | Centro congelado con notas, también como `postgres`; sin notas pasa | 19.60a y 19.60b (PRO1, con el control previo de que la RLS le deja escribir), 19.60c y 19.60d (`postgres`); gemela 19.61, y 19.61b (*no-op*). |
| 5 | Ninguna política cambia | `git diff main -- supabase scripts \| grep -iE "create policy\|alter policy\|drop policy"` no devuelve nada. |
| 6 | Tipos, lint, test, build, huellas y territorio | Se corre en este orden: `npm run tipos && git diff --exit-code lib/supabase/tipos-bd.ts` (se espera salida 0, H21) · `npm run lint:migraciones` · `npm test` · `npm run build` · `npm run verificar:huellas` · `node ~/.claude/pipeline/territorio.mjs T-035`. Si P-1 sale que sí, `npm test` cubre `coprofesional.test.ts`. |

---

## 4 · Riesgos, por probabilidad

1. **Alta. Al copiar el cuerpo de `fn_exigir_…` cambia algo más que 7b**: un espacio en el `for share`, un paso reordenado, un `if found` perdido. Mitigación:
   - el diff textual de §5.1, que debe salir solo con las líneas de 7b;
   - 19.48, que vigila el texto de los pasos 3 y 5;
   - el banco entero del módulo 19.
2. **Media. P-1 no se resuelve y el selector de T-012 sigue sin ofrecer a ADM.** No hay riesgo de seguridad: la base acepta más de lo que la pantalla ofrece. Pero la coterapia ADM ↔ PRO1 solo se puede registrar escribiendo en la base, y el ADR-073 decía «se acepta la asimetría *hasta que T-035 se integre*». Mitigación:
   - si sale que no, anotarlo en `docs/state.md` §Hallazgos como deuda de T-012;
   - **en ningún caso cambiar la constante antes de que la migración esté en `main`**, porque la pantalla ofrecería a ADM y luego daría `coprofesional_invalido`.
3. **Media. El ADR-065 se guarda como marca en el perfil y no como valor del enum.** Entonces la alarma 19.63 no salta, y un director administrativo con `rol = 'administrador'` pasaría 7b. Mitigación:
   - el comentario de 7b y la frase de `architecture.md` lo dicen;
   - el ticket del ADR-065 hereda la obligación;
   - el orquestador lo anota en `state.md` §Hallazgos al cerrar T-035.

   No se puede cerrar hoy porque la marca no existe todavía.
4. **Baja. Choque con el corte B de T-012**, que se está implementando ahora.
   - El corte B no toca `supabase/` ni `scripts/`.
   - Su `servidor.ts` traduce el 23514 por código (H23), así que el mensaje nuevo no le afecta.
   - El único choque posible es que el corte B toque `coprofesional.ts` o su prueba, o que escriba una prueba con la lista literal `['profesional_sanitario']` en lugar de importar `ROLES_COPROFESIONAL`. Antes de integrar, con P-1 = sí: `git diff main...<rama-corte-B> -- lib/notas/coprofesional.ts lib/notas/coprofesional.test.ts`, y un grep de `'profesional_sanitario'` en las pruebas nuevas del corte B.
5. **Baja. Marca de migración tomada.** Si T-028a o T-038 entran antes en `supabase/`, se renombra a la siguiente marca libre. El linter lo detecta.
6. **Muy baja. Interbloqueo con la firma.** No se añade ningún cerrojo (§5.4).

---

## 5 · Qué revisar

### 5.1 La re-emisión es la misma función salvo lo declarado

- [ ] Diff textual: extraer el bloque `create … function public.fn_exigir_episodio_coherente_en_nota()` … `$$;` de `20260929120000…sql` y de la migración nueva, quitar `or replace`, y hacer `diff`. **Solo** pueden cambiar las líneas de 7b.
- [ ] Lo mismo con `fn_congelar_episodio_con_notas()`: solo cambia el texto del mensaje.
- [ ] `security definer`, `set search_path = ''` y `language plpgsql` están en las dos funciones. Los dos `revoke … from public, anon, authenticated` están, y 19.31 sigue en verde.
- [ ] El disparador `exigir_episodio_coherente_en_nota` **no** se re-emite, y su `update of` sigue siendo `paciente_id, episodio_id, autor_id, coprofesional_id`. `congelar_cabecera_sellada` no se toca.

### 5.2 Columnas que elige el llamante y su efecto

- [ ] `authenticated` tiene `update` sobre **toda** `episodios_asistenciales` (H9). Las tres columnas de identidad (`paciente_id`, `profesional_id`, `centro_id`) quedan cubiertas por el `update of` y por el `when`.
- [ ] Las demás columnas (`motivo_consulta`, `cerrado_en`, `motivo_cierre`, `modalidad_relacional`) siguen libres con notas: lo prueban 19.60a (control) y 19.61b. Cerrar un episodio con notas tiene que seguir funcionando, porque `cerrado_en` no está en el `update of`.
- [ ] **Nulos**: el `when` usa `is distinct from` en los dos sentidos, valor → nulo (19.60b) y nulo → valor (19.60d). Con `<>`, los dos pasarían en silencio.
- [ ] **Otras puertas al centro**:
  - la clave ajena es `no action` (H8), así que ninguna acción referencial reescribe `centro_id`;
  - nadie más escribe en la tabla (H10);
  - `delete` no tiene `grant`, y una nota impide borrar su episodio por la clave ajena `notas_clinicas.episodio_id`;
  - TRUNCATE no aplica: no es una tabla de solo adición y `authenticated` no tiene ese privilegio. **Hay que comprobarlo con `\dp public.episodios_asistenciales`** y, si apareciera, anotarlo en `state.md` sin arreglarlo aquí.
- [ ] La lista cerrada de 7b no admite `tecnico_administrativo` ni un valor nuevo del enum, y el texto exacto es el de §1.1 (19.62).

### 5.3 Qué prueba se pone roja con qué mutante, y por qué motivo exacto

| Mutante | Cómo lo aplica el verificador | Se pone roja | Motivo exacto |
|---|---|---|---|
| M1 | Re-crea el disparador sin `centro_id` en `update of`, con el `when` intacto. | 19.60a/b/c/d | El `update` pasa y `assert_lanza_codigo_msg` informa de que no lanzó. |
| M2 | Quita `or new.centro_id is distinct from old.centro_id` del `when`. | 19.60a/b/c/d | Ídem. |
| M3 | Deja 7b como en T-034 (solo `profesional_sanitario`). | 19.56 | El `insert` lanza 23514 «tiene que ser un profesional sanitario» y la prueba aborta. |
| M4 | Borra 7b. | 19.58 | TEC1 entra, porque tiene alta en C35E y 7c pasa. |
| M5 | Añade en 7 `if v_rol = 'administrador' then return new; end if;` antes de 7c. | 19.59 | ADM entra en C35F sin alta. |
| M6 | Cambia 7b a lista negativa (`if v_rol = 'tecnico_administrativo'`). | Solo 19.62 (i) y (ii) | Es esperado: con tres valores, el comportamiento es idéntico. |
| M7 | El cuerpo de `fn_congelar_…` hace `return new` sin el `exists`. | 19.60a/b/c/d y 19.28 y 19.52 | |
| M8 | En 7, salida temprana si el autor es `administrador`. | 19.57b | TEC1 entra como coprofesional de una nota de ADM. |
| M11 | En 7, exigir que el autor sea `profesional_sanitario` (lectura errónea de «quien puede ser autor»). | 19.57 | La nota de ADM con PRO1 da 23514. |
| M9 | `fn_congelar_…` lanza siempre, sin el `exists`. | 19.61, y también 19.28 y 19.52 en sus gemelas | |
| M10 | `when (true)`, o el `when` del centro sin `is distinct from`. | 19.61b | El *no-op* lanza 42501. |

- [ ] Las negativas de rol (19.58 y 19.57b) se hacen en episodios de C35E **donde TEC1 sí tiene alta**. Si no, la prueba seguiría en verde por 7c y no por 7b; eso es lo que comprueba M4.
- [ ] 19.59 usa a ADM, que **sí** pasa 7b. Si no, seguiría en verde por el rol; eso es lo que comprueba M5.
- [ ] 19.60a: el control previo demuestra que PRO1 puede actualizar la fila, porque un 42501 de la RLS (`with check`) daría el mismo código. Por eso se exige además el fragmento `'y su centro no cambian'`.

### 5.4 Concurrencia y orden frente a la firma

- [ ] **Nota que entra primero, cambio de centro después.**
  - El paso 3 del disparador de la nota toma `for share` sobre la fila del episodio.
  - El `update … centro_id` necesita `for no key update` sobre esa fila, y lo pide *antes* de evaluar el `when` y el disparador. Choca con `for share` y espera.
  - Cuando la nota confirma, la función de congelación ejecuta su `exists` con una instantánea nueva (plpgsql volátil en READ COMMITTED), ve la nota y lanza 42501.
  - Si la nota aborta, no hay nota y el cambio pasa, que es lo correcto.
- [ ] **Cambio de centro primero, nota después.** El `for share` de la nota espera. Al desbloquearse, READ COMMITTED le devuelve la versión nueva de la fila, así que 7c se evalúa contra el **centro nuevo**.
- [ ] **Firma**: no se añade ningún cerrojo nuevo.
  - El `update` del episodio ya tomaba esa fila antes de T-035 (cualquier `update`). Lo único nuevo es una lectura MVCC sin bloqueo de `notas_clinicas`.
  - `fn_sellar_version_nota` no toca `episodios_asistenciales` (H15). `fn_vaciar_borrador_al_firmar` no dispara `exigir_…`.
  - No aparece ninguna arista nueva en el grafo de esperas, así que no hay 40P01 nuevo.
- [ ] No hace falta prueba de concurrencia en el banco, que corre en una sola sesión. El `for share` del paso 3 ya lo fija 19.48 sobre el catálogo; el revisor solo confirma que 19.48 sigue en verde *contra la función nueva*.

### 5.5 Mensajes y fragmentos

- [ ] `'quien puede ser autor de notas'` y `'y su centro no cambian'` no aparecen en ningún otro mensaje de `supabase/migrations/` (grep).
- [ ] 19.28, 19.35, 19.39 y 19.52 siguen en verde con los mensajes nuevos (H18).

### 5.6 Estado del banco

- [ ] El bloque nuevo fija su PIN de ADM y de PRO1, sus centros y sus altas. No supone nada de la 19.54 ni de la 19.55 (PRO2 ya no tiene CA, y el bloque no usa a PRO2).
- [ ] Las filas nuevas de `perfiles_centros` llevan `principal = false`, así que el espejo de ADM sigue nulo y el de TEC1 sigue en CA (H19). El módulo 20 no lee ninguno de los dos (H20).

---

## 6 · Territorio

| Ruta | Estado |
|---|---|
| `supabase/migrations/*_centro_congelado_y_coprofesional.sql` | Del contrato. |
| `scripts/rls/19-nota-en-episodio.sql` | Del contrato. |
| `scripts/rls/README.md` | Del contrato. |
| `lib/supabase/tipos-bd.ts` | Del contrato; se espera sin diff. |
| `docs/architecture.md` | Del contrato. |
| `lib/notas/coprofesional.ts` | **Solo si P-1 sale que sí.** Hay que enmendar el `territorio:` del contrato, que es tarea del usuario. |
| `lib/notas/coprofesional.test.ts` | **Solo si P-1 sale que sí**, por el mismo motivo. |

Los ficheros de `tickets/T-035/` (`evidencia.json`, `revision*.json`) los escriben los hooks. La
bitácora `docs/bitacora/T-035.md` y `docs/state.md` los escribe el orquestador en el commit de
cierre, como en T-036, no el implementador.

---

## 7 · Delegable

**Nada.** Todo es migración con disparadores `security definer`, banco de RLS con mutantes y una
regla de autorización. La regla del pipeline lo reserva a la fábrica. La frase de
`architecture.md` y la línea del README son texto, pero dependen de las decisiones de este diseño
y suman cinco líneas: delegarlas cuesta más que escribirlas.

---

## Lo que no entra, y por qué

| Qué | Por qué |
|---|---|
| Reabrir un episodio cerrado (SQL-H2) | Fuera de alcance por contrato. Irá al ticket que cierre episodios. |
| El director administrativo (ADR-065) | Fuera de alcance por contrato. T-035 deja su alarma (19.63) y la nota en 7b. |
| Revalidar el coprofesional cuando pierde el alta o el rol **después** de entrar en la nota | Ya aceptado en T-034 (19.55: una edición que no toca ni el coprofesional ni el episodio no revalida), y el coprofesional se congela con la primera versión. |
| Que la firma coteje el rol del coprofesional | El ADR-072 lo congela en la cabecera; la firma coteja la cabecera (6.16), y el disparador de la cabecera es quien valida. |
| Prueba de carrera entre nota y cambio de centro en `scripts/t005-concurrencia.sql` | Ese fichero no está en el territorio, el razonamiento de §5.4 no añade cerrojos y 19.48 ya fija el `for share`. |
| `comment on column episodios_asistenciales.centro_id` | No lo pide el contrato. El comentario de la función ya lo dice. |
| El estado activo del coprofesional | No lo pide el contrato. Queda como pregunta P-2. |
| Cambiar `servidor.ts` o el selector de T-012 | Es de T-012. Con P-1 = sí, basta la constante, porque el selector ya la lee (H23). |

---

## Preguntas para el propietario

**P-1 · ¿Se amplía el territorio de T-035 con `lib/notas/coprofesional.ts` y `lib/notas/coprofesional.test.ts`?**

El código (H22) y el diseño de T-012 asignan a T-035 el cambio de `ROLES_COPROFESIONAL`, pero el
contrato no incluye esos ficheros.

- **Si sale que sí:** dos líneas de producción y una prueba unitaria, en el mismo commit que la migración. Así la pantalla nunca ofrece a ADM antes de que la base lo acepte. El corte B de T-012 no toca esos ficheros; el diff de comprobación está en §4.4.
- **Si sale que no:** se anota en `state.md` como deuda de T-012 (corte C o seguimiento), que lo hará cuando T-035 esté en `main`. Hasta entonces la pantalla no ofrece a ADM: no hay riesgo de seguridad, pero la coterapia ADM ↔ PRO1 no se puede registrar desde la aplicación.

**Recomendación: sí.** Así T-035 cierra la asimetría que el ADR-073 aceptaba solo «hasta que T-035 se integre».

**P-2 · ¿Exige la base, además, que el coprofesional esté activo (`perfiles.estado = 'activo'`)?**

- El ADR-073.2 define al coprofesional como «quien puede ser autor de notas», y un perfil de baja no puede ser autor (`rol_actual()` y `es_profesional_asignado()` exigen perfil activo).
- La baja (`dar_de_baja_perfil`) no cierra `perfiles_centros`, así que hoy la base acepta como coprofesional a un perfil de baja con alta abierta. Solo lo filtra la pantalla (`estado = 'activo'`).
- El coprofesional se sella en la cadena, así que un dato falso ahí es permanente.
- **Si sale que sí:** una condición más en 7b' con su mensaje propio, una negativa (19.57c, PROBAJA) y su gemela (19.56). El detalle está en §1.2.
- **Si sale que no:** se anota en `state.md` §Hallazgos para un ticket posterior.

**Recomendación: sí.** Es la lectura literal del ADR, cuesta poco y estrecha lo que el contrato ya va a tocar. Pero no está en las tareas del contrato, así que lo decide el propietario.

## Decisiones del propietario (02-10-2026)

Mandan sobre lo anterior donde choquen.

1. **Se amplía el territorio** con `lib/notas/coprofesional.ts` y su prueba (ya en el `territorio:` del
   contrato). `ROLES_COPROFESIONAL` admite al administrador **en el mismo commit que la migración**, nunca
   antes: la pantalla no ofrece lo que la base aún no acepta.
2. **La base exige que el coprofesional esté activo**: es la lectura literal del ADR-073. Entra la condición
   de §1.2 con sus dos pruebas (gemela positiva con perfil activo, negativa con perfil de baja y altas
   abiertas en `perfiles_centros`) y su mutante en §5.3.
