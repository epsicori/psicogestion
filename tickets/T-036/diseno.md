# T-036 · La firma no se fía del cliente · Diseño

> Arquitecto, 02-10-2026. Diseñado sobre `main` (`43d327d`) **más lo que promete §1.2 del diseño
> de T-012**, que aún no está integrado. Toda pieza marcada **[T-012]** no existe hoy en `main`;
> el implementador la re-verifica contra `main` antes de escribir una línea (§0.B).
>
> **Enmienda del 02-10-2026 al final del documento** (R2-H1 y §0 revisado frente a `main` `39b2df0`, con T-012 corte A ya integrado): donde choque con lo anterior, manda la enmienda.

## 0 · Hechos verificados contra el código

### 0.A · En `main` (`43d327d`), leído el 02-10-2026

| # | Hecho | Dónde |
|---|---|---|
| H1 | La última definición de `fn_sellar_version_nota()`, `verificar_cadena_huellas(uuid)` y `fn_congelar_cabecera_sellada()` está en `20261001120000_nota_id_en_el_sobre.sql` (§2, §3 y §4). Ninguna migración posterior las redefine: es la última de `supabase/migrations/`. | `supabase/migrations/20261001120000_nota_id_en_el_sobre.sql:46-397`, `:442-597`, `:610-634` |
| H2 | Paso 0 (permisos, 42501, solo si `current_setting('role', true) in ('authenticated','anon')`), pasos 1 y 1.bis (42501), paso 2 (`select … into strict … from notas_clinicas n where n.id = new.nota_id for no key update`, lee paciente, episodio, autor, fecha y coprofesional; **no lee `cita_id` ni el borrador**), paso 3 (cerrojo consultivo por paciente), pasos 4-5 (eslabón y `numero_version`), paso 6 (6.1-6.16, todas 23514), paso 7 (huella). | `:78-88`, `:92-109`, `:118-122`, `:156`, `:159-174`, `:203-386`, `:390` |
| H3 | 6.7: `creada_en` y `firmada_en` del sobre deben ser `to_char(new.creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`. `to_char … MS` **trunca** los microsegundos (divide `fsec` entre 1000), no redondea. | `:274-282` |
| H4 | 6.8 solo comprueba **tipos** de `cita_id`, `abierta_en`, `firmada_en`, `redactada_en_sesion`, `margen_sesion_minutos`, y `abierta_en <= firmada_en` (con captura de `invalid_datetime_format`). 6.9: sin `cita_id` en el sobre, `redactada_en_sesion = false` y `margen = null`. Nada coteja `cita_id` con la cabecera (H27) ni el origen de los tres valores de sesión (D1). | `:285-325` |
| H5 | Fragmentos de mensaje que ya usan las 6.x (para no repetirlos): «no coincide con la columna …», «no coincide con el paciente de la cabecera», «con el episodio de la cabecera», «con el autor de la cabecera», «con la fecha de sesión de la cabecera», «con el coprofesional de la cabecera», «del sobre debe ser una cadena o null», «no puede ser posterior a firmada_en», «Sin cita_id, redactada_en_sesion debe ser false». Ninguno contiene «borrador vivo», «abierta_en del sobre no es», «cita_id del sobre no es la cita», «reloj de la base», «no es de esta nota», «margen efectivo» ni «recalcula la base». | `:209-385` |
| H6 | El verificador lee la cabecera con `left join public.notas_clinicas n` y expone `cab_paciente_id … cab_coprofesional_id`; **no** expone `n.cita_id`. La rama `sobre_no_coincide_con_fila` es una disyunción con una línea por comprobación (`-- 6.x`). | `:481-487`, `:549-571` |
| H7 | El mensaje y el comentario de `fn_congelar_cabecera_sellada` dicen «los coteja con la cabecera salvo la cita» y «salvo la cita (T-012c)». El fragmento «no se puede reatribuir» lo comprueba la 19.41. | `:618-623`, `:631-634` |
| H8 | `fn_vaciar_borrador_al_firmar()`: `after insert` en `notas_clinicas_versiones`, `update notas_clinicas set borrador_contenido = null where id = new.nota_id and borrador_contenido is not null`. No redefinida después. | `20260829210000_cadena_de_huellas.sql:476-504` |
| H9 | `notas_clinicas.cita_id uuid references public.citas (id)`, nulable; ninguna regla la ata a paciente o profesional (hecho 18 de T-012). | `20260906120000_agenda_esquema.sql:396` |
| H10 | `citas`: `paciente_id uuid not null`, `profesional_id uuid not null`, `centro_id uuid` **nulable**, `inicio`/`fin timestamptz not null`, `check (fin > inicio)`. | `20260906120000_agenda_esquema.sql:180-200` |
| H11 | `organizacion` tiene **una sola fila** (`fila_unica boolean not null default true unique check (fila_unica)`). | `20260822094547_…historia.sql:108-127` |
| H12 | `calcularRedactadaEnSesion`: `false` si no hay ventana o margen; si no, `abiertaEn.getTime() >= inicio.getTime() − margen·60000 && firmadaEn.getTime() <= fin.getTime() + margen·60000`. Opera en milisegundos enteros (`Date`). | `lib/huella/sesion.ts` |
| H13 | `pg_temp.sobre_prueba(...)` serializa `abierta_en` con el mismo `to_char … MS` (trunca) y, si `p_abierta_en` es nulo, usa `p_creada_en`. Lee de la cabecera `coprofesional_id`, `episodio_id`, `fecha_sesion` y `paciente_id`; `cita_id`, margen y `redactada_en_sesion` los recibe por parámetro. | `scripts/rls/00-ayudantes.sql:203-239` |
| H14 | El banco 14 ya tiene el patrón de mutantes: `pg_temp.t012c_mutar(original, fragmento, reemplazo)` exige que el fragmento aparezca **exactamente una vez** en `pg_get_functiondef`, y `t012c_restaurar` reejecuta y compara byte a byte. `:'sellar_original'` se guarda en `:644`. | `scripts/rls/14-cadena-huellas.sql:125-151`, `:642-646` |
| H15 | Las firmas `authenticated` del banco 14 usan `creada_en` fijo (`timestamptz '2026-08-29 09:37:00+00'` / `09:37:01`). Las negativas de C.perm (`:906-913`, `:932-933`) mueren en el paso 0 y **no cambian**; la gemela positiva de `:982-985` (N067E) **sí** cambia (P2, B, C). El mutante «sin paso 0» (`:943-957`) espera errores de 6.14, 6.12 y P0002: no cambian **si las comprobaciones nuevas van después de 6.16**. | `scripts/rls/14-cadena-huellas.sql:895-991` |
| H16 | El banco desactiva disparadores como `postgres` (`alter table … disable trigger …`) y los restaura; es el mismo mecanismo que servirá para fijar `borrador_abierta_en` (§1.2). | `scripts/rls/14-cadena-huellas.sql:997`, `:1624-1625` |

### 0.B · Prometido por T-012 y **no** presente en `main` — DEPENDENCIA DE ESQUEMA

`grep -rln "borrador_abierta_en\|margen_sesion_minutos" supabase/migrations/` devuelve solo las
migraciones de la cadena (como **clave del sobre**). Las piezas siguientes las crea
`20261002120000_nota_clinica_borrador_firma.sql` (diseño de T-012, §1.2), y este diseño las usa
**con el nombre de ese diseño**:

| Pieza [T-012] | Paso de §1.2 de T-012 | Uso en T-036 |
|---|---|---|
| `notas_clinicas.borrador_abierta_en timestamptz` | 1 | 6.18 (C) |
| `notas_clinicas_borrador_abierta_ck`: `(borrador_abierta_en is null) = (borrador_contenido is null)` | 3 | 6.17 (B) y 6.18 (C) leen columnas coherentes |
| `fn_tocar_borrador()` fija `borrador_abierta_en := coalesce(old…, now())` y la vacía con el borrador | 4 | B, C y la doble firma |
| `organizacion.margen_sesion_minutos smallint not null default 15` · `centros.margen_sesion_minutos smallint` (nulo = hereda) | 6 | 6.22 (margen) |
| `resolver_alerta_nota_sin_firmar` (`after insert`), con la regla «cita de esta nota» | 9 | 6.21 (P3) copia su condición |
| `firmarNota` toma `abiertaEn`, ventana, margen y cita de la base, y traduce 23514 → `conflicto` | §1.5 pasos 2, 4 y 7 | criterio 15 |
| `scripts/t012-nota.ts` y el banco `scripts/rls/20-*.sql` | §3 de T-012 | criterios 1 y 15 |

**Gate de arranque del implementador (obligatorio, antes de escribir nada):**
1. `git log --oneline -1 -- 'supabase/migrations/*nota_clinica_borrador_firma.sql'` devuelve un
   commit en `main`. Si no, **no se empieza**: T-036 depende de T-012 integrado.
2. `grep -n "borrador_abierta_en\|margen_sesion_minutos" supabase/migrations/*nota_clinica_borrador_firma.sql`
   confirma los nombres de la tabla de arriba. **Si T-012 los renombró, mandan los de `main`**, y
   se sustituyen en todo §1 sin más decisión.
3. `grep -ln fn_sellar_version_nota supabase/migrations/*.sql | tail -1`, y lo mismo con
   `verificar_cadena_huellas` y `fn_congelar_cabecera_sellada`: si T-012 o T-035 redefinió alguna,
   el cuerpo de partida es **ese**, tomado con `pg_get_functiondef` (lección N1 de T-012b), nunca
   el de H1.
4. El nombre del disparador que llama a `fn_tocar_borrador` en `notas_clinicas`
   (`select tgname from pg_trigger where tgrelid = 'public.notas_clinicas'::regclass and tgfoid = 'public.fn_tocar_borrador()'::regprocedure`).
   El banco lo necesita para fijar `borrador_abierta_en` (§1.2).
5. `ls supabase/migrations | tail -3`: la marca de T-036 es posterior a todas (y a T-035 si ya
   entró).

#### Hechos de los bancos y guiones (también en `main`)

| # | Hecho | Dónde |
|---|---|---|
| H17 | `04-baja.sql:25-34`: PROBAJA (authenticated, desbloqueado) crea su nota **sin borrador** y firma con `creada_en = 2026-08-29 09:22`. Tras T-036 fallaría por B y por P2. | `scripts/rls/04-baja.sql:25-34` |
| H18 | En `main`, `19-nota-en-episodio.sql` **no tiene ninguna firma `authenticated`**: su única firma (19.41, `:440`) va después de `reset_sesion()`, como `postgres`. Si T-012 o T-035 le añadieron alguna, se trata como H17. | `scripts/rls/19-nota-en-episodio.sql:438-445` |
| H19 | `t005-concurrencia.sql` confirma filas, corre sobre `db reset` (Ana y su paciente de `supabase/seed.sql`), y su segunda conexión es un `\! psql … -c "…"` **síncrono** con `lock_timeout` que espera 55P03; los resultados de la segunda conexión van a la tabla no temporal `public.t005_resultado`. `psql` no interpola `:VAR` dentro de `$$…$$`. | `scripts/t005-concurrencia.sql:1-200`, `:116` |
| H20 | `historia_desbloqueada()` = existe fila en `desbloqueos_historia` con `perfil_id = auth.uid()`, `revocado_en is null`, `caduca_en > now()` y perfil `activo`. `pg_temp.como(uid)` hace `set local role authenticated` + `request.jwt.claims` con `sub`. | `20260822160000_rls_funciones_y_politicas.sql:193-209`, `scripts/rls/00-ayudantes.sql:58-65` |
| H21 | `lib/huella/sobre.ts` valida `cita_id` con `uuidMinusculas` (regex de UUID en minúsculas) y **no** lo pasa a minúsculas (`:133`), al contrario que `autor_id`, `nota_id`, etc. Un `cita_id` en mayúsculas nunca sale de `construirSobre`: solo puede llegar por PostgREST a mano. | `lib/huella/sobre.ts:44`, `:68`, `:133` |
| H22 | `citas.profesional_id`, `inicio` y `fin` **se pueden actualizar** (solo está el disparador `calcular_rango_bloqueante` en `update of profesional_id, inicio, fin`, sin congelación). Dos citas del mismo profesional no pueden solaparse (rango bloqueante). | `20260906120000_agenda_esquema.sql:283-285` |
| H23 | La siembra (`seed-completo.sql`) sella todas sus versiones con `"cita_id":null` y no fija `cita_id` en ninguna cabecera: la línea nueva del verificador no la marca. `t005-concurrencia.sql`, igual (`:85`). | `supabase/seed-completo.sql:61` |
| H24 | `npm run verificar:huellas` es una cáscara de `public.verificar_cadena_huellas()` e imprime «cadena íntegra: cero anomalías.». | `scripts/verificar-huellas.mjs:75`, `:113` |
| H25 | `docs/architecture.md` §«1 · Cadena de huellas» describe el paso 0 y lo que coteja el verificador desde T-012b/T-012c. | `docs/architecture.md:96-111` |

