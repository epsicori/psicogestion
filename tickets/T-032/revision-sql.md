SIN HALLAZGOS ALTA en la mitad SQL (tercera ronda, commit 0494226). Quedan 2 MEDIA y 2 BAJA.

# T-032 · Revisión SQL, tercera ronda (migración, RLS, banco, solo adición, siembra)

Diff revisado: `git diff main...0494226` (rama `worktree-agent-a2fbeaf1f1cdd100e`), limitado a
`supabase/**`, `scripts/rls/**`, `scripts/t032-alta.ts`, `lib/supabase/tipos-bd.ts` y los ADR.
Para ver qué cambió desde la ronda anterior usé `git diff e306a30 0494226`. De `app/` solo leí
`[id]/datos.ts:398-431`, porque ahí se lee la tabla nueva de solo adición.

Recuento: **0 ALTA · 2 MEDIA · 2 BAJA**. Cierro los cinco hallazgos de la segunda ronda (H1-H5).

## Qué medí (todo en `begin read only … rollback`, sin `db reset`)

- La base local tiene aplicada la migración de esta ronda: la tabla tiene las columnas `id`,
  `paciente_id`, `alergias`, `medicacion_actual`, `registrado_en` y `registrado_por`, y
  `fn_firmante_no_es_solo_contacto` contiene `for share`.
- `\dp public.pacientes_salud_basica` da `postgres=arDxtm` y `authenticated=ar`. No hay `anon` ni
  `service_role`. Ni `authenticated` ni `postgres` tienen `w` (update) ni `d` (delete). Hay dos
  políticas y ninguna menciona `tecnico_administrativo`.
- Hay cuatro disparadores: `salud_basica_autoria` (7 = before insert, por fila),
  `impedir_modificacion_…` (27 = before update or delete, por fila), `impedir_truncado_…`
  (34 = before truncate, por sentencia) y `auditar_…` (5 = after insert, por fila).
- `cobertura_solo_adicion()` devuelve 0 filas.
- `postgres` tiene UPDATE sobre `representantes_paciente`, que es lo que exige el `for share`
  dentro de la función definer.
- `territorio.mjs T-032`, ejecutado desde el worktree: 45 ficheros, todos dentro del territorio.
  `tickets/T-032-…md` en HEAD es idéntico al de `main`. El commit de la rama solo trae lo que ya
  enmendó el propietario, así que la rama no toca su propio gate.

**`10-solo-adicion` con la tabla nueva.** Recorrí el camino. La prueba no se pone verde por el
motivo equivocado. Con el privilegio recuperado, `update … set <col> = <col>` solo lanza si hay
filas. Hay tres, insertadas en `02`, dentro de la misma transacción y antes. Si algún día `02`
dejara de insertarlas, el `update` de 0 filas no lanzaría y `assert_lanza` caería en **rojo**. El
fallo es seguro: da rojo, no un verde falso.

---

## MEDIA

### H1 · «Lo vigente es la última fila» junto con filas de un solo campo esconde la alergia anterior
- **Dónde**:
  - `docs/decisions/ADR-063.md:22` («la ficha muestra **la última** por `registrado_en`»);
  - `:27` («una fila tiene alergias **o** medicación»);
  - `:37-38` («vaciar un valor no tiene forma todavía»);
  - migración `L98-101` y `L122-124`;
  - el lector, `app/(app)/pacientes/[id]/datos.ts:414-429`, que toma la fila entera más reciente.
- **Qué pasa**:
  - El modelo solo funciona si cada fila es una **foto completa**: cada cambio repite los dos
    campos. Eso no está escrito en ningún sitio.
  - El ADR y el `check` admiten filas de un solo campo, y el lector interpreta un `null` en la
    última fila como «no consta».
  - El ADR dice además algo falso. Con una lectura de fila entera, vaciar la medicación **sí** se
    puede hacer: basta con una fila `{alergias: 'Penicilina', medicacion_actual: null}`.
  - El propio banco repite `'Penicilina'` en la segunda fila (`02-matriz-roles.sql:75-76`). El
    implementador conoce el convenio y no lo dejó escrito.
