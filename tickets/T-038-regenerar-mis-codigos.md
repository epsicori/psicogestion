---
id: T-038
titulo: Regenerar mis códigos de recuperación, con aviso al titular por cualquier puerta
modelo: opus
riesgo: alto
fase: 1
prioridad: media
depende_de: [T-037]
estado: pendiente
territorio:
  - supabase/migrations/*_regenerar_codigos_recuperacion.sql   # cola de un solo dueño (ver Notas)
  - scripts/rls/13-cuentas.sql
  - scripts/t038-*                    # prueba de concurrencia del CA4, si el diseño la saca del banco
  - lib/supabase/tipos-bd.ts          # solo regenerado con `npm run tipos`, nunca a mano
  - lib/cuentas/**
  - lib/i18n/es.ts
  - app/primera-vez/**
  - app/(app)/cuenta/**               # P-1 = «Mi cuenta» (decidido el 02-10-2026)
  - components/armazon/**             # el enlace desde el bloque de usuario (o `modulos.ts`, según P-1)
  - accesibilidad/**
  - docs/interfaz.md
  - next.config.ts                    # solo `logging.serverFunctions: false` (diseño Q2, decidido el 02-10-2026)
---

# Contexto

Desde T-037 los códigos de recuperación solo se generan **al activar** el segundo factor
(ADR-039, «generados al activar y mostrados una vez»). Quien los pierde, o quien cerró la pantalla
sin guardarlos, hoy solo tiene una salida: que un administrador le reponga el TOTP. El propietario
decidió el 02-10-2026 (T-037, decisión P-1) abrir un ticket para que el titular los **regenere él
mismo**, y (decisión P-2) que el ADR-039 solo prohíbe que la entrada normal regenere, no que el
titular lo haga a propósito.

Orígenes, todos en `tickets/T-037/revision.md` y `docs/bitacora/T-037.md`:

- **P-1 de T-037** (`tickets/T-037/diseno.md` §Preguntas y §Decisiones del propietario).
- **A-H3**: desde T-037, un lote regenerado por quien robó una sesión `aal2` en los cinco minutos
  posteriores a un reto TOTP del titular **ya no caduca nunca** (antes lo caducaba la siguiente
  entrada) y el titular no se entera. La puerta no es la pantalla: es el RPC
  `generar_codigos_recuperacion()`, con `grant execute ... to authenticated`, que se llama por
  PostgREST con el JWT robado. Por eso **el aviso tiene que escribirlo la base**, no la aplicación.
- **R2-H3**: si la generación falla al activar, el aviso no dice qué implica ni deja reintentar.
- **R3-H1**: el contenedor de ese aviso recibe el foco sin rol ni nombre accesible.
- **R3-H2**: la prueba «el refresh espera al usuario» avanza 30 s; debe exigir `vi.getTimerCount() === 0`.

R2-H3, R3-H1 y R3-H2 entran aquí porque este ticket reescribe la vista de fallo: tras él, el
aviso de fallo puede decir «puedes generarlos desde Mi cuenta» en vez de «pide la reposición».

Lo que manda:

- **ADR-039** (TOTP para los tres roles; códigos de un solo uso; reposición por el administrador
  «auditada y con aviso al titular»). Este ticket da al titular el mismo trato que ya tiene la
  reposición: constancia y aviso.
- **ADR-038**: «las notificaciones internas viven en la aplicación, no en el correo». **ADR-023**:
  ningún encargado del tratamiento nuevo. La decisión de dominio 1 de T-006 (cabecera de
  `supabase/migrations/20260830090000_cuentas_invitacion_baja_totp.sql`) ya fijó que los avisos
  de seguridad al titular van por la tabla `notificaciones`, «nunca correo».
- **`architecture.md` §Roles** (los tres roles tienen TOTP; «Usuarios y ajustes de empresa» es solo
  del administrador) y **§Candado** (el técnico administrativo **no tiene PIN**).
- **Contrato de T-006**, PIN: «lo cambia su dueño reautenticándose con contraseña y segundo factor»;
  el comentario de `segundo_factor_verificado_recientemente()` (misma migración, `:268-279`) extiende
  esa exigencia a «cualquier regeneración posterior» de los códigos y deja la mitad de la contraseña
  a cargo de la pantalla.

**Pantalla.** El prototipo no dibuja nada de esto. `docs/interfaz.md` §Ajustes pone un bloque
«Usuario» para los tres roles dentro de Ajustes, pero `components/armazon/modulos.ts` da `/ajustes`
solo al administrador y la matriz dice «Usuarios y ajustes de empresa: Sin acceso» para los otros
dos. Es un choque que hoy no está en la lista de `interfaz.md`; dónde vive la acción lo decide el
propietario (**P-1**) y este ticket lo deja escrito en `interfaz.md` §Donde el prototipo choca.

## Qué queda fijado por este contrato

- **Quién**: los tres roles, **solo para sí mismos**. La función no recibe perfil: nadie regenera
  los códigos de otro. El administrador sigue teniendo una única vía sobre la cuenta ajena, la
  reposición del TOTP, y no gana ningún control nuevo.
- **Qué se exige**, en este orden y en el mismo recorrido:
  1. **Contraseña** de la cuenta, comprobada en servidor.
  2. **El código TOTP actual**, con un reto nuevo (`mfa.challenge` + `mfa.verify`) pedido en ese
     momento. Eso es lo que renueva `last_challenged_at` y deja pasar a la base.
  3. La base sigue exigiendo por su cuenta `aal2` y un reto de menos de cinco minutos
     (`segundo_factor_verificado_recientemente()`).
  - **Sin PIN.** El técnico administrativo no tiene PIN (§Candado), y el PIN protege la historia
    clínica de quien está delante del teclado, no la cuenta.
  - **Sin pase automático en local.** El recorrido nunca llama a `superarSegundoFactorSembrado()`
    (T-033): el código TOTP lo teclea siempre el usuario.
- **Los códigos viejos**: quedan caducados **en la misma transacción** que crea los nuevos, como ya
  hace `generar_codigos_recuperacion()` (`usado_en = now()` sobre el lote vigente). Un código del
  lote anterior se rechaza al canjearlo. Los nuevos se enseñan una sola vez. No hay un lote «en
  espera» ni se conservan los viejos hasta que el usuario confirme.
- **El aviso**: lo inserta la propia función en `notificaciones`, en la misma transacción que el
  lote. Así cubre la pantalla y la llamada directa por PostgREST. Si el aviso no se puede escribir,
  no hay lote nuevo. El canal y dónde se ve dependen de **P-2**, y si también avisa al activar, de **P-3**.
- **Auditoría**: lo que ya escribe el disparador `auditar_codigos_recuperacion_totp` (una fila
  `UPDATE` por código caducado y una `INSERT` por código nuevo, con `actor_id` del titular y sin
  `codigo_hash`). **No se añade un verbo nuevo** a `auditoria_operacion_check`: el titular, la hora
  y el lote ya quedan identificados por esas filas, y ensanchar la lista blanca obliga a reescribir
  la restricción (la última definición vive en `20260916120000_alta_de_paciente_completa.sql:382`,
  y la cola de `supabase/` puede haberla movido otra vez). Si el diseño necesita un verbo, para y
  vuelve al propietario.

## Tareas

- [ ] **Diseño** (`tickets/T-038/diseno.md`, arquitecto) **después** de las respuestas a P-1…P-4.
  Tiene que decir:
  - cómo se comprueba la contraseña en servidor **sin sustituir la sesión `aal2` por una `aal1`**.
    `signInWithPassword` sobre el cliente de cookies la sustituiría y la guardia mandaría al usuario
    a `/primera-vez`. También qué queda en `auth.sessions` y cómo se cierra la sesión auxiliar, si
    la hay;
  - si `generar_codigos_recuperacion()` serializa por titular. **Hipótesis por medir**: con dos
    llamadas concurrentes en `READ COMMITTED`, la segunda no ve las filas recién insertadas por la
    primera y ninguna las caduca, así que quedan **20 vigentes**. Si se confirma, el arreglo entra
    aquí (CA4);
  - cuál es el cuerpo vigente de cada función que toca (`grep -ln … supabase/migrations/*.sql | tail -1`,
    regla de `.claude/rules/supabase.md`);
  - qué aserciones de `scripts/rls/13-cuentas.sql` cuentan filas de `notificaciones` y cambian al
    haber un aviso más por generación.
- [ ] **Migración hacia delante** que reemite `generar_codigos_recuperacion()` con la misma firma, el
  aviso dentro y, si el diseño lo confirma, el candado por titular.
- [ ] **Banco 13** (`scripts/rls/13-cuentas.sql`): aviso, caducidad del lote viejo, canje del viejo,
  y las regresiones de `aal1` y reto antiguo, con las nuevas aserciones.
- [ ] **Pantalla** de regenerar en el sitio que decida P-1, con el enlace desde el armazón.
- [ ] **Avisos visibles** donde decida P-2.
- [ ] **Vista de fallo al activar** (`app/primera-vez/segundo-factor.tsx`): R2-H3, R3-H1 y R3-H2.
- [ ] **Spec de Playwright** en `accesibilidad/` para el recorrido completo (CA8).
- [ ] **`docs/interfaz.md`**: el choque Ajustes/«Mi cuenta» y la pantalla nueva.

## Criterios de aceptación (verificables)

**Base de datos** (banco 13, `npm run test:rls`)

1. **Automático**: como `authenticated`, con `aal2` y un reto reciente, `generar_codigos_recuperacion()`
   devuelve diez códigos y deja el estado así:
   - del lote anterior, cero vigentes;
   - exactamente diez vigentes nuevos;
   - **una** fila nueva en `notificaciones` del titular, con el tipo que fije el diseño
     (p. ej. `codigos_regenerados`);
   - ninguna fila nueva en `notificaciones` de otro perfil.
2. **Automático**: con `aal1`, o con `aal2` y el reto de hace más de cinco minutos, lanza `42501` y no
   deja **ni lote nuevo ni aviso** (regresión de las aserciones que ya existen, ahora también sobre
   `notificaciones`).
3. **Automático**: después de regenerar, canjear un código del lote **anterior** da `canjeado = false,
   motivo = 'codigo_invalido'`, y uno del lote **nuevo** da `ok`.
4. **Automático**: dos generaciones concurrentes del mismo titular, con dos conexiones, dejan **exactamente
   diez** códigos vigentes y dos avisos. La evidencia incluye el contraensayo: la misma prueba contra la
   función sin el arreglo, con su salida roja, o la medición que demuestra que la hipótesis era falsa.
   Si el guion confirma filas, usa `contenedorDelProyecto()` (`lib/cuentas/contenedor-proyecto.ts`)
   y no `localizarContenedor()` (R2-H4).
5. **Automático**: tras una regeneración, `auditoria` tiene diez filas `UPDATE` y diez `INSERT` sobre
   `codigos_recuperacion_totp` con `actor_id` = titular, y ninguna lleva `codigo_hash` en
   `estado_anterior` ni en `estado_posterior`.
6. **Revisión**: en el cuerpo vigente de la función (`pg_get_functiondef`), el `insert` en
   `notificaciones` no está dentro de un bloque `exception` que pueda tragarse su fallo, y la función no
   recibe ningún parámetro de perfil.

**Pantalla y servidor** (`npm test`)

7. **Automático**: pruebas del recorrido de regenerar:
   - con la contraseña errónea, la acción **no** llama al RPC;
   - con el TOTP erróneo, tampoco;
   - con las dos correctas, lo llama **una** vez y enseña los diez códigos;
   - en todos los casos, la sesión del usuario sigue siendo `aal2`: comprobar la contraseña no la sustituye;
   - la acción valida la entrada con el **mismo** esquema Zod que el formulario y recibe `unknown`.
8. **Automático**: el spec de `accesibilidad/` (`npm run test:a11y`), con un usuario propio creado por el
   spec (patrón de `codigos-recuperacion.spec.ts`), sigue este recorrido:
   - entra y abre la pantalla de P-1;
   - regenera con su contraseña y un TOTP calculado con `codigoTotp`;
   - comprueba contra la base que el lote es otro (ids distintos, diez vigentes) y que existe el aviso;
   - comprueba que el aviso **se ve** donde decida P-2;
   - comprueba que el usuario sigue dentro, sin pasar por `/primera-vez`.
9. **Automático**: si la generación falla al activar, la vista de fallo (R2-H3):
   - dice qué implica (los códigos no se volverán a ofrecer al entrar) y dónde generarlos;
   - ofrece **Reintentar**, que vuelve a llamar a `generarCodigos()` y, si esta vez va bien, enseña los
     códigos;
   - mantiene «Aceptar» (seguir sin códigos).
10. **Automático** (R3-H1): toda vista que sustituye a otra tras una mutación (fallo al activar,
    códigos generados al activar, códigos regenerados, fallo al regenerar) cumple tres cosas:
    - lleva el foco a un elemento con rol;
    - ese elemento tiene nombre accesible (`toHaveAccessibleName`);
    - su nombre o su descripción contienen el aviso.
    Se mide con `document.activeElement`.
11. **Automático** (R3-H2): en la prueba de «el refresh espera al usuario», `expect(vi.getTimerCount()).toBe(0)`
    justo al aparecer la vista. La revisión anota el mutante `setTimeout(() => router.refresh(), 60000)`
    y comprueba que muere.
12. **Automático**: `grep -rn superarSegundoFactorSembrado` no encuentra ningún uso fuera de los que ya
    tenía T-033 (el recorrido de regenerar no lo importa).

**Roles**

13. **Automático**: la pantalla y su enlace están para los tres roles (seed: administrador, profesional y
    técnico) y regeneran **solo el lote propio**. El técnico, que no tiene PIN, regenera sin que se le
    pida.
14. **Manual**: ningún rol ve un control para regenerar los códigos de otro perfil. La pantalla de
    reposición de `/ajustes/reponer-totp` no cambia.

**Cierre**

15. **Automático**: `npm test`, `npm run lint`, `npm run build`, `npm run lint:migraciones`,
    `npm run test:rls` y `npm run test:a11y` limpios. `npm run tipos` sin diferencias, o regenerado y
    comprometido. `node ~/.claude/pipeline/territorio.mjs T-038` en verde.
16. **Manual**: la pantalla nueva a 360 px y al lado de `/prototipo` usa el mismo vocabulario visual y
    ningún control de adorno.

## Guion de comprobación manual

Con un usuario **no sembrado** que tenga el TOTP en el móvil. Con uno sembrado, el código se calcula
con `codigoTotp` y el secreto de la siembra. Hay que esperar a la siguiente ventana de 30 s si se
acaba de entrar con el mismo código.

1. Entra. Abre la pantalla de P-1 desde el bloque de usuario de la barra lateral.
2. «Regenerar códigos»: teclea una contraseña errónea. Ves el error y sigues dentro.
3. Contraseña correcta y código TOTP. Ves diez códigos nuevos y el texto de «una sola vez».
4. «Ya los he guardado». El aviso de la regeneración aparece donde diga P-2.
5. Cierra sesión y entra con contraseña. En `/recuperar`, prueba un código **anterior**: rechazado.

## Notas para el agente

- **Cola de `supabase/`**: un solo dueño. Este ticket entra detrás de lo que haya en la cola al
  empezar; hoy, según `docs/state.md` §Siguiente paso, es T-036 → T-035 → T-028a → cita↔episodio.
  El nombre de la migración se fija al tomar el turno, con fecha posterior a la última integrada.
- **La base local está ocupada** mientras otro ticket tenga el turno de `supabase/`. No se hace
  `db reset` fuera de turno.
- **La mitad de la contraseña no la puede comprobar la base** (comentario de
  `segundo_factor_verificado_recientemente()`). Si P-4 decide que sí, es otro diseño (parámetro en
  claro hacia Postgres) y vuelve al propietario antes de implementar.
- `codigos_recuperacion_totp` no tiene `select` para nadie, tampoco para `service_role`. Las
  comprobaciones contra la base van por `psql` como `postgres`, como en el spec de T-037.
- `notificaciones` no tiene `insert` ni `delete` para `authenticated`, y `fn_proteger_notificacion()`
  solo deja tocar `leida_en`. El titular (o quien tenga su sesión) puede **marcar leído** un aviso,
  pero no borrarlo ni cambiarlo. Por eso, si P-2 lo enseña en una lista, la lista incluye los leídos.
- Los textos van a `lib/i18n/es.ts`; `sin-literales.test.ts` los vigila. El `detalle` del aviso vive en
  la base, como en `registrar_reposicion_totp()`.
- Lección de T-037 para el revisor: «espera al usuario» no se prueba con un plazo, y una vista que
  sustituye a otra se mide por foco, rol y nombre.
- R2-H4 (`scripts/seed.mjs`, `scripts/test-huellas.mjs` con el primer `supabase_db_*`) **no** entra:
  queda en `state.md`.

## Decisiones del propietario (02-10-2026)

- **P-1 → (a)**: página propia `/cuenta` («Mi cuenta»), sección «Seguridad», desde el bloque de usuario
  de la barra lateral. `/ajustes` sigue siendo solo del administrador.
- **P-2 → (a)**: tabla `notificaciones`, sin canal nuevo; lista de avisos de seguridad en «Mi cuenta ›
  Seguridad», leídos incluidos. Ni correo ni banda en el armazón.
- **P-3 → sí**: toda generación avisa, también la de la activación.
- **P-4 → sí, también en la base** (el propietario se aparta de la recomendación). La función que
  regenera exige la contraseña como parámetro y la coteja en Postgres; la puerta directa por PostgREST
  con solo las cookies queda **cerrada**, no solo detectada. El diseño tiene que resolver, con prueba
  donde se pueda:
  - **dos funciones**: la generación de la activación (sin contraseña, como hoy) y la regeneración
    (con contraseña), sin que la primera sirva de atajo para la segunda una vez hay lote;
  - que la contraseña **no quede escrita en ningún sitio**: ni en `auditoria`, ni en `notificaciones`,
    ni en mensajes de error o `RAISE`, ni en los registros de Postgres (`log_statement`,
    `log_min_error_statement`), ni en el cliente del navegador (va de la Server Action a la RPC);
  - cómo se coteja contra `auth.users` sin dar a `authenticated` lectura de esa tabla, y qué pasa con
    una cuenta sin contraseña;
  - el límite de intentos fallidos (que la RPC no sirva para adivinar la contraseña a ritmo de red).
  Los criterios 7-8 y la nota de la línea ~222 se leen con esta decisión; donde choquen, manda esta.

## Preguntas para el propietario (decididas el 02-10-2026: ver arriba)

- **P-1 · Dónde vive la acción.**
  - (a) **Recomendado**: una página propia, `/cuenta` («Mi cuenta»), dentro de `(app)` (la guardia
    ya la cubre), con la sección «Seguridad», a la que se llega desde el bloque de usuario de la barra
    lateral. `modulos.ts` y la fila «Usuarios y ajustes de empresa» de la matriz no se mueven, y el
    bloque «Usuario» de `interfaz.md` §Ajustes pasa a vivir allí.
  - (b) Abrir `/ajustes` a los tres roles, con el bloque de administración oculto para quien no lo es.
    Obliga a cambiar `roles` en `modulos.ts` y su prueba.
- **P-2 · Canal del aviso y dónde se ve.**
  - (a) **Recomendado**: la tabla `notificaciones`, que ya existe, y ningún canal nuevo. Los avisos de
    seguridad del titular (este, `totp_repuesto`, `pin_bloqueado`) se listan en la sección «Seguridad»
    de P-1, leídos incluidos, del más reciente al más antiguo. La campana de T-015 leerá las mismas filas
    cuando exista. Hoy **ninguna pantalla** lee `notificaciones`: sin esta lista, el aviso existiría y
    nadie lo vería.
  - (b) Además, una banda en el armazón mientras haya avisos de seguridad sin leer. Es más visible,
    pero quien tiene la sesión robada también puede marcarlos leídos. Amplía el territorio al armazón
    y adelanta parte de T-015.
  - (c) **Correo**: no recomendado. GoTrue solo avisa por correo de sus propios eventos (contraseña,
    factores), y el lote de códigos es una tabla nuestra. Enviar este correo exige el SMTP de la clínica
    (ADR-038, camino 3, caso a caso) y contradice la decisión de dominio 1 de T-006 («nunca correo»):
    haría falta un ADR nuevo.
  - (d) **`wa.me`**: no aplica. Es un envío manual de una persona al paciente (decisión 11, ADR-023),
    no un aviso de seguridad al propio usuario.
- **P-3 · ¿Se avisa también al activar?**
  - **Recomendado: sí, en toda generación.** La base no distingue «activar» de «regenerar» sin una
    heurística: tras una reposición quedan filas del lote anterior. Un aviso neutro del tipo «Se han
    generado códigos de recuperación nuevos; los anteriores ya no valen. Si no has sido tú, avisa al
    administrador» es cierto en los dos casos.
  - La alternativa (avisar solo cuando ya había un lote vigente) deja sin aviso al atacante que
    regenera sobre una cuenta sin lote.
- **P-4 · ¿La contraseña se exige también en la base?**
  - **Recomendado: no, solo en la pantalla.** La puerta directa por PostgREST queda cubierta por la
    detección (el aviso de la base), no por la prevención.
  - Exigirla en la base cerraría esa puerta a quien solo tiene las cookies. A cambio, obligaría a pasar
    la contraseña en claro como parámetro a Postgres y a separar la generación de la activación de la de
    regeneración en dos funciones.

## Lo que no entra, y por qué

- **La campana de notificaciones y marcar como leído**: es T-015. Este ticket solo enseña la lista
  de P-2.
- **Cambiar la contraseña, cambiar el PIN o reconfigurar el TOTP propio** (cambio de móvil) desde
  «Mi cuenta»: son recorridos distintos, con sus propias reglas. Si se quieren, van en tickets propios.
- **«Te quedan N códigos» o la fecha del lote vigente**: exige una función nueva de solo lectura sobre
  una tabla sin `select`. Ningún criterio lo pide.
- **Aviso `beforeunload`** en la pantalla de códigos: el propietario lo descartó en T-037 (P-1), y
  regenerar ya es la salida para quien cierra sin guardar.
- **Correo o cualquier canal externo**: ver P-2.
- **R2-H4**: fuera del territorio (`scripts/seed.mjs`, `scripts/test-huellas.mjs`). Sigue en `state.md`.