## 1 · Piezas y contratos

### 1.1 · Migración: `supabase/migrations/<marca>_firma_cotejada_con_borrador_y_cita.sql`

Marca posterior a la de T-012 (`20261002120000`) y a la de T-035 si ya está en `main` (gate 5).
Secciones, en este orden:

**§1 · Guarda de prerrequisitos** (patrón de la guarda de era de `20261001120000:20-40`). Un
`do $$ … $$` que lanza (`raise exception … using errcode = '55000'`) si falta cualquiera de
`notas_clinicas.borrador_abierta_en`, `organizacion.margen_sesion_minutos` o
`centros.margen_sesion_minutos` (consulta a `information_schema.columns`). Así un orden de
migraciones equivocado falla en `db reset` con un mensaje que dice «T-036 exige T-012», y no
en ejecución con un `column does not exist` dentro del disparador.

**§2 · `fn_sellar_version_nota()` re-emitida.** El cuerpo de partida se obtiene con
`select pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure)` sobre la base con
T-012 aplicado, se pega y se modifica **solo** en estos puntos. Misma firma, `security definer`,
`set search_path = ''`, y se repite al final el `revoke all … from public, anon, authenticated,
service_role`.

1. **`declare`**, diez variables nuevas:
   ```sql
   v_cita_cabecera       uuid;
   v_borrador_vivo       boolean;
   v_borrador_abierta_en timestamptz;
   v_cita_paciente       uuid;
   v_cita_profesional    uuid;
   v_cita_centro         uuid;
   v_cita_inicio         timestamptz;
   v_cita_fin            timestamptz;
   v_margen              integer;
   v_en_sesion           boolean;
   ```
2. **Paso 2** (la lectura bloqueante de la cabecera): se añaden tres columnas a la **misma**
   sentencia, sin tocar el `where` ni el `for no key update`:
   ```sql
   select n.paciente_id, n.episodio_id, n.autor_id, n.fecha_sesion, n.coprofesional_id,
          n.cita_id, n.borrador_contenido is not null, n.borrador_abierta_en
     into strict v_paciente_id, v_episodio_id, v_autor_cabecera, v_fecha_sesion, v_coprofesional_id,
          v_cita_cabecera, v_borrador_vivo, v_borrador_abierta_en
     from public.notas_clinicas n
    where n.id = new.nota_id
      for no key update;
   ```
   **Por qué aquí y no en otra lectura**: la segunda de dos firmas concurrentes espera en este
   `for no key update` y, en READ COMMITTED, al soltarse el cerrojo **relee la fila ya
   confirmada**, con `borrador_contenido` vaciado por `fn_vaciar_borrador_al_firmar` de la
   primera. Una lectura sin cerrojo en otro sitio podría ver la foto de antes. El comentario del
   paso 2 se amplía con una línea: «T-036: también la cita y el borrador; B se decide con esta
   lectura, no con otra».
3. **Comentarios del paso 6**: «Las dieciséis comprobaciones…» pasa a decir que 6.1-6.16 valen
   para todos los roles y 6.17-6.23 solo para `authenticated` y `anon` (P1). El de 6.16 («el único
   sitio del disparador donde un null SQL se vuelve null JSON») pasa a «uno de los dos sitios
   (6.16 y 6.19)».
4. **Bloque nuevo, entre el final de 6.16 y el paso 7.** Texto exacto de las condiciones (los
   mutantes las buscan por fragmento; cada una en **una línea**):

```sql
  -- 6.17-6.23 · La firma no se fía del cliente (T-036; D1, D3 y H27 de T-012/T-012c).
  -- Solo para authenticated y anon, como el paso 0 (P1 del 01-10-2026): la siembra, la
  -- fijación y t005 firman como postgres, retrofechadas y sin borrador. Van DESPUÉS de 6.16:
  -- ninguna negativa anterior cambia de error, y ninguna sale antes que el 42501 del paso 0.
  if current_setting('role', true) in ('authenticated', 'anon') then  -- P1 (T-036)

    -- 6.17 · B · Borrador vivo (D3). Se firma lo que hay abierto. Leído en el paso 2, con
    -- el cerrojo: la segunda de dos firmas concurrentes ve el borrador ya vaciado.
    if not v_borrador_vivo then
      raise exception 'No hay borrador vivo que firmar: la nota ya se firmó o no se abrió para modificarla; hay que reabrir el borrador (T-036, D3)'
        using errcode = '23514';
    end if;

    -- 6.18 · C · abierta_en = notas_clinicas.borrador_abierta_en, que escribe solo
    -- fn_tocar_borrador (T-012). Truncado a milisegundos con el mismo to_char que 6.7: igual
    -- que `new Date(...)` en Node, que trunca y no redondea. Se compara como cadena JSON, así
    -- que también exige la forma de toISOString() (milisegundos y «Z»).
    if (v_contenido -> 'abierta_en') is distinct from to_jsonb(to_char(v_borrador_abierta_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then
      raise exception 'El abierta_en del sobre no es el instante en que la base abrió el borrador (notas_clinicas.borrador_abierta_en, truncado a milisegundos) (T-036, ADR-046)'
        using errcode = '23514';
    end if;

    -- 6.19 · A · cita_id del sobre = cita de la cabecera (H27, ADR-073.4). null JSON si la
    -- cabecera no tiene. Sin lower(): el sobre canónico lleva el UUID en minúsculas
    -- (uuidMinusculas en lib/huella/sobre.ts), igual que 6.11-6.16.
    if (v_contenido -> 'cita_id') is distinct from coalesce(to_jsonb(v_cita_cabecera::text), 'null'::jsonb) then
      raise exception 'El cita_id del sobre no es la cita de la cabecera notas_clinicas (null si no hay; UUID en minúsculas) (T-036, ADR-073)'
        using errcode = '23514';
    end if;

    -- 6.20 · P2 · firmada_en (= creada_en, 6.7) acotado al reloj de la base: un minuto a
    -- cada lado de now(). Sin esto, 6.23 se burla retrofechando la firma.
    if new.creada_en not between now() - interval '1 minute' and now() + interval '1 minute' then
      raise exception 'firmada_en se aparta más de un minuto del reloj de la base: la firma se fecha al firmar, no la elige el cliente (T-036, P2)'
        using errcode = '23514';
    end if;

    if v_cita_cabecera is not null then
      select c.paciente_id, c.profesional_id, c.centro_id,
             date_trunc('milliseconds', c.inicio), date_trunc('milliseconds', c.fin)
        into v_cita_paciente, v_cita_profesional, v_cita_centro, v_cita_inicio, v_cita_fin
        from public.citas c
       where c.id = v_cita_cabecera;

      -- 6.21 · P3 · La cita es DE ESTA NOTA: mismo paciente y su profesional es el autor.
      -- La misma regla que resolver_alerta_nota_sin_firmar (T-012 §1.2 paso 9).
      if v_cita_paciente is distinct from v_paciente_id or v_cita_profesional is distinct from v_autor_cabecera then
        raise exception 'La cita de la cabecera no pertenece a esta nota: tiene que ser del mismo paciente y de su autor (T-036, P3)'
          using errcode = '23514';
      end if;

      -- 6.22 · Margen efectivo: el del centro de la cita si no es nulo; si no (o si la cita
      -- no tiene centro), el de la organización (fila única, not null).
      select coalesce(ce.margen_sesion_minutos, o.margen_sesion_minutos)
        into v_margen
        from public.organizacion o
        left join public.centros ce on ce.id = v_cita_centro;
      if (v_contenido -> 'margen_sesion_minutos') is distinct from to_jsonb(v_margen) then
        raise exception 'El margen_sesion_minutos del sobre no es el margen efectivo (el del centro de la cita o, si es nulo, el de la organización) (T-036, ADR-046)'
          using errcode = '23514';
      end if;

      -- 6.23 · D · redactada_en_sesion lo recalcula la base con la fórmula de
      -- calcularRedactadaEnSesion (lib/huella/sesion.ts): bordes incluidos, en milisegundos.
      -- abierta_en y firmada_en salen del sobre, ya atados a la base por 6.18, 6.7 y 6.20.
      v_en_sesion := (v_contenido ->> 'abierta_en')::timestamptz >= v_cita_inicio - make_interval(mins => v_margen)
                 and (v_contenido ->> 'firmada_en')::timestamptz <= v_cita_fin + make_interval(mins => v_margen);
      if (v_contenido -> 'redactada_en_sesion') is distinct from to_jsonb(v_en_sesion) then
        raise exception 'El redactada_en_sesion del sobre no es el que recalcula la base con la ventana de la cita y el margen (T-036, ADR-046)'
          using errcode = '23514';
      end if;
    end if;
    -- Sin cita en la cabecera, 6.19 ya obligó a cita_id null en el sobre, y 6.9 a
    -- redactada_en_sesion false y margen null: no queda nada que comprobar.
  end if;
```

5. **Nada más cambia**: ni el paso 0, ni 1/1.bis, ni 3-5, ni 6.1-6.16, ni el paso 7.

**Fragmentos** (únicos en `pg_get_functiondef`; `pg_temp.t012c_mutar` exige una aparición exacta
y falla si no):

| Id | Fragmento de la **aserción** (mensaje) | Fragmento del **mutante** → reemplazo |
|---|---|---|
| 6.17 B | `No hay borrador vivo que firmar` | `if not v_borrador_vivo then` → `if false then` |
| 6.18 C | `no es el instante en que la base abrió el borrador` | `if (v_contenido -> 'abierta_en') is distinct from to_jsonb(to_char(v_borrador_abierta_en` → `if false and (v_contenido -> 'abierta_en') is distinct from to_jsonb(to_char(v_borrador_abierta_en` |
| 6.19 A | `no es la cita de la cabecera` | `if (v_contenido -> 'cita_id') is distinct from coalesce(` → `if false and (v_contenido -> 'cita_id') is distinct from coalesce(` |
| 6.20 P2 | `del reloj de la base` | `if new.creada_en not between` → `if false and new.creada_en not between` |
| 6.21 P3 | `no pertenece a esta nota` | `if v_cita_paciente is distinct from v_paciente_id or v_cita_profesional is distinct from v_autor_cabecera then` → `if false then` |
| 6.22 margen | `no es el margen efectivo` | `if (v_contenido -> 'margen_sesion_minutos') is distinct from to_jsonb(v_margen) then` → `if false then` |
| 6.23 D | `no es el que recalcula la base` | `if (v_contenido -> 'redactada_en_sesion') is distinct from to_jsonb(v_en_sesion) then` → `if false then` |

`false and X is distinct from Y` es `false and (X is distinct from Y)`: `IS DISTINCT FROM` y
`NOT BETWEEN` atan más fuerte que `AND`. Ningún mensaje nuevo contiene el fragmento de otro,
nuevo o viejo (H5); el implementador lo comprueba con la consulta de §5, punto 3.

**§3 · `verificar_cadena_huellas(uuid)` re-emitida** (`create or replace`, nunca `drop`; cuerpo
de `pg_get_functiondef`). Dos cambios y el comentario:
- en el CTE `c`, tras `n.coprofesional_id as cab_coprofesional_id`, la columna
  `n.cita_id as cab_cita_id`;
- en la rama `sobre_no_coincide_con_fila`, tras la línea `-- 6.16`, una línea:
  `or (c.sobre -> 'cita_id') is distinct from coalesce(to_jsonb(c.cab_cita_id::text), 'null'::jsonb)   -- 6.19`
- `comment on function`: se añade «y, desde T-036 (ADR-073.4), `cita_id` con la cabecera» a la
  lista de claves de cabecera. Se repite el `revoke all … from public, anon, authenticated,
  service_role`.

La línea del verificador vale **para todas las filas, firme quien firme**: el verificador no
distingue roles. Es la única comprobación nueva que el verificador repite (ver «Lo que no
entra»).

**§4 · `fn_congelar_cabecera_sellada()` re-emitida** (cuerpo de `pg_get_functiondef`). Solo
cambia el texto del mensaje: «…el sobre canónico de la era 4 sella los seis campos, y
verificar_cadena_huellas() los coteja todos con la cabecera (ADR-035/046/067/071/072/073)».
Conserva literalmente «no se puede reatribuir» (19.41). El `comment on function` pasa a «…El
sobre de la era 4 los sella y el verificador los coteja todos, la cita incluida desde T-036.
42501.». El disparador no se toca; se repite su `revoke execute`.