- **Cómo falla**:
  - En el alta, PRO1 registra `alergias = 'Penicilina'` y deja la medicación vacía.
  - Después se registra un cambio de dosis como fila nueva, solo con
    `{paciente_id, medicacion_actual: 'Sertralina 100 mg'}`. Esa fila puede llegar por PostgREST
    con la sesión del asignado, que tiene `grant insert` sobre la tabla entera. También puede
    llegar desde la pantalla de edición del ticket siguiente, si su implementador sigue el ADR
    tal como está escrito.
  - `cargarSaludBasica` devuelve `alergias: null`. La ficha deja de mostrar la alergia a la
    penicilina, aunque el dato sigue en la tabla.
  - Es el mismo daño clínico que la regla 6 quería evitar, ahora por la lectura.
- **Por qué hay que resolverlo ahora**:
  - El ADR-063 entra con este merge y después no se edita.
  - Las filas que se escriban con el convenio equivocado no se pueden desambiguar después: un
    `null` puede significar «sin cambio» o «ya no toma nada».
- **Arreglo, sin tocar el esquema** (una de las dos):
  - (a) Decirlo en el ADR y en el comentario de la tabla: «cada fila es la foto completa; un
    `null` en la última fila significa que no consta». Y corregir la consecuencia de «vaciar».
  - (b) Que la lectura tome el último valor no nulo **por columna**. Si se elige esta, lo que no
    tiene forma es vaciar un solo campo, y el ADR debe decir eso.

### H2 · El linter de migraciones no conoce la quinta tabla de solo adición, y no está anotado
- **Dónde**:
  - `scripts/lint-migraciones.ts:26-32`. `TABLAS_SOLO_ADICION` sigue teniendo las cinco de
    antes (`auditoria`, `notas_clinicas_versiones`, `accesos_historia`,
    `accesos_historia_vistas`, `facturas`) y no incluye `pacientes_salud_basica`.
  - El fichero es del carril de Kimi y el diseño §6 lo pone fuera del territorio, así que el
    implementador no podía cambiarlo.
  - Tampoco lo anotó en `docs/state.md` §Hallazgos, que es lo que manda la regla 2.
- **Qué pasa**: `.claude/rules/supabase.md` llama al linter «la regla 6 comprobada por máquina».
  Su regla 1 solo muerde en `update`, `delete` y `truncate` dirigidos a las tablas de esa lista.
- **Cómo falla**:
  - Una migración futura hace esto:
    `alter table public.pacientes_salud_basica disable trigger impedir_modificacion_pacientes_salud_basica; grant update …; update public.pacientes_salud_basica set alergias = … where …; revoke …; enable trigger …`.
  - `npm run lint:migraciones` la da por limpia.
  - Como la migración deja las tres capas como estaban, `cobertura_solo_adicion()` y
    `10-solo-adicion` también quedan en verde en CI.
  - Resultado: historia clínica reescrita sin ninguna alarma. La misma migración contra
    `auditoria` sí la pararía la regla 1.
- **Arreglo**: una línea en `docs/state.md` §Hallazgos para el carril de funciones puras
  (añadir la tabla a la lista o, mejor, que el linter la lea de `tablas_solo_adicion`). No se
  toca el fichero en este ticket.

---

## BAJA

### H3 · El cerrojo `for share` de la guarda de `solo_contacto` no tiene ninguna prueba que se ponga roja sin él
- **Dónde**: migración `L536-540`, y `scripts/rls/07-capacidad.sql`, que solo recorre el caso
  secuencial.
