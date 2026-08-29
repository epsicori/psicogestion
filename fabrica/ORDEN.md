# Orden de trabajo · carril de la fábrica

Este carril lo lleva **Claude con la fábrica** (`/fabrica T-XXX`). A diferencia de los
otros dos, **lee el repositorio entero**: `CLAUDE.md`, `docs/architecture.md`,
`docs/interfaz.md`, `docs/decisions.md`, `docs/state.md` y los tickets. No hay recorte que
preparar: la constitución del proyecto ya es su guion.

Lo que sí hay que fijar, y es lo que fija este fichero, son tres cosas nuevas que llegan
con el reparto a tres: **qué le toca, qué no puede tocar mientras los otros dos están
abiertos, y qué revisa**.

---

## Paso 0 · Comitear `main`

Antes de repartir nada. `main` no tiene los ADR-045 a 053, ni los cuatro módulos del
ADR-050, ni los tickets T-010 a T-015, ni la migración de T-002. Dos de los tres carriles
ramifican de ahí y construirían contra decisiones derogadas.

Esto no lo hace un agente: lo haces tú, y es lo primero.

## La cola

| Orden | Ticket | Modelo | Puede empezar |
|---|---|---|---|
| 1 | **T-002 · enmienda del ADR-051** y después la revisión con Opus | `opus` | **ahora** |
| 2 | **T-004 · Auditoría por triggers y solo adición en tres capas** | `opus` | **ahora** |
| 3 | T-003 · Banco de pruebas de RLS por rol | `opus` | tras T-002 |
| 4 | T-005 · Cadena de huellas SHA-256 y su verificador | `opus` | tras T-004 |
| 5 | T-006 · Autenticación completa: invitación, MFA, sesiones | `sonnet` | tras T-002 |
| 6 | T-008 · Seed determinista de los tres roles | `sonnet` | tras T-002, T-004 y T-005 |

**T-002 y T-004 se pueden llevar a la vez** —la auditoría es un disparador, no una
política—, pero **no en dos ramas simultáneas del mismo carril**: los dos escriben
migraciones y el orden de los ficheros importa. Una detrás de otra, y T-002 primero porque
es la que está a medias.

**T-006 y T-008 son `sonnet` en `PLAN.md` y aun así están aquí.** No por dificultad: por
territorio. Los dos escriben en `supabase/`, y `supabase/` tiene **un solo dueño** o las
migraciones de dos carriles se ordenan mal entre sí. Siguen saltándose la etapa de diseño;
lo único que cambia es quién los ejecuta.

## Lo que este carril no toca mientras los otros dos están abiertos

No es una zona prohibida por sensibilidad: es que **hay alguien dentro**.

| Ruta | Quién está dentro |
|---|---|
| `components/**`, `app/**`, `next.config.ts`, `lib/i18n/**`, `lib/contraste/**`, `.github/**` | MiniMax |
| `lib/identidad/**`, `lib/fechas/**`, `lib/agenda/**`, `scripts/lint-migraciones.ts` | Kimi |
| `kimi/**`, `minimax/**` | Los packs de los otros carriles |

Si un ticket de esta cola necesita tocar algo de ahí —y **T-006 necesitará pantallas de
invitación y de MFA**—, hay dos salidas legítimas y una ilegítima:

1. **Cortar el ticket**, como se hizo con T-007: la parte de base de datos aquí, la parte
   de pantalla al carril de MiniMax. Es la salida por defecto.
2. **Esperar** a que el carril de MiniMax quede libre y hacerlo entero aquí.
3. ~~Tocarlo «solo un momento»~~. Eso produce el conflicto que este reparto existe para
   evitar, y lo produce en el fichero que más duele: el que otro está reescribiendo.

## Lo que sí escribe

`supabase/migrations/`, `supabase/seed.sql`, `scripts/*.sql`, `lib/supabase/`, y
`docs/` — que en este carril **sí se escribe**, porque aquí está el arquitecto y la memoria
del proyecto es suya.

**Y transcribe las secciones §Para `docs/state.md`** de los informes que llegan de los
otros dos carriles. Ellos no escriben en `docs/` nunca; te dejan el material redactado para
pegar. Si nadie lo transcribe, la memoria se queda atrás y el siguiente ticket vuelve a
pagar lo que ya estaba aprendido.

---

## Lo que hay que saber antes de cada ticket

Está todo en `docs/state.md`, pero estas seis cosas son las que cuestan un día si se
descubren tarde.

**T-002 · enmienda.** Entra **antes** de la revisión con Opus: revisar un juego de políticas
que vamos a cambiar es trabajo tirado, y hoy no hay ni una fila real dentro. Nace
`perfiles_centros`; `perfiles.centro_id` sobrevive como **espejo del principal** mantenido
por disparador; aparece `centros_actuales()` (`setof uuid`) para las políticas. Se
reescriben con ella la rama del técnico en `pacientes_lectura`, la de
`alertas_documentacion`, la vista `pacientes_indicador_riesgo` y
`fn_rellenar_centro_paciente` —esta última con el **principal**, porque el centro del
paciente decide su retención durante veinticinco años—.
**Y lleva una prueba dedicada** a demostrar que abrir y cerrar pertenencias a centros **no
cambia ni una fila** de lo que lee un profesional: un profesional lee los suyos vía
`es_profesional_asignado()`, que no consulta el centro. `centros_actuales()` acota **solo
al técnico administrativo**. Esto ya se redactó mal una vez.