**§5 · `comment on function public.fn_sellar_version_nota()`**: si existe (comprobar con
`obj_description('public.fn_sellar_version_nota()'::regprocedure)`), se reescribe añadiendo
6.17-6.23 y P1. Si no existe, no se crea.

### 1.2 · `scripts/rls/14-cadena-huellas.sql`, sección nueva «T-036»

Va **después** de C.perm y de la sección del verificador. Reutiliza el PIN `111111` de PRO1
(fijado en `:897`) y guarda sus propias definiciones al empezar
(`:'sellar_original_036'`, `:'verif_original_036'`, con `pg_get_functiondef`), para no depender
de las de `:644-646`. Si T-012 añadió casos al banco 14, la sección va al final.

**Reglas comunes de la sección:**
- **Instante de referencia**: `select date_trunc('milliseconds', now()) as t0 \gset`. Toda firma
  `authenticated` lleva `creada_en = :'t0'`, que cae dentro de ±1 min de `now()` mientras el
  módulo corra dentro de una transacción (los `savepoint` la exigen: si el módulo no va ya en una, la sección entera se envuelve en `begin; … rollback;`; nunca se rehace `t0` entre escenarios).
- **Un escenario, un `savepoint`**: cita, nota y firma se crean dentro y se deshacen con
  `rollback to savepoint`. Así nunca hay dos citas del mismo profesional vivas a la vez (rango
  bloqueante, H22) y cada escenario parte de cero.
- **Fijar el estado, no suponerlo** (`.claude/rules/pruebas.md`): al principio de la sección,
  como `postgres`, `update public.organizacion set margen_sesion_minutos = 15`, un centro `CM20`
  con `margen_sesion_minutos = 20` y un centro `CMNULO` con `margen_sesion_minutos = null`
  (creados o tomados de la fijación, con una aserción que lea su valor).
- **Fijar `borrador_abierta_en` a mano** (criterios 7, 9 y 11), como `postgres`:
  `alter table public.notas_clinicas disable trigger <tg_tocar_borrador>;`,
  `update … set borrador_abierta_en = <instante> where id = …;` y
  `alter table … enable trigger <tg_tocar_borrador>;`, con el nombre del gate 4. El `check`
  `notas_clinicas_borrador_abierta_ck` sigue en pie: solo se fija con el borrador vivo. Tras
  reactivar, una aserción lee el valor y sus microsegundos (`extract(microseconds from …)`).
- **Construir el sobre**: `pg_temp.sobre_prueba(...)` con
  `p_abierta_en => (select borrador_abierta_en from public.notas_clinicas where id = …)`, y
  `p_cita_id`, `p_margen_sesion_minutos` y `p_redactada_en_sesion` explícitos. **`sobre_prueba`
  no cambia** (§2.10).
- Negativas con `pg_temp.assert_lanza_codigo_msg(consulta, '23514', '<fragmento>', rótulo)`;
  gemelas con `pg_temp.assert_no_lanza`, **mismo perfil y misma nota**, ejecutadas después de la
  negativa en el mismo escenario.

**Casos** (rótulos `T036.<n>`; criterio entre corchetes):

| Rótulo | Montaje | Esperado |
|---|---|---|
| T036.A1-A4 [2] | Cita propia `K` (PRO1, paciente de la nota, `CMNULO`); nota con `cita_id = K` y borrador. Sobres con `cita_id` = otra cita propia `K2` (en otro escenario, para no solapar) / `null` / `K` en **MAYÚSCULAS**. Y una nota **sin** cita con sobre `cita_id = K`. | Las cuatro: 23514 `no es la cita de la cabecera`. Gemela: `cita_id = K` (margen 15, `redactada` la que da la fórmula) entra. |
| T036.A5 [3] | Una versión firmada con cita `K` (la gemela de A). Como `postgres`, `disable trigger congelar_cabecera_sellada` (y `exigir_episodio_coherente_en_nota` si su `update of` incluye `cita_id`), `update notas_clinicas set cita_id = <otra cita>`, reactivar. | Antes del cambio, `verificar_cadena_huellas(:pac)` da 0 filas; después, exactamente 1 con `motivo = 'sobre_no_coincide_con_fila'` y el `version_id` de esa versión. Mutante del verificador (quitar la línea `-- 6.19`): 0 filas; restaurar y comparar con `:'verif_original_036'`. |
| T036.B1 [4] | Nota propia sin cita, borrador vivo. PRO1 firma la v1 (gemela). Aserción: `borrador_contenido` y `borrador_abierta_en` quedan nulos. PRO1 inserta otra versión con motivo sin reabrir. | 23514 `No hay borrador vivo que firmar`. |
| T036.B2 [4] | Sigue a B1: PRO1, como autor, `update notas_clinicas set borrador_contenido = '{"texto":"v2","reservadas":""}', borrador_autor_id = :PRO1 where id = …` (lo que hace `empezarModificacion`). La v2 con motivo y `abierta_en` = la nueva `borrador_abierta_en`. | Entra; `numero_version = 2`. |
| T036.B3 [4] | Nota creada **sin** borrador (`borrador_contenido` nulo desde el `insert`). PRO1 firma la v1. | 23514 `No hay borrador vivo que firmar`. |
| T036.B4 [5] | Contra la nota de B3 (sin borrador): PRO2 (no autor, desbloqueado) y PRO1 con la ventana caducada (patrón de `:922-935`). | Los dos: **el mismo texto** que `:'err_b'` (42501 del paso 0); se añaden a la aserción de igualdad de C.perm. Con el mutante «sin paso 0» (`:943`), el de PRO1 caducado da 23514 `No hay borrador vivo`: el paso 0 es lo que lo tapa. |
| T036.C1-C3 [7] | Nota sin cita; `borrador_abierta_en` fijado a `t0 − 10 s` con microsegundos `.345000`. Sobres con `abierta_en` `.344Z` y `.346Z`. Gemela `.345Z`. | Las dos: 23514 `no es el instante en que la base abrió el borrador`. La gemela entra. |
| T036.C4-C5 [7] | Igual, con `borrador_abierta_en` de microsegundos `.345999`. | `.345Z` (truncado) entra; `.346Z` (redondeado) falla con el fragmento de C. |
| T036.P2a-b [11] | Nota **sin cita** (para que el mutante no tropiece con D). `borrador_abierta_en` = `t0 − 2 días` (para que 6.8 no salte antes). `creada_en` = `t0 − 1 día` y `t0 + 1 día`. | Las dos: 23514 `del reloj de la base`. Gemela: `creada_en = t0` entra. |
| T036.P3a-b [12] | Cita `KX` de otro paciente de PRO1; cita `KY` del mismo paciente con profesional PRO2. La cabecera apunta a cada una (como autor, antes de firmar: `update notas_clinicas set cita_id`); sobre con ese `cita_id` (así A pasa). | 23514 `no pertenece a esta nota`. Gemela con la cita propia entra. |
| T036.M1-M4 [10] | Cita propia en `CM20`: sobre con margen 15 → falla; con `null` → falla. Gemela con 20 entra. Segunda gemela: cita **sin centro**, margen 15 entra. Tercera: cita en `CMNULO`, margen 15 entra. | 23514 `no es el margen efectivo` en las dos negativas. |
| T036.D1-D4 [8] | (a) Cita de ayer (`inicio = t0 − 1 día`, `fin = inicio + 50 min`, `CMNULO`): sobre `true` falla, `false` entra. (b) Cita en curso (`inicio = t0 − 30 min`, `fin = t0 + 30 min`), borrador abierto en el escenario (≈ `now()`): sobre `false` falla, `true` entra. | Negativas: 23514 `no es el que recalcula la base`. |
| T036.D5-D7 [9] | `borrador_abierta_en = t0 − 1 h` (µs 0); cita en `CMNULO` (margen 15) con `inicio = abierta + 15 min` y `fin = t0 − 15 min` exactos: sobre `true` **entra**. Mover `inicio` +1 ms (la apertura queda 1 ms antes del borde): `true` falla. Restaurar y mover `fin` −1 ms (la firma queda 1 ms después del borde): `true` falla. | Fragmento de D. Cada uno en su `savepoint`; la cita se mueve como `postgres` antes de firmar. |
| T036.E1 [13] | Como `postgres`: nota sin borrador, sobre con `creada_en = 2026-01-01 00:00:00+00` y `abierta_en = creada_en`. | `assert_no_lanza`. Rótulo: «P1: la exención de postgres es una decisión del 01-10-2026; si esta prueba falla, alguien extendió 6.17-6.23 a todos los roles». |
| T036.X1-X7 [14] | Por cada fila de la tabla de fragmentos: `savepoint`; `t012c_mutar(:'sellar_original_036', fragmento, reemplazo)`; ejecutar **su** negativa como `authenticated` y comprobar `assert_no_lanza`; `rollback to savepoint`; comprobar `pg_get_functiondef(...) = :'sellar_original_036'`. | Las siete negativas dejan de lanzar sin su condición; la función vuelve idéntica. |

**Firmas `authenticated` que ya existían** (H15): la gemela de C.perm (`:982-985`, N067E) se
rehace como la aplicación. N067E recibe borrador vivo en la fijación del módulo (como `postgres`:
`update … set borrador_contenido = …, borrador_autor_id = :PRO1`), la firma usa
`creada_en = :'t0'` y `p_abierta_en` de la cabecera. Las negativas de C.perm no se tocan.

### 1.3 · Otros bancos del territorio

- **`04-baja.sql:25-34`** (H17): el `insert` de la nota de PROBAJA añade
  `borrador_contenido = '{"texto":"baja","reservadas":""}'` y `borrador_autor_id = :PROBAJA`; la
  firma usa `creada_en = now()` y `p_abierta_en => (select borrador_abierta_en from
  public.notas_clinicas where id = 'f0030001-0000-4000-8000-000000000004')`. Nada más.
- **`19-nota-en-episodio.sql`**: en `main` no tiene firmas `authenticated` (H18). Solo se toca
  si T-012 o T-035 le añadieron alguna, con el mismo tratamiento.
- **`20-*.sql`** (banco de T-012): cada firma `authenticated` que no reabra el borrador, que fije
  `creada_en` lejos de `now()`, o que mande un `abierta_en`, margen o `redactada` distintos de los
  de la base, se rehace como en 04. Las negativas de T-012 que esperan un error anterior a 6.16
  no cambian (las nuevas van detrás).
- **`00-ayudantes.sql`**: **no se toca** (§2.10).
- **`scripts/rls/README.md`**: una línea en la entrada del módulo 14 («T-036: 6.17-6.23; firma
  como la aplicación: borrador vivo, `abierta_en` de la cabecera, `creada_en` del reloj de la
  base») y una regla general: toda firma `authenticated` nueva en un banco se construye así.

### 1.4 · `scripts/t005-concurrencia.sql`: la doble firma concurrente (criterio 6)

Bloque nuevo **al final**, tras la aserción 4, con UUID propios `e0360006-…` que no chocan con
los de T-005. Confirma filas, como el resto del guion.

1. **Montaje como `postgres`** (sentencias sueltas, que sí interpolan `:VAR`): una nota
   `NOTA36` de Ana sobre su paciente y un episodio suyo (el mismo patrón con el que el guion ya
   crea sus notas tras T-034), **sin cita**. Firma de la v1 como `postgres` (exenta, P1). Un
   desbloqueo vigente para Ana: `insert into public.desbloqueos_historia (…)` con
   `caduca_en = now() + interval '10 minutes'` y las columnas reales de la tabla (verificarlas).
   Si `postgres` no puede insertar ahí, `fijar_pin_historia` + `desbloquear_historia` con el
   segundo factor simulado, como hace `00-ayudantes`.
2. **Reabrir** como Ana (`begin; set local role authenticated;` + `request.jwt.claims` con su
   `sub`): `update notas_clinicas set borrador_contenido = '{"texto":"v2","reservadas":""}', borrador_autor_id = <Ana> where id = NOTA36; commit;`.
3. **Los dos sobres**, preparados como `postgres` en una tabla no temporal
   `public.t036_sobres (clave text primary key, contenido text, creada_en timestamptz)`: `t1` y
   `t2`, con el mismo cuerpo, motivo y `abierta_en` (la `borrador_abierta_en` confirmada) y
   `creada_en = date_trunc('milliseconds', clock_timestamp())` cada uno. Se construyen con la
   función del guion (`public.t005_sobre_prueba`, ampliada con `p_abierta_en` y `p_motivo_cambio`
   si no los tiene) o con una gemela `public.t036_sobre_prueba`. El JSON se lee de la tabla
   dentro del `do`, así que **no pasa por el shell**.
