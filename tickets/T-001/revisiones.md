## Resultado de la implementación (22-08-2026)

**Los quince criterios de aceptación pasan.** Todos con salida real del comando, recogida
arriba criterio a criterio. Guion reproducible:

```
npx supabase db reset
npm run tipos && npm run lint && npm run build
docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t001-esquema.sql
```

### Ficheros

| Ruta | Qué |
|---|---|
| `supabase/migrations/20260822094547_esquema_base_organizacion_paciente_historia.sql` | Creada. 22 tablas, 1 vista, 12 enums, 12 funciones, 16 disparadores |
| `scripts/t001-esquema.sql` | Creado. Verificación de los criterios 3 a 14 |
| `lib/supabase/tipos-bd.ts` | Regenerado con `npm run tipos` |

### Pendiente de verificación manual

Los tres puntos del «Guion de comprobación manual», al detalle:

1. `db reset` + `npm run tipos` — **hecho**, salida arriba.
2. `\dp` en Studio — **no ejecutado en Studio**, pero comprobado por consulta equivalente
   sobre `information_schema.role_table_grants`: cero concesiones a `anon` y a
   `service_role` en todo `public`, y `pines_historia` sin ACL salvo el propietario.
3. Paseo vertical en `/pacientes` con `ana@psicogestion.test` — **no ejecutado en
   navegador**. Comprobado a nivel de base: el `insert` de T-000 con columnas explícitas
   bajo RLS como Ana sigue devolviendo la fila, el `select id, nombre, apellidos,
   creado_en` sigue funcionando, y ninguna columna nueva de `pacientes` ni de `perfiles`
   es `not null` sin `default` (recuento = 0). **Queda por confirmar en navegador.**

### Hallazgos que el diseño no anticipó

1. **`accesos_historia_vistas` no puede llevar clave ajena a `accesos_historia`.** La
   comprobación de integridad referencial corre como propietario (`postgres`, que en
   Supabase local **no es superusuario**) y necesita bloquear la fila padre con
   `FOR KEY SHARE`, lo que exige `UPDATE` o `DELETE` sobre el padre — justo lo que la
   capa 1 del cerrojo de solo adición le revoca. Con la clave ajena, **ningún rol podía
   insertar jamás una vista**, y el mecanismo del §2.11 del diseño quedaba muerto. Se
   quita la clave ajena y se conserva la columna, exactamente como T-000 hizo con
   `auditoria.actor_id`. Los tres cerrojos quedan intactos. Documentado en la propia
   migración.
2. **Borrar una fila de `perfiles` o de `pacientes` es ahora imposible para cualquier
   rol**, por la misma mecánica: `notas_clinicas_versiones` y `accesos_historia` los
   referencian y la comprobación referencial no puede tomar el bloqueo. Es coherente con
   el proyecto («la baja no borra»), pero afecta al `on delete cascade` desde
   `auth.users`: **borrar un usuario de Auth fallará** si tiene notas o accesos. Lo
   recoge `docs/state.md` para T-006 y T-008.
3. **`es_zona_iana()` y `authenticated`.** El `execute` de una función de disparador se
   comprueba al crear el disparador, no al dispararlo, así que las `fn_*` no necesitan
   `grant`; pero `fn_validar_zona_horaria()` es *security invoker* y llama a
   `es_zona_iana()` en tiempo de ejecución. Hoy da igual —sin política RLS de escritura,
   nadie salvo `postgres` escribe en `centros` ni en `organizacion`—, pero **T-002 debe
   conceder `execute` de `es_zona_iana()` a `authenticated` o hacer el disparador
   *definer***. Anotado en la migración y en `docs/state.md`.

---

## Ronda de revisión (22-08-2026) — cuatro altos y tres medios, corregidos

Todo se arregla **en la misma migración**, no en una nueva: T-001 no se había integrado
todavía, así que sigue siendo una sola migración hacia delante.

| # | Sev | Hallazgo | Corrección | Prueba nueva |
|---|---|---|---|---|
| 1 | Alta | `fn_normalizar_fusion_paciente()` leía el destino sin bloquearlo: dos fusiones concurrentes se cruzaban y creaban la cadena de dos saltos que el tope de 50 no caza | `for no key update` en el recorrido | **R1** |
| 2 | Alta | El suelo de retención comparaba dos columnas **ambas editables**, con `grant update` a `authenticated`: bajar las dos a 1 año pasaba | `constraint politicas_retencion_suelo_legal check (anios_minimo_legal >= 5)` | **R2** |
| 3 | Alta | La fila de retención de la organización se podía **mover** con `update ... set centro_id`, y entonces todos los centros caían en silencio a los 25/5 del `coalesce` | El disparador pasa a `before delete or update of centro_id`, y la función distingue las dos operaciones | **R3** |
| 4 | Alta | `notas_clinicas.paciente_id` y `.fecha_sesion` eran editables tras sellar; como el sobre canónico no los incluye, una versión firmada se reatribuía a otro paciente **sin romper la cadena de huellas** | `fn_congelar_cabecera_sellada()`, disparador `before update of paciente_id, fecha_sesion` | **R4** |
| 5 | Media | El índice de la ventana de acceso no deduplicaba con `pestana` nula | `nulls not distinct` | **R5** |
| 6 | Media | Un consentimiento otorgado podía quedarse sin `texto_firmado`, y eso no tiene backfill | `constraint consentimientos_otorgado_exige_texto` | **R6** |
| 7 | Media | `es_zona_iana()` sin `execute` para `authenticated` | Concedido | **R7** |