- **Qué pasa**:
  - El arreglo de H3 es correcto en READ COMMITTED, lo he razonado en los dos órdenes:
    - si el insert del firmante bloquea primero, el `update of alcance` espera en
      `GetTupleForTrigger`, y luego su `exists`, con una instantánea nueva, ve la firma;
    - si el `update` bloquea primero, el `perform … for share` espera, vuelve a leer la versión
      nueva y el `exists` ve `solo_contacto`.
  - Pero el banco corre en una sola sesión. Si se quitan las cuatro líneas, todo sigue en verde.
- **Cómo falla**:
  - Un ticket posterior redefine `fn_firmante_no_es_solo_contacto()` con `create or replace`
    (es la costumbre del repo: la copia viva es siempre la última redefinición) y no copia el
    `perform … for share`.
  - Ni `test:rls` ni CI se ponen en rojo, y la carrera vuelve a estar abierta.
- **Arreglo**: una aserción de catálogo en `07`, por ejemplo
  `pg_get_functiondef('public.fn_firmante_no_es_solo_contacto'::regproc) ~* 'for share'`. O una
  prueba de dos sesiones al estilo de `test:huellas`.

### H4 · El README del banco sigue diciendo que el administrador lee la salud básica
- **Dónde**: `scripts/rls/README.md:28`: «`pacientes_salud_basica` (ADM y profesional asignado sí,
  el técnico nunca…)».
- **Cómo falla**:
  - Quien amplíe `02` a partir del README escribe una gemela «ADM ve P1 = 1», que sale en rojo.
  - Después «arregla» la política devolviéndole la rama de administrador, y deshace el criterio 7
    y el ADR-063.
  - El fichero está en el territorio: es una línea.

---

## Hallazgos de la segunda ronda: estado

| Id | Estado | Comprobación |
|---|---|---|
| H1 salud básica mutable (regla 6) | **Cerrado** | ADR-063: tabla con `id` propio, `grant select, insert` y nada más, `revoke update, delete` también a `postgres`, `before update or delete` + `before truncate` con `fn_impedir_modificacion()`, fila en `tablas_solo_adicion`. `cobertura_solo_adicion()` da 0 (medido). La autoría sigue en servidor: `clock_timestamp()` y `auth.uid()`. `02:75-83` intenta firmar como ADM y fechar en 2020, y el disparador lo corrige. La auditoría recorta el contenido y conserva `paciente_id` en `estado_posterior`. Queda H1 de esta ronda, que trata de la lectura, no de la escritura. |
| H2 territorio | **Cerrado** | Contrato ampliado por el propietario (`d6c6043`, `bba9080`). `territorio.mjs` da 45/45 dentro. |
| H3 carrera de las dos guardas | **Cerrado**, sin prueba (H3 de esta ronda) | `perform 1 … for share` antes del `exists`. |
| H4 comentario «retirar la firma» | **Cerrado** | `L567-570` manda cerrar con `vigente_hasta` y dar de alta otra fila. |
| H5 criterio 6 | **Cerrado** | El propietario lo reformuló («cero filas y la fila intacta», contrato L356-359), y `08:75-86` prueba justo eso con una lectura de ADM. |

## Lo de «Qué revisar» (diseño §5) que ya estaba cerrado y sigue igual

- `alta_paciente` sigue sin `p_profesional_id`, y `p_fecha_nacimiento` sigue sin default.
- Las versiones de clave están fijadas por el check.
- `clave_de_cifrado` mantiene la lista blanca literal de dos nombres.
- `leer_identificacion`: `if not found then return` está antes del rastro.
- `registrar_evento_auditable` tiene los cuatro verbos, y el `check` los once anteriores más el
  nuevo.
- `pacientes_salud_basica` no tiene ninguna política para el técnico. `alta_paciente` falla
  entera para el técnico porque `pacientes` no le deja insertar, así que no hay alta a medias.

**No es hallazgo:** el administrador puede reasignarse un paciente (`profesional_id`, permitido
por `fn_proteger_columnas_reservadas_paciente` desde ADR-032) y a partir de ahí leer su salud
básica. Es la misma puerta que ya tenían las notas, y el cambio queda auditado en `pacientes`.
