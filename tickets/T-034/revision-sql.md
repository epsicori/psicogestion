**Sin hallazgos ALTA.** Revisión 1 de 2 (foco: la migración `20260929120000_nota_siempre_en_episodio.sql`). Dos MEDIA y tres BAJA.

Revisor 1 · 30-09-2026 · Diff: `git diff main...T-034-nota-en-episodio` (4 commits, `7717eb1..da7b378`).
Solo lectura: catálogo consultado en `supabase_db_Psicogestion` (la migración de la rama está aplicada:
`episodio_para_nota` invoker, las tres `fn_*` definer con `search_path=""`, orden de disparadores
`auditar_notas_clinicas`, `congelar_cabecera_sellada`, `exigir_episodio_coherente_en_nota`,
`tocar_borrador`; `execute` de `episodio_para_nota` solo para `authenticated` y `postgres`).

## Lista «Qué revisar» (§5 y §E.6), punto por punto

| Punto | Resultado |
|---|---|
| Guarda 55000 como primera sentencia, fragmento «notas clínicas sin episodio» | OK (`:15-26`) |
| `-- destructivo:` justo encima del `set not null` | OK (`:31-32`) |
| Sin rellenos (`update public.notas_clinicas` ausente) | OK |
| Disparador: pasos 1-8 en el orden de §E.1 (nulo, anti-oráculo, lectura, autor, paciente, cerrado, coprofesional) | OK (`:62-141`); 7a salta sin perfil (habla la FK); el `check` habla cuando es igual al autor |
| `update of paciente_id, episodio_id, autor_id, coprofesional_id` | OK (`:148`) |
| D6: `TG_OP = 'INSERT'` o cambio de `episodio_id` | OK (`:100-107`) |
| `fn_congelar_cabecera_sellada` re-emitida con el mismo cuerpo, 42501, «no se puede reatribuir», definer, `revoke` reafirmado; disparador con el mismo nombre y `coprofesional_id` en `update of` y en `when` | OK (`:157-188`, `:384`); la migración de la agenda no se toca |
| Puertas de episodio y de participante | OK en una sola sesión (`:193-245`); ver H1 para la concurrencia |
| `episodio_para_nota`: rol antes que candado; `p_paciente_id` nulo → 22023; asignado; elección explícita con el mismo 42501 para inexistente, invisible, otro paciente y otro profesional; cerrado (22023) solo si es suyo | OK (`:271-319`) |
| Candado consultivo antes del recuento, y el recuento en una sentencia posterior | OK (`:323-333`) |
| Cita solo al abrir, con `paciente_id` y `profesional_id = v_uid`; centro solo si la cita no lo da, contra `centros_actuales()` | OK (`:343-362`); `centros_actuales()` nunca devuelve null, así que el `not in` es seguro |
| El llamante no elige `profesional_id`, `modalidad_relacional` ni `abierto_en` | OK por la función (el `insert` directo en `episodios_asistenciales` ya existía antes y no cambia) |
| Permisos: `revoke … from public, anon` + `grant authenticated`; tres `fn_*` cerradas a `public, anon, authenticated` | OK (`:379-384`) |
| Sin RLS nueva; ninguna política ni función de política lee `coprofesional_id` | OK |
| Comentario de `notas_clinicas_versiones.paciente_id` sin «episodio_id es nulable» | OK (`:427-433`) |
| Solo adición (regla 6 de la constitución) | OK: ni `update` ni `delete` de tablas protegidas; la cabecera sigue siendo mutable solo hasta la primera versión, como antes |

## MEDIA

### H1 · Las comprobaciones cruzadas se leen sin cerrojo: dos transacciones concurrentes dejan una nota incoherente
`supabase/migrations/20260929120000_nota_siempre_en_episodio.sql:73-76` (y `:89-93`, `:200`, `:227-230`)

El disparador de la nota lee el episodio y el participante con un `select` y un `exists` simples. Las
puertas del episodio y del participante miran las notas con otro `exists`. En READ COMMITTED
ninguno de los dos ve lo que el otro aún no ha confirmado. `paciente_id`, `profesional_id` y
`cerrado_en` no forman parte de ningún índice único, así que el `FOR KEY SHARE` de la FK no choca
con el `FOR NO KEY UPDATE` del `update`.

**Escenario.** T1: PRO1 inserta la nota `(PJ2, EJ, PRO1)` y su disparador ve la fila del
participante PJ2. T2, a la vez: `update episodio_participantes set paciente_id = PA where
episodio_id = EJ and paciente_id = PJ2` (lo permite `episodio_participantes_modificacion`; también
un `delete` con `service_role`). Su disparador no ve la nota de T1, que aún no se ha confirmado.
Confirman las dos, y queda una nota de PJ2 en EJ sin que PJ2 sea titular ni participante. D4 queda
roto en la base.

Pasa lo mismo con `update episodios_asistenciales set paciente_id|profesional_id` frente a la
inserción, y también con D6: si T2 cierra `EKC` mientras T1 inserta en él, la nota entra en un
episodio cerrado. El §E.2 del diseño dice que el disparador es «la red» precisamente para esa
carrera, pero solo la cubre si el cierre ya estaba confirmado.

**Arreglo propuesto.** Leer el episodio con `for share` en el paso 3 y bloquear con `for share` la
fila o filas del participante en el paso 5 (patrón T-032, «gemelas sin cerrojo»). Como el banco va
en una sola sesión, conviene además una aserción de catálogo (`pg_get_functiondef ~* 'for share'`).

