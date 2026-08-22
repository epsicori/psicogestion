---
id: T-008
titulo: Seed determinista de los tres roles
modelo: sonnet
fase: 0
prioridad: media
depende_de: [T-002]
estado: pendiente
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