### Salida real de las siete pruebas nuevas

Cada una con su gemela positiva: una prueba negativa sin control positivo no distingue
«la guarda funciona» de «esto no pasa nunca».

- **R1** — control: la segunda conexión fusiona `A→B` sin esperar (`UPDATE 1`).
  Negativo, con `B→D` abierto en la primera: `ERROR: canceling statement due to lock
  timeout · CONTEXT: while locking tuple (0,19) in relation "pacientes" · SQL statement
  "select p.fusionado_en ... for no key update" · PL/pgSQL function
  public.fn_normalizar_fusion_paciente() line 24`. Tras el `rollback`, la misma fusión
  pasa y queda normalizada. `cadenas_de_dos_saltos = 0`, y la limpieza deja
  `pacientes_de_prueba_restantes = 0`.
- **R2** — negativo: `ERROR: ... violates check constraint
  "politicas_retencion_suelo_legal" · DETAIL: Failing row contains (..., 1, 1, ...)`.
  Controles: 5/5 pasa (`UPDATE 1`), y subir el mínimo a 15 pasa (`25 | 15`).
- **R3** — negativo: `ERROR: La política de retención de la organización no se puede
  reasignar a un centro (ADR-033)`. Controles: la fila **sí** deja cambiar sus años
  (`30 | 5 | ` con `centro_id` nulo), y la política de **un centro** sí se puede mover a
  otro centro (`UPDATE 1`). `retencion_efectiva(null)` sigue dando `25 | 5 | organizacion`.
- **R4** — controles: sin versión sellada la cabecera es corregible
  (`04000000-…-0002 | 2026-03-02`), y con versión sellada el **borrador** sigue editable
  (`borrador_editable_tras_sellar = t`). Negativos: `ERROR: La nota … ya tiene versiones
  selladas: paciente_id y fecha_sesion no se pueden cambiar (ADR-035)`, tanto al cambiar
  `paciente_id` como `fecha_sesion`.
- **R5** — negativo: dos `insert ... on conflict do nothing` con `pestana` nula dan
  `INSERT 0 1` y `INSERT 0 0` → `filas_con_pestana_nula = 1`. Controles: dos pestañas
  distintas → `2`; sin desbloqueo (el índice es parcial) → `2`, que es lo correcto.
- **R6** — negativos: `ERROR: ... violates check constraint
  "consentimientos_otorgado_exige_texto"`, tanto sin texto como con texto y sin versión.
  Controles: con texto y versión pasa (`asistencial | v3 | t`), y un consentimiento
  preparado y sin otorgar no exige texto (`asistencial | t`).
- **R7** — control: como `authenticated`, `es_zona_iana('Europe/Madrid') = t` y
  `es_zona_iana('CET') = f`. Contraste: `has_function_privilege` da `es_zona_iana = t`,
  `zona_horaria_centro = t`, `fn_tocar_borrador = f`, `fn_congelar = f`. Y el disparador
  sigue rechazando `'CET'` **también desde `authenticated`**, que antes ni llegaba.

### Dos sub-pruebas que se reescribieron por vacías

Los bloques de R2 y R3 «como `authenticated`» devolvían `UPDATE 0`, no un error: con RLS
activo y **sin ninguna política hasta T-002**, `authenticated` ni siquiera ve la fila, así
que el `update` nunca llega a la restricción. Estaban en verde por el motivo equivocado.
Ahora están etiquetados como **contexto, no prueba**, y junto a ellos se lista
`pg_constraint` / `pg_trigger` para dejar claro lo que sí sostiene la guarda para
cualquier rol: que es una restricción **de tabla**, no un privilegio.

### Además, dentro del mismo alcance

- **Siete índices de clave ajena**, los que T-002 va a poner en el `using` de una política
  más el de la fusión: `episodios_asistenciales.profesional_id`,
  `episodio_participantes.paciente_id`, `notas_clinicas.autor_id`,
  `notas_clinicas.episodio_id`, `pacientes.fusionado_en` (parcial),
  `pacientes.centro_id`, `perfiles.centro_id`. Verificado: los siete existen.
  Las ~23 restantes se quedan sin índice a propósito y con su razón escrita.
- **Corregido el comentario de `valoraciones_riesgo`**, que prometía un
  `grant select (columnas)` imposible en Supabase: los tres roles comparten el rol
  `authenticated`, así que T-002 necesitará una vista aparte para el técnico.

### Lo que sigue anotado y NO se toca aquí

- `accesos_historia_vistas.acceso_id` sigue sin clave ajena por la razón ya documentada;
  lo que falta es que **T-002 lo ate con un `with check`**, porque la base ya no lo
  garantiza y un huérfano aquí no se podría borrar.
- Borrar un perfil o un paciente es imposible **siempre**, no «si tiene notas o accesos»:
  reproducido con la base entera vacía (`versiones = 0`, `accesos = 0`) sobre un paciente
  recién insertado.
- `pacientes.centro_id` nace nulo (`pacientes_totales = 2, con_centro = 0`); el criterio
  de relleno para T-002 está escrito en `docs/state.md`.
