---
id: T-008
titulo: Seed determinista de los tres roles
modelo: sonnet
fase: 0
prioridad: media
depende_de: [T-002]
estado: hecho
completado: 2026-09-06
---

# Contexto

`supabase/seed.sql` siembra hoy dos profesionales y un paciente cada uno: lo justo para
T-000. Con el esquema de T-001 y las políticas de T-002, hace falta una base **con los
tres roles y con los casos raros dentro**, porque son esos los que rompen las pantallas y
los que nadie recuerda crear a mano.

Determinista quiere decir: **mismos UUID, mismas fechas relativas y mismo resultado en
cada `db reset`**. Sin aleatorios y sin `now()` suelto — si la siembra cambia entre
ejecuciones, ningún criterio de aceptación posterior es reproducible.

Referencias: `docs/architecture.md` §Roles, §Personas alrededor del paciente. ADR **028**
(menor con representante), **030** (episodio conjunto), **031** (duplicado vinculado),
**032** (titularidad y baja), **033** (dos centros).

Este ticket **no** siembra el banco de pruebas de RLS: T-003 tiene su propia fijación,
a propósito, para que una prueba no dependa de una siembra que alguien retoca.

## Tareas

- [ ] `npm run seed` en `package.json`, idempotente y ejecutable **después** de
      `npx supabase db reset` sin dejar duplicados.
- [ ] Decidir y dejar escrito qué siembra `supabase/seed.sql` (lo mínimo que `db reset`
      necesita: organización, un centro, un administrador) y qué siembra `npm run seed`
      (todo lo demás). Una sola verdad por dato.
- [ ] **Organización** con su NIF y `Europe/Madrid`, y **dos centros**, uno de ellos en
      `Atlantic/Canary` — para que las horas y la retención tengan dos casos desde el
      primer día.
- [ ] **Un usuario por rol**, con TOTP y PIN ya establecidos donde corresponda, y un
      **segundo profesional** para poder demostrar el aislamiento. El técnico, con
      `centro_id` obligatorio.
- [ ] **Un profesional en `estado = 'baja'`** con notas firmadas suyas: es el caso que
      demuestra que la autoría sobrevive al acceso.
- [ ] **Pacientes**: de ambas titularidades, repartidos por los dos centros, con estados
      documentales distintos para que la bandeja y las píldoras tengan algo que enseñar.
- [ ] **Casos raros, uno de cada**: un **menor** con dos representantes y consentimiento
      con dos firmas; un **episodio de pareja** con nota conjunta; un **duplicado
      vinculado** por `fusionado_en`; un paciente con `pacientes_identificacion` cifrada.
- [ ] **Notas** en los tres estados: borrador en la cabecera, versión firmada, y una nota
      corregida con **dos versiones encadenadas** y motivo de cambio.
- [ ] **`alertas_documentacion`** con antigüedades escalonadas, que es de donde salen la
      bandeja y las métricas.
- [ ] Documentar en `docs/state.md` la **tabla de credenciales** de la siembra: quién es
      quién, con qué rol, en qué centro y con qué PIN.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npx supabase db reset && npm run seed` termina sin error, y
      ejecutar `npm run seed` **dos veces seguidas** no duplica ninguna fila.
- [ ] **Automático** — dos ejecuciones completas desde cero producen **los mismos UUID**
      y los mismos recuentos por tabla.
- [ ] **Automático** — los tres roles **entran de verdad**: prueba con `curl` al endpoint
      de token de GoTrue, no solo `db reset` verde (`state.md` §Aprendizajes: es el único
      modo válido de comprobarlo).
- [ ] **Automático** — `npm run test:rls` sigue verde con la base sembrada.
- [ ] **Automático** — el verificador de huellas de T-005 recorre las notas sembradas y
      da **cadena íntegra**.
- [ ] **Automático** — la siembra no contiene ningún `random()`, `gen_random_uuid()` ni
      `now()` sin anclar a una fecha base.
- [ ] **Manual** — entrando con cada uno de los tres usuarios, `/pacientes` enseña lo que
      la matriz de roles concede y nada más.

## Guion de comprobación manual

1. `npx supabase db reset && npm run seed`.
2. Entra como administrador: ve todos los pacientes, ninguna nota ajena.
3. Entra como profesional: solo los suyos; con PIN, su historia; sin PIN, la petición de
   PIN.
4. Entra como técnico administrativo: pacientes de **su** centro, sin identificación, sin
   nada clínico y sin que se le pida PIN.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.**
- Sembrar `auth.users` tiene trampas ya pagadas (`state.md` §Aprendizajes): la fila
  correspondiente en **`auth.identities`** es obligatoria, y `confirmation_token`,
  `recovery_token`, `email_change` y `email_change_token_new` deben ser **cadena vacía, no
  NULL**, o GoTrue devuelve 500 al entrar.
- El esquema de GoTrue cambia entre versiones: **inspecciona con `\d auth.users` y
  `\d auth.identities`** antes de escribir, no teclees de memoria.
- Las filas sembradas disparan la auditoría con `auth.uid()` nulo. Es correcto: `actor_id`
  es anulable a propósito.
- Correos de la forma `<nombre>@psicogestion.test` y una sola contraseña de desarrollo,
  como ya hace la siembra de T-000. **Nada de esto llega a producción**: déjalo dicho en el
  encabezado del fichero.
- `db reset` y `npm run tipos` van siempre juntos.

## Cierre · 06-09-2026

### El reparto entre las dos siembras, que era la decisión a tomar

| Fichero | Cuándo corre | Qué lleva |
|---|---|---|
| `supabase/seed.sql` | **cada `npx supabase db reset`** | Organización, Centro Madrid, administrador, Ana y Bruno con un paciente cada uno |
| `supabase/seed-completo.sql` | **`npm run seed`**, voluntario | Centro Las Palmas (`Atlantic/Canary`), técnico, profesional de baja, casos raros, notas encadenadas y alertas |

**El porqué**: `seed.sql` corre también antes de `npm run test:rls`, y el banco cuenta
filas. Todo lo que se añada ahí lo tiene que tolerar el banco, así que lo pesado vive
detrás de `npm run seed`, que es opt-in.

**Ana y Bruno no se pueden mover.** El vector congelado de T-005 trae el autor
`11111111-…` dentro del sobre firmado y `13-cadena-huellas.sql` lo inserta tal cual por el
disparador real. El sobre no se recalcula jamás (ADR-035).

### Criterios de aceptación, con la salida real

**`npx supabase db reset && npm run seed` sin error, y dos `npm run seed` seguidos no
duplican nada:**

```
alertas=4  auth.identities=5  auth.users=5  centros=2  consentimientos=1
episodios=1  firmantes=2  mfa_factors=5  notas=5  organizacion=1
pacientes=8  pacientes_identificacion=1  participantes=2  perfiles=5
pines_historia=4  representantes=2  versiones=5