4. **T1** (conexión principal): `begin;`, `set local role authenticated;`, claims de Ana,
   `insert` de la versión con el sobre `t1` y motivo. Entra y **no hace commit**. `reset role;`
   (sigue en la transacción y conserva el cerrojo de la fila de `NOTA36`).
5. **T2 en segundo plano**:
   `\! sh -c 'PGAPPNAME=t036_t2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "…" >/dev/null 2>&1 &'`.
   Cuerpo de T2: `set lock_timeout = '30s'; set request.jwt.claims = '{…Ana…}';` y un
   `do $do$ … $do$` que lee `t2` de `t036_sobres` **antes** de `set local role authenticated`,
   intenta el `insert` en un sub-bloque `begin … exception when others then …` guardando
   `sqlstate` y `sqlerrm`, hace `reset role` y escribe el resultado en `public.t005_resultado`
   con la clave `t036_t2`.
6. **Esperar a que T2 esté bloqueada** (todavía dentro de T1): un `do` que sondea hasta 10 s
   `pg_stat_activity` por `application_name = 't036_t2' and wait_event_type = 'Lock'`. Si no lo
   ve, `raise exception 'FALLO: T2 no llegó a esperar el cerrojo de T1'`: sin espera no hay
   carrera, y la prueba no probaría nada.
7. `commit;` de T1.
8. **Esperar el resultado de T2**: un `do` que sondea hasta 30 s
   `public.t005_resultado where clave = 't036_t2'`.
9. **Aserciones** (`do $$ … raise exception … $$`, con los UUID escritos a mano):
   - T2: `exito = false`, `sqlstate_code = '23514'` y `mensaje like '%No hay borrador vivo que firmar%'`;
   - `count(*) from notas_clinicas_versiones where nota_id = NOTA36` = **2** (la v1 de `postgres`
     y la v2 de T1);
   - `verificar_cadena_huellas(<paciente>)` = 0 filas.
10. `drop table public.t036_sobres;` (y la función gemela, si se creó).

Los nombres de columna de `t005_resultado` (`clave`, `exito`, `sqlstate_code`, `mensaje`) se
toman del `create table` del propio guion (`:52-60`); si difieren, mandan los del guion. El
comentario de cabecera del guion gana una línea: «T-036: la doble firma concurrente de una
modificación muere en 6.17 (borrador vivo)».

### 1.5 · `docs/architecture.md`

En §«1 · Cadena de huellas», tras la frase del paso 0 (`:96-99`), un párrafo con:
- las siete comprobaciones 6.17-6.23 (borrador vivo, `abierta_en` de la cabecera, `cita_id` de
  la cabecera, `firmada_en` a ±1 min del reloj de la base, la cita es de la nota, margen
  efectivo, `redactada_en_sesion` recalculado), todas 23514 y **después** del paso 0;
- **a quién se aplican**: solo a `authenticated` y `anon` (P1). `postgres` y `service_role`
  firman sin ellas (siembra, fijación, `test:huellas`); el importador decidirá su regla;
- **por qué el verificador no recalcula `redactada_en_sesion`** ni coteja `abierta_en` o el
  borrador: el ADR-046 lo prohíbe («derivarlo en la verificación»), la cita se puede reprogramar
  después, y `borrador_abierta_en` se vacía al firmar.

Y en la frase del verificador (`:106-107`), `cita_id` entra en la lista de claves que coteja con
la cabecera, «desde T-036».

### 1.6 · Lo que **no** se toca

`lib/**`, `app/**`, `lib/huella/vectores-congelados.json`, `supabase/seed*.sql`,
`scripts/rls/01-fijacion.sql`, `scripts/rls/00-ayudantes.sql` y las firmas de `postgres` de
`t005-concurrencia.sql`.

## 2 · Decisiones y alternativas descartadas

1. **Numeración 6.17-6.23 y sitio: después de 6.16, dentro de un bloque `if role in
   ('authenticated','anon')`.** Ninguna negativa existente cambia de error (H15) y ningún 23514
   nuevo sale antes que el 42501 del paso 0 (ADR-071.5). B queda después del paso 2 y antes de C,
   como pide el contrato. *Descartado*: ponerlas antes de 6.1, porque cambiaría el error de las
   negativas de 6.x que hoy firman sin borrador. *Descartado también*: aplicarlas a todos los
   roles, porque la siembra, la fijación y t005 firman como `postgres`, retrofechadas y sin
   borrador (P1).
2. **B se lee en la misma sentencia bloqueante del paso 2.** La segunda firma concurrente espera
   ese cerrojo y, en READ COMMITTED, relee la fila confirmada, con el borrador ya vaciado.
   *Descartado*: un `select` aparte del borrador, que es una sentencia más y un sitio donde
   equivocarse de foto. *Descartado también*: una restricción única o un cerrojo consultivo
   nuevo. El paso 3 ya serializa por paciente, pero va después del paso 2.
3. **C compara cadenas JSON**: `to_jsonb(to_char(borrador_abierta_en … 'MS'))` frente a
   `v_contenido -> 'abierta_en'`. `to_char … MS` trunca, igual que `new Date()` (H3). Así C exige
   a la vez el instante y la forma de `toISOString()`. *Descartado*: convertir el sobre a
   `timestamptz` y comparar, porque aceptaría `+00:00`, más de tres decimales y otras formas que
   Node nunca produce.
4. **A en minúsculas estrictas, sin `lower()`.** El sobre canónico sale de `construirSobre` en
   minúsculas (H21), y 6.11-6.16 tampoco normalizan. *Descartado*: `lower()`, porque dejaría dos
   sobres válidos (y dos huellas) para los mismos datos.
5. **P2: `creada_en` dentro de `now() ± 1 minuto`.** `now()` es fijo por transacción.
   - PostgREST abre una transacción por petición, así que en producción es el instante de la firma.
   - En los bancos es determinista: toda la sección corre en una transacción.
   - El minuto cubre la latencia de Node a la base y una deriva de reloj razonable.
   - La única ventana de falsificación es retrofechar menos de un minuto. Eso es pequeño frente a
     un margen de sesión de 15.

   *Descartado*: `clock_timestamp()`, que no es determinista en un banco largo. *Descartado*:
   sobrescribir `creada_en := now()` en el disparador, porque el sobre lleva `firmada_en` y 6.7
   exige igualdad, así que rompería la firma del cliente. *Descartado*: una tolerancia de
   segundos, que es frágil ante la deriva del servidor de Node.
6. **D usa los valores del sobre (ya atados por 6.18, 6.7 y 6.20) y `date_trunc('milliseconds')`
   en `inicio` y `fin` de la cita.** Así reproduce exactamente la aritmética en milisegundos de
   `calcularRedactadaEnSesion` (H12). *Descartado*: la cita con microsegundos, porque en el borde
   discreparía de Node por menos de 1 ms.
7. **Margen efectivo** = `coalesce(centros.margen, organizacion.margen)`, con `left join` desde la
   fila única de `organizacion` (H11). Cubre de una vez la cita sin centro y el centro con margen
   nulo. *Descartado*: una función auxiliar, porque tiene un solo uso.
8. **P3 va antes del margen y de D, y los mensajes no llevan valores.** El disparador es
   `security definer` y lee `citas` sin RLS. Si una cita ajena pasara P3, un error de D diría algo
   de su ventana. Con P3 primero, de una cita ajena solo se sabe que «no pertenece a esta nota».
9. **El verificador repite solo A.** Es la única de las siete que se puede cotejar después:
   `borrador_abierta_en` se vacía al firmar, el ADR-046 prohíbe derivar D en la verificación, y
   la cita y el margen pueden cambiar después.
10. **`pg_temp.sobre_prueba` no cambia.** Cambiar su `abierta_en` por defecto (hoy `creada_en`) a
    la cabecera rompería las decenas de firmas `postgres` retrofechadas sin borrador. El banco pasa
    `p_abierta_en` explícito. Por eso `00-ayudantes.sql` queda fuera, aunque el contrato lo admite.
11. **Un `savepoint` por escenario en el banco.** Así no se solapan citas del mismo profesional
    (rango bloqueante, H22) y cada caso parte de un estado conocido. *Descartado*: UUID distintos
    y horas distintas para cada cita, que dan más montaje y el mismo resultado.
12. **La concurrencia usa un `psql` en segundo plano y sondea `pg_stat_activity`.**
    - *Descartado*: el `\! psql` síncrono con `lock_timeout` (H19). Solo prueba que la segunda
      espera; no lo que pasa cuando el cerrojo se suelta, que es el criterio 6.
    - *Descartado*: `dblink`, porque la extensión no está y crearla se sale del territorio.
13. **La guarda de prerrequisitos (55000) va al principio de la migración.** Si T-036 se aplica
    sin T-012, falla en `db reset` con un mensaje legible y no dentro de cada firma.
14. **En `fn_congelar_cabecera_sellada` solo cambian el mensaje y el comentario** (H7). Su lógica
    ya congela `cita_id`.

## 3 · Cómo se cierra cada criterio de aceptación

| # | Cierre | Comando o comprobación |
|---|---|---|
| 1 | `db reset`, `seed`, `test:rls`; otro `db reset` y `test:huellas` | `npx supabase db reset && npm run seed && npm run test:rls; npx supabase db reset && npm run test:huellas` (exit 0) |
| 2 | T036.A1-A4 y su gemela | `npm run test:rls`, rótulos `T036.A*` en verde |
| 3 | T036.A5 en el banco, con la función que envuelve `verificar:huellas` (H24) y su mutante. Evidencia adicional fuera del banco: en una base recién sembrada, como `postgres`, una nota con cita firmada, la cabecera cambiada con los disparadores levantados y confirmada; `npm run verificar:huellas -- --paciente <uuid>` muestra la anomalía; `db reset` | Banco, y la salida pegada en la evidencia |
| 4 | T036.B1-B3 | `test:rls`, `T036.B*` |
| 5 | T036.B4, con la aserción «mismo texto que `err_b`» ampliada | `test:rls`, `T036.B4` y C.perm |
| 6 | §1.4: T2 espera el cerrojo (sondeo), muere con 23514 de B, y la nota acaba con 2 versiones (v1 + una) | `npx supabase db reset && npm run test:huellas` |
| 7 | T036.C1-C5 | `test:rls`, `T036.C*` |
| 8 | T036.D1-D4 | `test:rls`, `T036.D1-D4` |
| 9 | T036.D5-D7 | `test:rls`, `T036.D5-D7` |
| 10 | T036.M1-M4 (gemelas: centro con margen propio; sin centro; centro con margen nulo) | `test:rls`, `T036.M*` |
| 11 | T036.P2a-b y su gemela | `test:rls`, `T036.P2*` |
| 12 | T036.P3a-b y su gemela | `test:rls`, `T036.P3*` |
| 13 | T036.E1 | `test:rls`, `T036.E1` |
| 14 | T036.X1-X7, siete mutantes + `pg_get_functiondef` idéntica | `test:rls`, `T036.X*` |
| 15 | El guion de T-012 sigue firmando (`true` con la cita en curso, `false` con la de ayer) | `npx supabase db reset && npm run seed && npx tsx scripts/t012-nota.ts` (exit 0) |
| 16 | Ni la era ni el sobre cambian | `git diff --exit-code lib/huella/vectores-congelados.json` |
| 17 | La siembra tiene `cita_id` nulo en sobre y cabecera (H23) | `npx supabase db reset && npm run seed && npm run verificar:huellas` → «cadena íntegra: cero anomalías.» |
| 18 | — | `npm run lint:migraciones && npm test && npm run build && node ~/.claude/pipeline/territorio.mjs T-036` |

## 4 · Riesgos, por probabilidad

1. **Alta: firmas `authenticated` de T-012 que este diseño no ha visto.** El banco 20 y quizá
   algo nuevo en 14 o 19 pueden firmar sin borrador, retrofechadas o con `abierta_en` libre, y
   caerán en 6.17-6.20. *Detección*: `test:rls` tras la migración. *Arreglo*: §1.3, firma como la
   aplicación. Nunca se debilita la comprobación.
2. **Alta: nombres de T-012 distintos de los de su diseño.** Columnas, disparador o la marca de su
   migración pueden no coincidir. *Mitigación*: gate §0.B, y mandan los de `main`.
3. **Media: B2 firma la v2 con el mismo `t0` que la v1.** Si alguna comprobación existente exige
   `creada_en` creciente entre versiones, la v2 falla. *Arreglo*: la v2 usa `t0 + 1 ms`, que sigue
   dentro de P2. El implementador lo comprueba leyendo 6.x, sin suponer.
