# T-036 · La firma no se fía del cliente · Diseño

> Arquitecto, 02-10-2026. Diseñado sobre `main` (`43d327d`) **más lo que promete §1.2 del diseño
> de T-012**, que aún no está integrado. Toda pieza marcada **[T-012]** no existe hoy en `main`;
> el implementador la re-verifica contra `main` antes de escribir una línea (§0.B).

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
corresponder al borrador vigente bajo el cerrojo del paso 2, y si no, 23514 de conflicto. **Pendiente:
el arquitecto concreta el cotejo** (cuerpo frente a `borrador_contenido`, o un testigo que escribe
solo `fn_tocar_borrador`), su prueba concurrente y su mutante, antes de implementar.