$ diff <recuento tras 1 siembra> <recuento tras 2 siembras>
(sin diferencia)
```

**Dos ejecuciones completas desde cero producen los mismos UUID** — y, de regalo, las
mismas huellas SHA-256 y los mismos hashes de PIN, que es la prueba fuerte de que ni un
instante quedó sin anclar:

```
$ diff ids-ejecucion-1.txt ids-ejecucion-2.txt   # 50 líneas: perfiles, centros,
(sin diferencia)                                  # identidades, factores, pacientes,
                                                  # representantes, consentimientos,
                                                  # firmantes, episodios, notas, alertas,
                                                  # huellas y hashes de PIN
```

**Los tres roles entran de verdad, con `curl` al endpoint de token de GoTrue** (no con un
`db reset` verde):

```
OK  admin@psicogestion.test    -> access_token emitido
OK  ana@psicogestion.test      -> access_token emitido
OK  bruno@psicogestion.test    -> access_token emitido
OK  tecnico@psicogestion.test  -> access_token emitido
OK  baja@psicogestion.test     -> access_token emitido
```

La de baja **entra en Auth y no ve nada**: es el corte del ADR-032, que vive en
`rol_actual()` y no en el login.

**`npm run test:rls` verde con la base sembrada**: exit 0, **192 aserciones `OK`**, cero
`ASERCIÓN FALLIDA`.

**El verificador de huellas recorre lo sembrado**:

```
verificar:huellas — cadena íntegra: cero anomalías.
```

Las cinco versiones sembradas —incluida la nota corregida con **dos versiones
encadenadas**— pasan por `fn_sellar_version_nota()` de verdad: la siembra no calcula ni una
huella y no manda `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` ni
`numero_version`.

**Sin `random()`, `gen_random_uuid()` ni `now()` sin anclar**: las únicas coincidencias del
`grep` en los dos ficheros están **dentro de comentarios** que explican por qué no se usan.

**Lo demás**: `npm test` → 297 pruebas; `npm run lint` sin salida; `npm run build` →
«Compiled successfully».

### Lo que hubo que tocar del banco de RLS

El hallazgo que T-003 dejó anotado para este ticket, cobrado: `01-fijacion.sql` inserta la
organización con `on conflict (fila_unica) do nothing` (es tabla de fila única y la siembra
ya crea la suya), y las dos cuentas globales de `02-matriz-roles.sql` —`centros = 2` y
`alertas = 4`— pasan a estar **acotadas a las filas de la fijación**. Con la siembra, la
cuenta global pasó a 3 y el banco se puso rojo por una razón que no era la que probaba.

### Dos trampas nuevas pagadas

- **El seed de `config.toml` no lo ejecuta psql**: los metacomandos no existen ahí y `\set`
  muere con `syntax error at or near "\"` (42601). De ahí el bloque `do $$ declare`.
- **`alertas_documentacion.origen_tabla` tiene un `check`** que solo admite
  `notas_clinicas`, `consentimientos`, `informes` y `evaluaciones`.

### Pendiente, y no es del ticket

El **guion de comprobación manual** (entrar con cada rol en el navegador) sigue sin
ejecutarse. Es la misma deuda que arrastra el punto 3 del guion de T-002.