### H2 · D6 se esquiva reabriendo el episodio: `cerrado_en` se cambia libremente
`supabase/migrations/20260929120000_nota_siempre_en_episodio.sql:104` (la guarda); la puerta es `episodios_modificacion`, `20260822160000_rls_funciones_y_politicas.sql:1037-1046`

El ADR-072, punto 5, dice que una nota nueva **nunca** cuelga de un episodio cerrado y que lo impide
la base. Pero `episodios_modificacion` deja cambiar cualquier columna, `cerrado_en` incluida, al
dueño **y a quien atiende al paciente**. `congelar_episodio_con_notas` solo congela `paciente_id` y
`profesional_id`.

**Escenario.** PRO1 hace tres llamadas por PostgREST con el candado abierto:
`update episodios_asistenciales set cerrado_en = null where id = EK0`, luego
`insert into notas_clinicas (PK, EK0, PRO1)` (pasa) y luego `update … set cerrado_en = <fecha
original>`. Resultado: una nota nueva en un episodio que consta como cerrado desde antes de que
existiera. Además, el reloj de retención (ADR-033), que arranca en `cerrado_en`, se puede mover a
voluntad.

Queda rastro en `auditoria` (UPDATE del episodio), pero la base no lo impide. Cerrar episodios está
fuera del alcance de T-034 (E.9), así que no se pide arreglarlo aquí. Sí hay que anotarlo en
`docs/state.md` §Hallazgos para el ticket que cierre episodios: reabrir o cambiar `cerrado_en`
tiene que tener su propia regla.

## BAJA

### H3 · El centro del episodio se cambia después y deja al coprofesional fuera del centro
`supabase/migrations/20260929120000_nota_siempre_en_episodio.sql:128-136`; puerta: `episodios_modificacion` (sin congelación de `centro_id`)

La regla 7c («alta vigente en el centro del episodio») se comprueba al escribir el coprofesional o
al mover la nota. `centro_id` del episodio sigue siendo mutable aunque el episodio tenga notas.

**Escenario.** Se crea NCO en ECO (CA) con coprofesional PRO2 y después se hace
`update episodios_asistenciales set centro_id = CC where id = ECO` (o `= null`). Pasa, y queda
guardada una nota cuyo coprofesional no tiene alta en el centro de su episodio. En T-012c ese dato
se sellará en el sobre.

El diseño acepta que se pierda la vigencia del **perfil** (baja posterior en el centro), pero no
considera el cambio de centro del **episodio**. O se añade `centro_id` a
`congelar_episodio_con_notas`, o se deja escrito que se acepta.

### H4 · El coprofesional exige `rol = 'profesional_sanitario'` y excluye al administrador que atiende pacientes
`supabase/migrations/20260929120000_nota_siempre_en_episodio.sql:123-126`

`es_profesional_asignado()` es independiente del rol a propósito: un administrador que figura como
`profesional_id` atiende pacientes y escribe notas («Notas clínicas: solo las suyas», tabla de roles
de `architecture.md`).

**Escenario.** Hay una coterapia entre PRO1 y el administrador-psicólogo ADM. La nota de ADM con
coprofesional PRO1 entra. La nota de PRO1 con coprofesional ADM da 23514 «tiene que ser un
profesional sanitario». La misma sesión solo se puede registrar en un sentido.

La P2 del diseño (E.8) deja esta lectura pendiente de que la confirme el propietario, pero no nombra
este caso. Hay que llevárselo con el ejemplo. Relajar la regla después no obliga a migrar datos, y
por eso es BAJA.

### H5 · La salida anti-oráculo del disparador (paso 2) no tiene prueba: quitarla deja el banco en verde
`supabase/migrations/20260929120000_nota_siempre_en_episodio.sql:68-70`; `scripts/rls/19-nota-en-episodio.sql` (ninguna de 19.1-19.47)

Ninguna prueba del módulo 19 inserta ni actualiza con `autor_id` distinto de la sesión.

**Escenario de mutación.** Sin las líneas 68-70, PRO1 inserta `(P, EY, PRO3)`, donde EY es un
episodio de PRO3. Si P no es el paciente de EY recibe 23514 «no son del mismo paciente»; si lo es,
42501 de la RLS. Así averigua de quién es un episodio ajeno, y los 47 casos siguen en verde.

Hace falta una negativa con sesión de PRO1, `autor_id = PRO2`, `episodio_id = ES` y un paciente que
no sea el de ES, que exija **42501** (la RLS) y no 23514.

## Observaciones sin hallazgo (sin escenario de fallo hoy)

- La salida del paso 2 da por hecho que «la RLS lo rechaza después». Eso deja de ser cierto si un
  día una función `security definer`, llamada por un usuario, escribe notas de otro autor (un
  importador o el acceso de emergencia): el disparador se saltaría D2, D4, D5 y D6. Hoy la única
  escritura definer sobre `notas_clinicas` es `fn_vaciar_borrador_al_firmar`, que no toca columnas
  del `update of`. Conviene tenerlo en cuenta al diseñar T-012 y el importador.
- `episodio_para_nota` abre episodios también para un paciente absorbido (`fusionado_en` no nulo),
  que según el ADR-031 queda «en solo lectura». `episodios_alta` y `notas_clinicas_alta` ya lo
  permitían antes, así que no lo introduce este diff.