4. **Media: el `psql` en segundo plano dentro de `test:huellas`.** Depende de dónde corra el guion
   (contenedor o anfitrión) y de que `sh` y `psql` estén en ese PATH. *Mitigación*: el `\! psql`
   síncrono que ya existe (H19) prueba que `psql` está; el sondeo de 10 s con `FALLO` explícito
   impide un verde sin carrera.
5. **Media: un `update` de `cita_id` como autor antes de firmar** (P3a-b) puede chocar con un
   disparador de T-012 o T-035 que valide la cita al escribirla. Si existe, P3 ya está cubierta
   antes, y la negativa se monta como `postgres` con ese disparador levantado. Se anota en la
   bitácora.
6. **Baja: una deriva de reloj de más de 1 minuto entre Node y Postgres en producción** haría que
   toda firma falle con P2. Es visible al primer intento, porque la acción lo traduce a
   «conflicto». Ver la pregunta abierta (c).
7. **Baja: P3 bloquea para siempre la v2** si la cita de la nota se reasigna a otro profesional o
   paciente después de la v1 (H22). Ver la pregunta abierta (b).
8. **Baja: `scripts/t012-nota.ts` no es idempotente**, así que necesita `db reset` y `seed` antes.
   Ya está en el comando del criterio 15.

## 5 · Qué revisar

1. **Qué elige el llamante y qué efecto tiene.** El llamante elige el sobre entero y `creada_en`.
   - Tras T-036, `abierta_en`, `cita_id`, `margen_sesion_minutos` y `redactada_en_sesion` quedan
     atados a la base.
   - `firmada_en` queda atado a ±1 minuto.
   - Lo único libre es el texto, que es suyo.

   El revisor busca, para cada clave del sobre de la era 4, la comprobación 6.x que la ata.
   `nota_id`, `numero_version` y `hash_anterior` ya estaban atados.
2. **Orden.** Las siete van después de 6.16 y dentro del `if role in ('authenticated','anon')`.
   Ninguna toca el paso 0. `git diff` de la función contra `pg_get_functiondef` previo: solo
   cambian las líneas de §1.1 §2.
3. **Fragmentos únicos.** Hay que comprobar que ningún fragmento nuevo aparece en otro mensaje y
   que cada fragmento de mutante aparece exactamente una vez:
   `select f, (length(d) - length(replace(d, f, ''))) / length(f) from (select pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) d) x, unnest(array[…los 14 fragmentos…]) f;`
   Cada fila tiene que dar 1.
4. **Nulos.**
   - A: los dos lados nulos son `null` JSON y nunca `null` SQL; con `is distinct from`, un nulo SQL
     nunca hace pasar la comprobación (`.claude/rules/supabase.md`, T-005).
   - B: `borrador_contenido is not null` nunca es nulo.
   - C: si `borrador_abierta_en` fuese nulo con borrador vivo (el `check` de T-012 lo impide),
     `to_jsonb(null)` es `null` SQL distinto del sobre, y lanza.
   - P3: una cita inexistente (FK) deja las variables nulas, y lanza.
   - D: `v_margen` nunca es nulo porque la organización es `not null`.
5. **La negativa tiene que fallar por su motivo exacto.** Cada negativa cambia una sola cosa
   respecto de su gemela: misma nota, mismo perfil y mismo instante. Las de P2 van sin cita, para
   que no salte D. Las de C, sin cita, para que no salte D. Las de D, con `abierta_en` exacto. Si
   una negativa lanza con el fragmento de otra comprobación, la aserción falla, y eso es lo
   correcto.
6. **Concurrencia.**
   - El sondeo prueba que T2 esperó: si T2 no llegó a bloquearse, `FALLO`.
   - El recuento final es 2, no «al menos 2».
   - T1 no hace `commit` hasta ver a T2 en espera.
7. **Puertas laterales.**
   - **`postgres` y `service_role` siguen exentos** (E1 lo fija). `service_role` solo lo usa el
     servidor.
   - **`update` de la cabecera tras firmar**: `cita_id` sigue congelado por
     `fn_congelar_cabecera_sellada`, solo cambia el texto. Comprobar que el texto conserva «no se
     puede reatribuir».
   - **`TRUNCATE` y `DELETE`**: no cambian; las tres capas de `notas_clinicas_versiones` siguen.
   - **Permisos de tabla entera**: los `revoke` repetidos al final de cada función re-emitida.
8. **El verificador.**
   - La línea nueva es exactamente la de 6.19, con la misma expresión `coalesce(to_jsonb(...::text), 'null'::jsonb)`.
   - El CTE expone `cab_cita_id`.
   - El banco prueba el antes (0 filas), el después (1 fila, el `version_id` correcto) y el
     mutante.
9. **La guarda 55000** se dispara si falta T-012. Se prueba a mano una vez, renombrando
   temporalmente la migración de T-012 en un árbol desechable. Opcional, y se anota si se hace.
10. **Ni `lib/` ni `app/` cambian** (`git diff --stat`). El criterio 15 se cumple sin tocar código
    de aplicación.

## 6 · Territorio

El del contrato, sin ampliar:

```
supabase/migrations/*_firma_cotejada_con_borrador_y_cita.sql
scripts/rls/04-baja.sql
scripts/rls/14-cadena-huellas.sql
scripts/rls/19-nota-en-episodio.sql   # solo si T-012/T-035 le añadieron firmas authenticated (H18)
scripts/rls/20-*.sql                  # solo sus firmas authenticated
scripts/rls/README.md
scripts/t005-concurrencia.sql
docs/architecture.md
```

`scripts/rls/00-ayudantes.sql` está en el territorio del contrato, pero **este diseño no lo
toca** (§2.10). La memoria del ticket (`docs/bitacora/`, `docs/state.md`) y
`tickets/T-036/` son las de siempre.

## 7 · Delegable

**Nada.** Todo es disparador, RLS, cadena de huellas o banco con mutantes. El párrafo de
`docs/architecture.md` y la línea del README son cortos y dependen de decisiones de §2: los
escribe el implementador.

## 8 · Cortes

Un solo implementador (Opus), en este orden y con un commit por corte:

1. **Corte 1: migración y banco 14** (§1.1 y §1.2). Cierra 2-5 y 7-14. Se valida con
   `db reset` y `test:rls`, que en este corte puede fallar solo en 04 y 20.
2. **Corte 2: los otros bancos y la concurrencia** (§1.3 y §1.4). Cierra 1, 6, 15 y 17.
3. **Corte 3: la documentación** (§1.5 y el README) y el cierre 16 y 18.

## Lo que no entra, y por qué

- **Todo lo que el contrato excluye**:
  - el verificador no recalcula D ni coteja `abierta_en` o el borrador (ADR-046; el borrador se
    vacía al firmar);
  - no se coteja el cuerpo con el borrador;
  - las firmas de `postgres` y `service_role` quedan fuera (P1; el importador decidirá).
- **Cambiar `lib/huella/**`, `firmarNota` o `app/**`.** T-012 ya toma de la base `abierta_en`, la
  ventana, el margen y la cita, y traduce 23514 a «conflicto».
- **Cambiar `pg_temp.sobre_prueba`** (§2.10).
- **Una restricción que ate `notas_clinicas.cita_id` a paciente y profesional al escribirla.** P3
  se comprueba al firmar, que es lo que pide el contrato. Atarla al escribir sería otro ticket, y
  cambiaría lo que T-012 permite en el borrador.
- **Congelar `citas.inicio`, `fin` y `profesional_id` tras firmar.** El sello guarda lo que valía
  al firmar, y la agenda tiene que poder reprogramar.

## Decisiones del propietario (02-10-2026) — mandan sobre §1-§5

- **(a) Sí: A para todos los roles.** La línea 6.19 sale del bloque `if role in
  ('authenticated','anon')` y va detrás de 6.16 para cualquier rol. E1 sigue fijando que
  `postgres` está exento de las otras seis, no de A. Si algún banco firma como `postgres` con un
  `cita_id` distinto del de la cabecera, se corrige el banco y no la comprobación.
- **(b) P3 solo en la v1** (`numero_version = 1`). Las v2 y siguientes heredan una cita que ya
  se comprobó y que está congelada. P3a-b se prueban sobre la v1, con una gemela que reasigna la
  cita tras la v1 y firma una v2 **con éxito**. Se mantiene un mutante que quita la condición de
  versión.
- **(c) ±1 minuto**, fijo en el disparador.

## Preguntas abiertas para el propietario (respondidas arriba)

- **(a) ¿A para todos los roles?** 6.19 es coherencia pura, como 6.11-6.16, que valen para
  `postgres`. El verificador ya marca una fila de `postgres` con la cita equivocada. El contrato
  pone A dentro de P1 y el diseño le obedece. Si se quiere para todos, basta con sacar la línea
  6.19 del bloque de rol; ninguna siembra la rompe (H23).
- **(b) P3 y la reasignación de citas.** Si después de la v1 la cita se reasigna a otro
  profesional, o se corrige su paciente, la nota ya no admite v2: P3 falla siempre y
  `cita_id` está congelado. ¿Se acepta? La alternativa sería exigir P3 solo en la v1, que es un
  cambio de una línea, pero debilita el criterio 12 para las v2.
- **(c) La tolerancia de P2** es de ±1 minuto. Si el despliegue no garantiza NTP en el servidor de
  Node, convendría subirla. El diseño la deja fija en el disparador, sin configuración.

## Decisión del propietario (02-10-2026, revisión de T-012 corte A): R2-H1 entra aquí

`tickets/T-012/revision.md` R2-H1: el testigo del borrador se compara en TypeScript, varias consultas
antes del `insert`. `fn_vaciar_borrador_al_firmar` vacía el borrador que haya en ese momento, y 6.17
solo exige que haya uno. Una firma que leyó X sella X aunque entretanto otro guardado haya dejado Y,
e Y se pierde sin `conflicto` (ADR-036). **T-036 lo cierra en la base:** lo que se sella tiene que
corresponder al borrador vigente bajo el cerrojo del paso 2, y si no, 23514 de conflicto. Lo
concreta la enmienda que sigue.

## Enmienda del 02-10-2026 · R2-H1 y §0 revisado frente a `main` (`39b2df0`)

> Arquitecto, 02-10-2026, con T-012 corte A ya integrado (merge `44d6d67`). **Si choca con §0-§8 o
> con las decisiones del propietario de arriba, manda esta enmienda.** Solo retira de lo anterior
> lo que dice expresamente.

### E.0 · §0 revisado contra el código integrado