**T-004.** No depende de T-002. La tercera capa es la que importa y casi nadie escribe:
**`TRUNCATE` no dispara disparadores `FOR EACH ROW` y RLS no lo intercepta**. Sin un
`BEFORE TRUNCATE ... FOR EACH STATEMENT`, una tabla «inmutable» se vacía en una línea. Y
Supabase concede TRUNCATE, TRIGGER y REFERENCES a las tablas nuevas sin pedirlo: hay que
revocarlo por defecto.

**T-003.** La lista de políticas está en `pg_policies`, y el catálogo comentado en la
sección 10 del «Diseño aprobado» de `tickets/T-002-rls-politicas.md`. **T-003 debe FIRMAR
la nota conjunta en su fijación de datos**: la rama de participación exige
`alcance = 'conjunta'`, que solo existe en la versión sellada, así que una prueba positiva
sobre un borrador saldría verde por el motivo equivocado.

**T-005.** **No se puede escribir sin haber leído el ADR-046.** El sobre canónico ya no es
el de `architecture.md` §Invariante 1: crece con `cita_id`, `abierta_en`, `firmada_en` y
`redactada_en_sesion`, **dentro de la huella**. Sube `esquema_version`; `algoritmo_version`
**no**. Si el canonicalizador nace con el sobre viejo, añadirlo después abre una era de
algoritmo y **dos formatos para siempre**, porque lo viejo jamás se recalcula.

**T-006.** Hereda el alta del PIN en la invitación (ADR-026), TOTP para los tres roles
—reponer TOTP sí, PIN no— (ADR-039), revocar sesión, MFA y PIN al dar de baja (ADR-032), y
el SMTP del cliente en Vault (ADR-038). **La parte de pantalla se corta y se pasa al carril
de MiniMax**; aquí queda la base de datos y las Server Actions.

**T-008.** Sembrar `auth.users` tiene trampas ya pagadas: la fila correspondiente en
**`auth.identities` es obligatoria**, y `confirmation_token`, `recovery_token`,
`email_change` y `email_change_token_new` deben ser **cadena vacía, no NULL**, o GoTrue
devuelve 500 al entrar. El esquema de GoTrue cambia entre versiones: **inspecciona con
`\d auth.users` antes de escribir**, no teclees de memoria. Y los tres roles **entran de
verdad** se comprueba con `curl` al endpoint de token, no con un `db reset` verde.

## El patrón de error que ya costó dos revisiones

De T-001, y sigue vigente: **tres pruebas distintas estuvieron en verde por el motivo
equivocado**. Un `DELETE` que fallaba en la clave ajena y no en el candado; dos bloques
«como `authenticated`» que devolvían `UPDATE 0` porque con RLS activo y sin política ese
rol ni ve la fila; y una aserción que no discriminaba entre la migración nueva y la vieja.

**Toda prueba negativa necesita su gemela positiva sobre la misma fila**, y hay que
preguntarse siempre si la prueba seguiría verde con el arreglo quitado. Si sí, no prueba
nada.

---

## La otra mitad del trabajo: revisar

Este carril **revisa las ramas de los otros dos**. Es donde más rinde por hora: los otros
producen rápido y aquí está el contexto para saber si lo producido es correcto.

**Qué se revisa con Opus, sin excepción:**

- Todo lo de esta cola.
- Cualquier rama de cualquier carril que toque **RLS, dinero o datos clínicos**.

**Qué cierra sin revisión con Opus:** una entrega de interfaz pura o de función pura, con
su verificador de carril, `lint` y `build` en verde. Los cortes A, B y C de T-007 y los
tickets T-017 a T-020 están en ese caso.

**Cómo se revisa una rama de otro carril**, que no es como se revisa una propia:

1. **Primero el verificador de su carril**: `node minimax/verificar.mjs T-007a` o
   `node kimi/verificar.mjs T-018`. Si el alcance está roto, no se revisa el contenido —se
   devuelve.
2. **Después el informe**, buscando criterios marcados **sin salida pegada**. Un criterio
   sin evidencia es un criterio no cumplido, por convincente que suene el resumen.
3. **Después los hallazgos**: `minimax/hallazgos/` o `kimi/hallazgos/`. Ahí suele estar lo
   caro, porque es lo que el agente vio y no entendió.
4. **Y solo entonces el diff.**

**No se arregla la rama ajena.** Se devuelve con los hallazgos, igual que un ticket propio
vuelve de la revisión. Arreglarla convierte la revisión en implementación y deja sin
revisar lo arreglado.

## Integración

**Este carril tampoco integra.** Deja la rama lista con su evidencia y para. Integra la
persona, y el orden cuando hay varias listas es: primero este carril —mueve el esquema que
los demás leen—, después Kimi, después MiniMax. Solo importa por `package-lock.json`, y un
conflicto ahí se resuelve con `npm install`, nunca a mano.