| Id | Hecho (leído el 02-10-2026 en `39b2df0`) | Ruta | Efecto sobre el diseño |
|---|---|---|---|
| E0.1 | T-012 corte A está en `main`. La última migración es `20261002120000_nota_clinica_borrador_firma.sql`; T-035 no ha entrado. | `supabase/migrations/` | Gate 5 cumplido: la marca de T-036 tiene que ser mayor que `20261002120000`. La cabecera de este documento, que dice «aún no está integrado», queda superada. |
| E0.2 | Lo prometido en §0.B existe con los nombres del diseño: <br>· `borrador_abierta_en`, con su relleno y su check `notas_clinicas_borrador_abierta_ck`; <br>· `fn_tocar_borrador` endurecida; <br>· `margen_sesion_minutos` en la organización (`not null default 15`) y en el centro (si es nulo, hereda). | `20261002120000:18-79` | Gates 1-3 cumplidos. |
| E0.3 | El disparador se llama **`tocar_borrador`** y salta en `before insert or update`, sin lista de columnas. En un UPDATE **conserva** `borrador_abierta_en`. Solo escribe `borrador_actualizado_en := now()` si el contenido cambia; si no, deja el del `old`. | `20260822094547:1399-1402`, `20261002120000:37-63` | Gate 4: el nombre que necesita §1.2 es `tocar_borrador`. Un guardado concurrente no mueve `abierta_en`, así que C no lo detecta (E.1). |
| E0.4 | T-012 **no** redefine `fn_sellar_version_nota`, `verificar_cadena_huellas` ni `fn_congelar_cabecera_sellada`. Su última definición sigue en `20261001120000`: <br>· el disparador, en `:46-399`; <br>· su paso 2, en `:118-122`; <br>· los únicos tres mensajes que contienen `abierta_en`, todos de 6.8, en `:290`, `:307` y `:312`. | `20261001120000_nota_id_en_el_sobre.sql` | §1.1 §2-§4 parte de esas definiciones. Ver E0.8. |
| E0.5 | **Nuevo**: `notas_clinicas_cita_autor_uidx` es único sobre `(cita_id, autor_id)` con `where cita_id is not null`. | `20261002120000:83-85` | Banco 14: dentro de un mismo `savepoint`, ningún profesional puede tener dos notas con la misma cita. Lo respetan A1-A4, P3a-b y la gemela de (b) que reasigna la cita: cada nota con cita va en su propio `savepoint`, o se reutiliza la cabecera. |
| E0.6 | Existen `fn_resolver_alerta_nota_sin_firmar()` (definer) y su disparador `resolver_alerta_nota_sin_firmar` (after insert), con la regla «mismo paciente; el profesional es el autor» (`:103-108`). | `20261002120000:90-133` | P3 copia esa regla, como decía §1.1. Confirmado. |
| E0.7 | `firmarNota`: <br>· compara el testigo **en TypeScript** (`:714`); el `insert` llega en el paso 7, después de 4 a 6 consultas (cita, centro, organización, recuento, conjunta). Es la ventana de R2-H1. <br>· firma `cuerpo: { texto }` sin transformar y `anotacionesReservadas: reservadas === '' ? null : reservadas` (`:795-796`). <br>· `construirSobre` pasa el sobre entero a NFC. <br>· el borrador se guarda **crudo** en `guardarBorrador` (`:577`), en `empezarModificacion` (`:669`, `reservadas: vigente.anotaciones_reservadas ?? ''`) y al abrir (`:549`, `{texto:'',reservadas:''}`). | `lib/notas/servidor.ts`, `lib/huella/sobre.ts`, `lib/huella/nfc.ts` | De aquí sale la forma del cotejo de E.1: NFC, y en las reservadas `''` ≡ `null`. |
| E0.8 | Traducción de errores (`:806-818`): <br>· 42501 → `no_disponible` o `bloqueada`; <br>· **23514 con un mensaje que contiene `abierta_en` → `'error'`**; <br>· el resto de 23514, y el 23505 → `'conflicto'`. | `lib/notas/servidor.ts:813-816` | **Corrige al contrato y a §1.1.** «Todas las negativas son 23514, así que T-012 las traduce a conflicto» es falso para 6.18 con el texto de §1.1, que contiene `abierta_en` dos veces: daría `'error'`. Se arregla en E.2. |
| E0.9 | El banco 20 firma siempre como `postgres`: los `como(:PRO1)` de 20.B7 (`:147-176`) solo escriben cabeceras. Sus sobres llevan el `cita_id` de su cabecera (`:264`, `:276`, `:301`, `:329`, `:349`). | `scripts/rls/20-nota-borrador.sql` | **Corrige §1.3 y el riesgo 1**: el banco 20 **no se toca**. A, que con la decisión (a) vale para todos los roles, pasa; P1 no le aplica. El 19 sigue sin firmas `authenticated` (H18). |
| E0.10 | Las dos firmas `authenticated` que ya existen usan un cuerpo sin `texto`: `04-baja.sql:32-33` lleva `{"t":"baja"}`, y la gemela N067E del 14 lleva `{"t":"firma"}` (`:892`, `:984`). | bancos | Con 6.24, las dos tienen que llevar `{"texto":…}` igual al borrador (E.6). |
| E0.11 | Las columnas de `t005_resultado` son `etiqueta`, `exito`, `sqlstate_code` y `mensaje`. | `scripts/t005-concurrencia.sql:57-62` | **Corrige §1.4**, pasos 5 y 8: donde pone `clave`, va `etiqueta`. |
| E0.12 | El guion ya escapa `\$do\$` en su `\!` (`:107-116`) porque `/bin/sh` expande `$do`. | `t005:107-116` | **Corrige el paso 5 de §1.4**: un `do $do$` dentro de `-c "…"` sin escapar se rompe. Se sustituye por una función (E.4.1). |
| E0.13 | `pg_temp.como_con_2fa` pone los claims `{"sub","role":"authenticated","aal":"aal2"}` y exige un factor dado con `dar_segundo_factor`. `t005` no carga `00-ayudantes`. | `scripts/rls/00-ayudantes.sql:76-120` | El montaje de §1.4 copia esos claims y ese factor dentro del guion. |
| E0.14 | `pg_temp.t012c_mutar` exige que el fragmento aparezca exactamente una vez; `t012c_restaurar` compara byte a byte. | `scripts/rls/14-cadena-huellas.sql:120-151` | X8-X11 (E.5) los usan igual que X1-X7. |
| E0.15 | `04-baja`, `14`, `19`, `00-ayudantes`, `t005` y `docs/architecture.md` no han cambiado entre `43d327d` y `39b2df0`. | `git diff --stat 43d327d 39b2df0` | H13-H19 y H25 siguen en pie. |
| E0.16 | ADR-074 y ADR-075 son nuevos y el contrato no los cita. | `docs/decisions.md` | No se han leído: no entran en T-036. |
| E0.17 | **Corrección a X1 (mutante de B).** Con B mutado, B1 y B3 no «dejan de lanzar». En el diseño original caían en C, porque con `borrador_abierta_en` nulo `to_jsonb(null)` es distinto del sobre; con esta enmienda caen en 6.24. | §1.2, fila X1 | X1 pasa a esperar 23514 con `no es el borrador vigente` (E.5), no `assert_no_lanza`. |

### E.1 · 6.24 · Lo que se sella es el borrador vigente (R2-H1)

**Piezas, todas en §1.1 §2 (`fn_sellar_version_nota` re-emitida):**

1. **`declare`**: tres variables más, que con las diez de antes suman trece.
   ```sql
   v_borrador_contenido  jsonb;
   v_mismo_texto         boolean;
   v_mismas_reservadas   boolean;
   ```
2. **Paso 2**: una columna más, en la **misma** sentencia bloqueante. El `where` y el
   `for no key update` no cambian.
   ```sql
   select n.paciente_id, n.episodio_id, n.autor_id, n.fecha_sesion, n.coprofesional_id,
          n.cita_id, n.borrador_contenido is not null, n.borrador_abierta_en, n.borrador_contenido
     into strict v_paciente_id, v_episodio_id, v_autor_cabecera, v_fecha_sesion, v_coprofesional_id,
          v_cita_cabecera, v_borrador_vivo, v_borrador_abierta_en, v_borrador_contenido
     from public.notas_clinicas n
    where n.id = new.nota_id
      for no key update;
   ```
   Si un guardado tiene la fila bloqueada, este `select` espera. En READ COMMITTED, cuando el guardado
   confirma, el `select` devuelve **la versión confirmada**, con el borrador nuevo. Esa es la garantía
   que pide R2-H1, y por eso el borrador no se lee en otra sentencia.
3. **Bloque nuevo, dentro del `if` de P1, justo después de 6.17 y antes de 6.18.** Se numera 6.24 para
   no renumerar 6.18-6.23 ni sus mutantes X2-X7. Cada condición va en **una línea**, porque los mutantes
   las buscan por fragmento.

```sql
    -- 6.24 · R2-H1 · Lo que se sella es el borrador VIGENTE, leído en el paso 2 bajo el cerrojo:
    -- un guardado de otra sesión entre la lectura de firmarNota y este insert se detecta aquí
    -- y no se pierde (ADR-036). Texto y reservadas en NFC a los dos lados: el borrador se guarda
    -- crudo y el sobre llega en NFC (lib/huella/nfc.ts). Texto nulo o ausente en cualquiera de
    -- los dos lados = no coincide. Reservadas: '' en el borrador ≡ null en el sobre (firmarNota).
    v_mismo_texto := coalesce(normalize(v_contenido #>> '{cuerpo,texto}', NFC) = normalize(v_borrador_contenido ->> 'texto', NFC), false);
    v_mismas_reservadas := normalize(nullif(v_contenido ->> 'anotaciones_reservadas', ''), NFC) is not distinct from normalize(nullif(v_borrador_contenido ->> 'reservadas', ''), NFC);
    if not (v_mismo_texto and v_mismas_reservadas) then
      raise exception 'Lo que se firma no es el borrador vigente de la cabecera: otra sesión lo cambió entretanto; hay que releerlo (T-036, R2-H1, ADR-036)'
        using errcode = '23514';
    end if;
```

**Por qué cada detalle:**
- El texto se lee **del sobre** (`v_contenido`), no de `new.cuerpo`: 6.3 ya los iguala, y lo que se
  sella es el sobre.
- El texto usa `coalesce(… = …, false)`: si la comparación da nulo, porque falta en un lado o en los
  dos, es «no coincide». Con `is not distinct from`, un sobre sin `texto` frente a un borrador sin
  `texto` pasaría (lo prueba R5).
- Las reservadas usan `nullif(…, '')` a los dos lados y `is not distinct from`. «Sin reservadas» llega
  como `''` o como clave ausente desde el borrador, y como `null` desde el sobre (E0.7). Las tres
  formas valen lo mismo.
- `normalize(…, NFC)` existe en Postgres desde la 13; la base local es la 17, en UTF-8. Se aplica a
  los dos lados para no depender de que Node y Postgres traigan la misma versión de Unicode sobre un
  texto que ya está en NFC. **Antes de nada**, el implementador comprueba en la base que
  `select normalize(U&'o\0301', NFC) = U&'\00F3'` da `true`.
- Código **23514** y un mensaje **sin** `abierta_en`: `firmarNota` lo traduce a `'conflicto'`
  (`servidor.ts:816`) sin tocar `lib/`.
- El fragmento de la aserción es **`no es el borrador vigente`**, que no aparece en ningún otro
  mensaje, viejo ni nuevo.
- No se protege 6.24 frente a un borrador nulo, porque B (6.17) va antes y para. Si alguien quita B,
  6.24 sigue parando la firma sin borrador: su texto nulo no coincide (E0.17).

**Comentarios del paso 6**: donde §1.1 punto 3 dice «6.17-6.23», ahora dice «6.17-6.24».

### E.2 · Ningún mensaje de 6.17-6.24 contiene `abierta_en`

`firmarNota` decide entre `'error'` y `'conflicto'` buscando la subcadena `abierta_en` (E0.8). Hoy solo
la llevan los tres mensajes de 6.8, que señalan un fallo de programación de la aplicación. En el
camino de la aplicación, C (6.18) solo falla por concurrencia: alguien descarta y reabre el borrador
entre la lectura y el `insert`. Su sitio es `'conflicto'`.

- **Se sustituye el mensaje de 6.18.** Conserva el fragmento de la aserción:
  `'El instante de apertura del sobre no es el instante en que la base abrió el borrador (columna de la cabecera, truncada a milisegundos) (T-036, ADR-046)'`.
  El comentario de 6.18 puede seguir citando `borrador_abierta_en`, porque los comentarios no llegan
  a `sqlerrm`.
- **La regla la comprueba la máquina**, con una aserción nueva del banco 14, **T036.T**:
  `(select count(*) from regexp_matches(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure), 'raise exception ''[^'']*abierta_en', 'g')) = 3`.
  Rótulo: «solo los tres mensajes de 6.8 contienen abierta_en; firmarNota traduce a conflicto todo
  lo demás (servidor.ts:813)».
- 6.17 y 6.19-6.23, tal como están en §1.1, ya cumplen la regla.

### E.3 · Banco 14: reglas que cambian y casos nuevos

**Regla nueva para toda firma `authenticated` de la sección T-036, de A1 a D7, positivas y negativas.**
- El borrador vivo es `{"texto":"<t>","reservadas":""}`.
- La firma lleva `cuerpo = '{"texto":"<t>"}'` en la columna y en el sobre.
- `anotaciones_reservadas` va nulo a los dos lados.

Así cada negativa muere por su motivo y no por 6.24. B2 ya escribe
`{"texto":"v2","reservadas":""}`, así que su sobre lleva `{"texto":"v2"}`.

**Casos nuevos.** Rótulos `T036.R*`; `[R]` es la decisión del propietario del 02-10. Todos van sin
cita, para que no intervenga D. Cada uno en su `savepoint`, como PRO1 y con `creada_en = :'t0'`.

| Rótulo | Montaje | Esperado |
|---|---|---|
| T036.R1 [R] | Nota con borrador `{"texto":"X","reservadas":""}`. Se construye el sobre con X. Después, **como PRO1** (lo que hace `guardarBorrador`): `update notas_clinicas set borrador_contenido = '{"texto":"Y","reservadas":""}', borrador_autor_id = :PRO1 where id = … and borrador_actualizado_en = <testigo leído>`, con una aserción de que tocó una fila. Por último, la firma con el sobre X. | 23514 `no es el borrador vigente`. Después, el borrador sigue siendo Y y la nota sigue sin versiones. **Gemela**: el sobre con Y entra y deja el borrador vacío. |
| T036.R2a [R] | Borrador `{"texto":"X","reservadas":"mías"}`; sobre con X y reservadas nulas. | 23514 `no es el borrador vigente`. |
| T036.R2b [R] | Borrador `{"texto":"X","reservadas":""}`; sobre con X y `p_anotaciones_reservadas => 'mías'`, y la columna `anotaciones_reservadas = 'mías'`, para que pase 6.4. | 23514 `no es el borrador vigente`. **Gemela R2c**: borrador con `"mías"`, y sobre y columna con `'mías'`. Entra. |
| T036.R3 [R] | Gemela explícita de la aplicación: borrador con `"reservadas":""`, sobre con reservadas nulas. Segunda gemela: borrador **sin** la clave `reservadas` (`{"texto":"X"}`). | Las dos entran. |
| T036.R4 [R] | Borrador escrito como autor con `jsonb_build_object('texto', U&'sesi\006F\0301n', 'reservadas', '')` (NFD). Sobre con `jsonb_build_object('texto', U&'sesi\00F3n')` (NFC). Antes, una aserción de que las dos cadenas son distintas byte a byte, para que la gemela no sea vacía. | **Entra.** |
| T036.R5 [R] | Como `postgres`, borrador `{"t":"x","reservadas":""}`. PRO1 firma con cuerpo `{"t":"x"}` en la columna y en el sobre. | 23514 `no es el borrador vigente`: un texto ausente en los dos lados no coincide. |
| T036.T [R] | La aserción de E.2. | `count = 3`. |

### E.4 · Concurrencia: guardar mientras se firma (`scripts/t005-concurrencia.sql`, §1.4.bis)

**E.4.1 · Tres correcciones que valen también para §1.4**

**(a) T2 vive en una función, no en el `-c "…"`.** Antes de las carreras, como `postgres`, se crea
`public.t036_firmar_en_segundo_plano(p_etiqueta text, p_clave_sobre text, p_mutar boolean) returns void`:
- plpgsql e **invoker**: `set role` está prohibido dentro de un definer;
- con nombres cualificados y `revoke execute … from public, anon, authenticated`;
- se borra al final.

Su cuerpo, en orden:
1. `perform set_config('lock_timeout', '30s', true)`.
2. Lee `contenido` y `creada_en` de `public.t036_sobres where clave = p_clave_sobre`. Aún es `postgres`.
3. Un sub-bloque `begin … exception when others then …` que hace:
   - si `p_mutar`: `execute replace(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure), 'if not (v_mismo_texto and v_mismas_reservadas) then', 'if false then')`;
   - `perform set_config('request.jwt.claims', '{"sub":"<Ana>","role":"authenticated","aal":"aal2"}', true)`
     y después `set local role authenticated`;
   - el `insert` en `notas_clinicas_versiones`: la nota del sobre, `cuerpo = contenido::jsonb -> 'cuerpo'`,
     `contenido_canonico = contenido`, `autor_id` de Ana y el `creada_en` de la tabla;
   - `v_exito := true`;
   - si `p_mutar`: `raise exception using errcode = 'P0001', message = 't036: deshacer el mutante'`.

   En el `exception`, si `not v_exito`, se guardan `sqlstate` y `sqlerrm`. Las variables de plpgsql no
   se deshacen con el sub-bloque. **El sub-bloque deshace a la vez el mutante y la firma: el mutante
   nunca se confirma.**
4. Fuera del sub-bloque: `reset role` y el `insert` en `public.t005_resultado` (`etiqueta`, `exito`,
   `sqlstate_code`, `mensaje`).

La línea `\!` ya no lleva `$` ni JSON. No hace falta `sh -c`, porque `\!` ya pasa por `/bin/sh`:

```
\! PGAPPNAME=t036_r psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select public.t036_firmar_en_segundo_plano('t036_r','r1',false)" >/dev/null 2>&1 &
```

**(b) El sondeo limpia la instantánea en cada vuelta.** Dentro de una transacción, un backend lee
`pg_stat_activity` una sola vez y conserva esa foto hasta el final de la transacción. T1 sondea
**dentro** de la suya, que sigue abierta. Por eso cada vuelta hace `perform pg_stat_clear_snapshot();`
y después consulta `pg_stat_activity where application_name = '<etiqueta>' and wait_event_type = 'Lock'`.

Si en 10 s no la ve, el `FALLO` imprime lo que ve de esa etiqueta (estado y evento). Así se distingue
«no conectó» de «no esperó».

**(c) La columna es `etiqueta`** (E0.11).

**Sobres y orden en el guion**
- Los sobres se construyen con una gemela, `public.t036_sobre_prueba(p_nota_id, p_autor_id,
  p_creada_en, p_cuerpo, p_abierta_en, p_motivo_cambio)`: es `t005_sobre_prueba` más esos dos
  parámetros. `t005_sobre_prueba` **no se toca**, porque la usan las firmas de T-005. La gemela se
  borra al final.
- Todo lo nuevo va **antes** de los `drop` de `:196-197`, que siguen siendo lo último del guion.

**E.4.2 · La carrera de verdad** (después del bloque de §1.4)

1. **Montaje, como `postgres`.**
   - Una nota `NOTA36R` (`e0360006-0000-4000-8000-000000000002`) de Ana, con su paciente y su episodio
     (los de `NOTA36`) y **sin cita**.
   - Su borrador es `'{"texto":"X","reservadas":""}'`, con `borrador_autor_id` de Ana.
   - `\gset` guarda la `borrador_abierta_en` que resulta.
   - Una aserción comprueba que el desbloqueo de Ana de §1.4 sigue vigente.
2. **El sobre `r1`** en `public.t036_sobres` es lo que `firmarNota` leyó:
   - cuerpo `{"texto":"X"}`;
   - `abierta_en` = la del paso 1;
   - `creada_en = date_trunc('milliseconds', clock_timestamp())`;
   - sin motivo: es la v1.
3. **T1, que guarda, en la conexión principal.**
   - `begin; set local role authenticated; set local request.jwt.claims = '<Ana, aal2>';`.
   - Un `do` que lee el testigo y hace
     `update public.notas_clinicas set borrador_contenido = '{"texto":"Y","reservadas":""}', borrador_autor_id = <Ana> where id = <NOTA36R> and paciente_id = <paciente> and borrador_actualizado_en = <testigo>`.
     Es el `update` de `guardarBorrador`. Exige `row_count = 1`.
   - `reset role;`.
   - **Sin commit**: así conserva el cerrojo de la fila.
4. **T2, que firma, en segundo plano**, con la línea `\!` de E.4.1: etiqueta `t036_r`, sobre `r1` y
   `p_mutar = false`. Su `insert` espera en el paso 2.
5. **Sondeo**, como en E.4.1 (b). Si falla, `FALLO: la firma no llegó a esperar el cerrojo del
   guardado`: sin espera no hay carrera.
6. `commit;` de T1. Y queda confirmado.
7. **Espera del resultado** de `t036_r` en `t005_resultado`, hasta 30 s. Si no aparece, `FALLO`.
8. **Aserciones**, en un `do` con los UUID escritos a mano:
   - `exito = false`, `sqlstate_code = '23514'` y `mensaje like '%no es el borrador vigente%'`. Si no,
     `FALLO: la firma selló un borrador que otra sesión había cambiado (R2-H1): exito=%, sqlstate=%, mensaje=%`;
   - `NOTA36R` tiene **0** versiones;
   - su borrador sigue vivo, con `->> 'texto' = 'Y'`: el guardado no se perdió;
   - su `borrador_abierta_en` es la del paso 1. La causa no fue C: `fn_tocar_borrador` conserva
     `abierta_en` (E0.3);
   - `verificar_cadena_huellas(<paciente>)` devuelve 0 filas.

**E.4.3 · Control mutante** (automático: demuestra que la prueba cae sin el cotejo)

1. Como `postgres`:
   - una aserción de que `if not (v_mismo_texto and v_mismas_reservadas) then` aparece **exactamente
     una vez** en `pg_get_functiondef`;
   - se guarda la definición en `public.t036_original (definicion text)`.
2. **El sobre `r2`**: cuerpo `{"texto":"Y"}` (lo vigente), la misma `abierta_en` y un `creada_en` nuevo.
3. **T1**, como en el paso 3 de E.4.2, guardando `{"texto":"Z","reservadas":""}`. Sin commit.
4. **T2**, con etiqueta `t036_m`, sobre `r2` y **`p_mutar = true`**. Después, sondeo, `commit` de T1 y
   espera del resultado, igual que antes.
5. **Aserciones**:
   - `exito = true`. Si no: `FALLO: sin el cotejo 6.24 la firma tenía que ganar la carrera; si no la gana, la carrera de E.4.2 no prueba el cotejo: exito=%, sqlstate=%, mensaje=%`;
   - `NOTA36R` sigue con **0** versiones, porque el sub-bloque deshizo la firma, y su borrador es Z;
   - `pg_get_functiondef(...) = (select definicion from public.t036_original)`. Si no,
     `FALLO: el mutante quedó confirmado; npx supabase db reset antes de nada`.

**E.4.4 · Prueba manual, una sola vez, para la evidencia** (cumple al pie de la letra «la prueba cae
si se quita el cotejo»)

1. `npx supabase db reset`.
2. Como `postgres`, con `docker exec -i <supabase_db_…> psql -U postgres -d postgres -v ON_ERROR_STOP=1`
   y un heredoc, un `do` que comprueba que el fragmento aparece una sola vez y hace
   `execute replace(pg_get_functiondef(...), 'if not (v_mismo_texto and v_mismas_reservadas) then', 'if false then')`.
   El mutante queda **confirmado**.
3. `npm run test:huellas`. Tiene que salir con un código distinto de 0 y mostrar
   `FALLO: la firma selló un borrador que otra sesión había cambiado (R2-H1)`.
4. `npx supabase db reset`.

Las tres salidas se pegan en `tickets/T-036/evidencia`.

### E.5 · Mutantes: los nuevos y la corrección

Todos siguen el patrón de X1-X7: `savepoint`, `t012c_mutar(:'sellar_original_036', …)`, la negativa,
`rollback to savepoint` y comparación con `:'sellar_original_036'`.

| Id | Fragmento → reemplazo | Lo que se espera con el mutante |
|---|---|---|
| X8 | `if not (v_mismo_texto and v_mismas_reservadas) then` → `if false then` | R1 y R2a: `assert_no_lanza` |
| X9 | `v_mismo_texto := ` → `v_mismo_texto := true or ` | R1: `assert_no_lanza`. R2a sigue lanzando `no es el borrador vigente`: las dos condiciones son independientes |
| X10 | `v_mismas_reservadas := ` → `v_mismas_reservadas := true or ` | R2a: `assert_no_lanza`. R1 sigue lanzando `no es el borrador vigente` |
| X11 | `normalize(v_borrador_contenido ->> 'texto', NFC)` → `(v_borrador_contenido ->> 'texto')` | La gemela R4 **pasa a lanzar** 23514 `no es el borrador vigente`: la NFC del lado del borrador hace falta |
| X1 (corregido) | `if not v_borrador_vivo then` → `if false then` | B1 y B3 lanzan 23514 `no es el borrador vigente`, **no** `assert_no_lanza` (E0.17). B es la primera barrera y 6.24 la segunda |
| control t005 | El de X8, dentro del sub-bloque de T2 | `exito = true` (E.4.3) |

**Precedencia.** `true or <expr>` es `true` sea cual sea `<expr>`. `coalesce(…)` es una llamada a
función, y `IS NOT DISTINCT FROM` ata más fuerte que `OR`. Ninguno de los tres reemplazos cambia cómo
se analiza el resto de la línea.

### E.6 · Otros bancos (corrige §1.3)

- **`04-baja.sql:25-34`**:
  - el `insert` de la nota añade `borrador_contenido = '{"texto":"baja","reservadas":""}'` y
    `borrador_autor_id = :PROBAJA`;
  - la firma pasa a `cuerpo = '{"texto":"baja"}'`, en la columna y en el sobre;
  - `creada_en = date_trunc('milliseconds', now())`, en la columna y en `sobre_prueba`;
  - `p_abierta_en => (select borrador_abierta_en from public.notas_clinicas where id = 'f0030001-0000-4000-8000-000000000004')`.

  Ninguna aserción posterior de 04 lee el cuerpo (`:76` cuenta filas).
- **N067E (14)**:
  - en la fijación, como `postgres`, borrador `{"texto":"firma","reservadas":""}`;
  - el sobre de la gemela (`:984`) **se recalcula justo antes de ella**, con `{"texto":"firma"}`,
    `creada_en = :'t0'` y `p_abierta_en` de la cabecera;
  - su columna `cuerpo` pasa a `{"texto":"firma"}`;
  - el `sobre_e` de `:892` se queda como está para las negativas de C.perm, que mueren en el paso 0.
- **`20-*.sql` y `19-*.sql`: no se tocan** (E0.9). El glob sigue en el territorio, con diff vacío
  esperado.

### E.7 · `docs/architecture.md` y README (amplía §1.5)

- **`docs/architecture.md`**: la lista de §1.5 pasa a ser «6.17-6.24». Se añaden dos frases:
  - «6.24: lo que se sella es el borrador vigente (texto y reservadas en NFC), leído bajo el cerrojo
    de la cabecera; si otra sesión lo guardó entretanto, 23514 y la acción responde conflicto (R2-H1,
    ADR-036)»;
  - «ningún mensaje de estas comprobaciones contiene `abierta_en`: es la subcadena con la que la
    acción distingue un error de programación de un conflicto».
- **README**: la línea del módulo 14 pasa a decir «6.17-6.24».

### E.8 · Decisiones y alternativas descartadas (R2-H1)

1. **Se coteja el contenido, no un testigo.** El `insert` ya lleva lo que `firmarNota` leyó, que es
   el sobre. La base lo compara con lo vigente en la misma sentencia que toma el cerrojo. No hace
   falta ningún canal nuevo ni código de aplicación.

   *Descartado*: el testigo. Para usarlo, el disparador necesita el testigo leído por el cliente, y
   cualquier forma de hacérselo llegar se sale del contrato:
   - (i) una columna en `notas_clinicas_versiones` cambia una tabla sellada y `lib/huella/firmar.ts`;
   - (ii) una cabecera de petición (`request.headers`) cambia `firmarVersionNota`, que está en
     `lib/huella/**`, excluido por el contrato;
   - (iii) una RPC cambia `servidor.ts`.

   Además, el testigo es un sustituto: rechazaría X→Y→X, donde no se pierde nada. El contenido mide
   el invariante real: lo sellado es lo vigente.
2. *Descartado*: comparar instantes (`borrador_actualizado_en ≤ creada_en`). `creada_en` lo elige el
   cliente con ±1 min de holgura (P2), así que no ordena nada frente al `now()` de un guardado.
3. **Enmienda al contrato.** En «Lo que no entra», el contrato excluía «cotejar el cuerpo firmado con
   el borrador (no protege nada)». La decisión del propietario del 02-10 lo deja sin efecto.
   - La exclusión era cierta frente al propio autor, que puede guardar lo que quiera y firmarlo.
   - Lo que el cotejo protege es otra cosa: la actualización perdida entre dos sesiones, que es lo
     que ADR-036 prohíbe («avisa en vez de pisar en silencio»).

   No contradice ningún ADR: el bloqueo optimista por `borrador_actualizado_en` sigue mandando en el
   guardado.
4. **23514, y no 40001 ni P0001.** `firmarNota` solo traduce a `'conflicto'` el 23514 y el 23505. Los
   otros dos caerían en `'error'`, y lo correcto para el usuario es «relee».
5. **Dentro de P1.** `postgres` firma sin borrador: siembra, fijación y T-005.
6. **Justo después de 6.17 y antes de C.** Así quedan juntas las tres comprobaciones del borrador:
   que esté vivo, que sea el vigente y su apertura. Sin B, 6.24 sigue parando la firma sin borrador.
7. **NFC a los dos lados, texto nulo cuenta como «no coincide», y `''` ≡ `null` en reservadas**
   (E0.7). Lo prueban R3, R4, R5 y X11.
8. **El mutante de la carrera va en un sub-bloque de T2 y nunca se confirma.**

   *Descartado*: mutar con commit dentro de `t005`. Si el guion muere entre mutar y restaurar, la
   base local se queda con una firma sin cotejo hasta el siguiente `db reset`, sin avisar. La prueba
   manual de E.4.4 sí lo confirma, pero una sola vez y con el reset escrito en el procedimiento.
9. **T2 dentro de una función**, para que ni `$` ni JSON pasen por el shell (E0.12). `dblink`, igual
   que en §2.12, queda descartado.
10. **Se reescribe el mensaje de 6.18 en vez de tocar `firmarNota`.** `lib/` está fuera del
    territorio, y en el camino de la aplicación C solo falla por concurrencia.

### E.9 · Cómo se cierra (R2-H1 no tiene número en el contrato: «[R]»)

| Cierre | Comprobación |
|---|---|
| R-a · el cotejo y sus gemelas | `npm run test:rls`: `T036.R1`-`R5` y `T036.T` en verde |
| R-b · mutantes del banco | `npm run test:rls`: `T036.X8`-`X11` y X1 corregido en verde, con la función idéntica después de cada uno |
| R-c · la carrera | `npx supabase db reset && npm run test:huellas` sale con 0 y escribe los `OK` de E.4.2 |
| R-d · control automático | La misma ejecución escribe el `OK` de E.4.3 |
| R-e · la prueba cae sin el cotejo | E.4.4: código de salida distinto de 0 y el texto del `FALLO`, pegados en la evidencia |
| R-f · la aplicación sigue firmando | Criterio 15: `scripts/t012-nota.ts` firma v1, v2 y v3 («solo reservadas») con `firmarNota`; es el camino positivo de 6.24 de principio a fin |
| R-g · `lib/` y `app/` intactos | `git diff --stat main -- lib app` vacío |

### E.10 · Riesgos nuevos, por probabilidad

1. **Media: el sondeo no ve la espera**, porque la foto de `pg_stat_activity` dura lo que la
   transacción.
   - *Mitigación*: E.4.1 (b).
   - El `FALLO` imprime lo que ve, así que no puede salir verde sin carrera.
2. **Media: `set local role` dentro de la función de T2.**
   - Está permitido en una función invoker.
   - Si la versión local lo rechaza, se usa el equivalente `perform set_config('role',
     'authenticated', true)` y se anota en la bitácora.
3. **Media: al rehacer N067E se tocan también las negativas de C.perm.**
   - *Regla*: solo cambia la gemela; `sobre_e` sigue sirviendo a las negativas.
4. **Baja: tablas Unicode distintas en Node y en Postgres.**
   - Pasaría con un carácter compuesto asignado después de la versión de Postgres: Node lo
     descompone y Postgres no lo conoce.
   - Daría un `conflicto` falso: siempre visible, nunca una pérdida silenciosa.
   - No se mitiga más.
5. **Baja: P2 y C también salen como `'conflicto'`.**
   - Una deriva de reloj de más de un minuto se vería como conflictos repetidos (ya estaba en el
     riesgo 6).
   - Distinguirlo es cosa de `firmarNota`, en el corte B de T-012.
6. **Baja: X→Y→X entre la lectura y el `insert` se firma sin conflicto.**
   - Es lo que se busca: lo sellado es lo vigente.

### E.11 · Qué revisar (se suma a §5)

1. **Paso 2**: `v_borrador_contenido` sale de la **misma** sentencia `select … for no key update`, no
   de otra.
2. **Nulos**:
   - borrador nulo: el texto queda nulo y no coincide (X1 corregido);
   - sin `texto` en los dos lados: no coincide (R5);
   - reservadas `''`, ausentes o `null`: son iguales (R3);
   - reservadas `'a'` frente a `null`: son distintas (R2a y R2b).
3. **Fragmentos**: la consulta de §5 punto 3 suma `no es el borrador vigente`,
   `if not (v_mismo_texto and v_mismas_reservadas) then`, `v_mismo_texto := `,
   `v_mismas_reservadas := ` y `normalize(v_borrador_contenido ->> 'texto', NFC)`. Cada fila tiene
   que dar 1.
4. **Mensajes**: T036.T da 3, y los tres son de 6.8. El nuevo 6.18 conserva
   `no es el instante en que la base abrió el borrador`.
5. **Carrera**:
   - T1 toma el cerrojo con el `update` real del guardado, no con un `select for update`;
   - T1 no hace commit hasta ver a T2 esperando;
   - el resultado de T2 existe y es exactamente 23514 con su fragmento;
   - quedan 0 versiones;
   - el borrador es Y y luego Z;
   - el control da `exito = true`;
   - la definición es idéntica al final.
6. **Qué puede elegir quien llama**: el texto y las reservadas del sobre. Ahora tienen que coincidir
   con el borrador vigente, que el mismo autor puede reescribir por PostgREST. 6.24 no limita al
   autor; impide sellar una lectura caducada.
7. **Carrera al revés** (la firma toma el cerrojo primero y el guardado espera): el `update` del
   guardado reevalúa `borrador_actualizado_en = testigo` sobre la fila ya vaciada y toca 0 filas, así
   que `diagnosticarCeroFilas` responde `sin_borrador`. No es silenciosa, y T-036 no la cambia.
8. **`lib/` y `app/` no cambian** (R-g).

### E.12 · Territorio, delegable y cortes

- **Territorio**: no cambia, basta el del contrato.
  - Las funciones y tablas auxiliares de la carrera (`t036_*`) viven dentro de
    `scripts/t005-concurrencia.sql` y se borran al final.
  - `scripts/rls/19-*.sql` y `scripts/rls/20-*.sql` quedan con diff vacío (E0.9).
- **Delegable**: sigue sin haber nada (§7).
- **Cortes** (§8):
  - corte 1: E.1, E.2, E.3 y E.5;
  - corte 2: E.4 y E.6;
  - corte 3: E.7.

### E.13 · R4-H1: no es de T-036

`servidor.ts:417` (`if (!acceso.ok) return { estado: 'bloqueada' }`) es código de aplicación en
`lib/notas/`. Está fuera del territorio de T-036, y el contrato excluye `lib/` y `app/`. Además decide
qué ve el usuario: la pantalla del PIN o «vuelve a intentarlo». Es del **corte B de T-012**, donde
`docs/state.md` ya lo apunta junto a R4-H2. No se diseña aquí.

### E.14 · Lo que no entra, y por qué (R2-H1)

- **Que el verificador repita 6.24.** El borrador se vacía al firmar y después no queda con qué
  cotejar.
- **Probar la carrera al revés.** Es comportamiento de `guardarBorrador`, en `lib/`, y ya responde
  `sin_borrador` (E.11.7).
- **Que `firmarNota` distinga C o P2 de 6.24, o normalizar el borrador al guardar.** Las dos cosas
  cambian `lib/`.
- **Validar la forma del cuerpo** (que solo lleve `texto`). Es una regla del esquema del sobre, no
  de R2-H1.

### E.15 · Lo que el implementador lee, en este orden

1. `tickets/T-036-cita-id-cotejado-con-la-cabecera.md`, hasta `## Anexos`.
2. Este diseño entero. Donde choque, manda la enmienda E.
3. `.claude/rules/supabase.md` y `.claude/rules/pipeline.md`.
4. `supabase/migrations/20261001120000_nota_id_en_el_sobre.sql`:
   - `:46-399`, el disparador; el paso 2 está en `:113-122`;
   - `:442-634`, el verificador;
   - la definición de `fn_congelar_cabecera_sellada`.
5. `supabase/migrations/20261002120000_nota_clinica_borrador_firma.sql`, entera.
6. `supabase/migrations/20260822094547_esquema_base_organizacion_paciente_historia.sql:1399-1402`, el
   disparador `tocar_borrador`.
7. `lib/notas/servidor.ts`, solo lectura:
   - `:567-601`, `guardarBorrador`;
   - `:635-690`, `empezarModificacion`;
   - `:692-825`, `firmarNota` y su traducción de errores.
8. `lib/huella/firmar.ts`, `lib/huella/sobre.ts` y `lib/huella/nfc.ts`, solo lectura.
9. `scripts/rls/00-ayudantes.sql`:
   - `:76-120`, claims y segundo factor;
   - `:195-239`, `sobre_prueba`.
10. `scripts/rls/14-cadena-huellas.sql`:
    - `:120-151`, los mutantes;
    - `:642-646`, las definiciones guardadas;
    - `:885-995`, C.perm y N067E.
11. `scripts/rls/04-baja.sql:15-40`.
12. `scripts/rls/20-nota-borrador.sql:144-176` y `:250-350`, solo para confirmar E0.9.
13. `scripts/t005-concurrencia.sql` entero; `scripts/test-huellas.mjs` y `scripts/psql.mjs` para ver
    cómo se ejecuta el guion dentro del contenedor.
14. `scripts/t012-nota.ts`, para el criterio 15 y R-f.
15. `tickets/T-012/revision.md`, R2-H1 (`:219-237`).
16. `docs/decisions/ADR-036.md`, `ADR-046.md`, `ADR-071.md` y `ADR-073.md`.
