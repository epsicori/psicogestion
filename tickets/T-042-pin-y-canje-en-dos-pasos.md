---
id: T-042
titulo: El PIN de la historia y el canje de códigos, en dos pasos (y el PIN nulo deja de abrir la historia)
modelo: opus
riesgo: alto
fase: 1
prioridad: alta
depende_de: [T-038]
estado: hecho
completado: 2026-10-04
delegable: no                         # todo es candado, contador o secreto; ver diseño §7
territorio:
  - supabase/migrations/*_pin_y_canje_en_dos_pasos.sql   # cola de un solo dueño: justo detrás de T-038
  - scripts/rls/**                    # ayudante nuevo en 00, banco nuevo 24, y el cambio mecánico de llamadas
  - scripts/t042-*                    # oráculo por HTTP y concurrencia
  - lib/cuentas/candado.ts
  - lib/cuentas/candado.test.ts       # nueva
  - lib/cuentas/totp.ts               # solo `canjearCodigoRecuperacion`
  - lib/cuentas/totp.test.ts          # solo casos nuevos del canje
  - lib/supabase/tipos-bd.ts          # solo regenerado con `npm run tipos`, nunca a mano
  - accesibilidad/recuperar.spec.ts   # nueva
  - docs/bitacora/T-042.md
  - docs/state.md
---

# Contexto

En la ronda 1 de T-038, el revisor A encontró un defecto fuera del diff (hallazgo «PIN y canje», ALTA,
en `docs/state.md` §Hallazgos; nota completa en `tickets/T-038/diseno.md` §R2.9).
`desbloquear_historia(p_pin)` y `canjear_codigo_recuperacion(p_codigo)` cotejan el secreto, cuentan
el fallo y devuelven el resultado **en la misma transacción**. Con PostgREST 16.1, el cliente puede
pedir el resultado como objeto singular con un filtro sobre la salida
(`Accept: application/vnd.pgrst.object+json` y `?desbloqueado=is.true`). Si falla, recibe un 406 y
la transacción se deshace, **y con ella el intento fallido**. El límite de cinco intentos del
ADR-026 no existe: un PIN de seis dígitos cae por fuerza bruta.

El propietario decidió el 03-10-2026 (P3 de T-038) que se arregle en un ticket aparte, de riesgo alto
y justo detrás de T-038 en la cola de `supabase/`, con el protocolo de dos pasos de T-038 ronda 2
(DR1 y DR2 en `tickets/T-038/diseno.md`).

**Al diseñarlo apareció algo peor, medido el 03-10-2026 en la base local (`begin … rollback`).**
`desbloquear_historia(null)`, llamada como el profesional sembrado
`11111111-1111-4111-8111-111111111111`, devuelve `desbloqueado = t, motivo = ok` y deja
`historia_desbloqueada() = t`.

El motivo: `if extensions.crypt(p_pin, v_pin.hash) <> v_pin.hash` vale NULL cuando `p_pin` es NULL
(`20260830090000_cuentas_invitacion_baja_totp.sql:765`). Un `if` con NULL no entra en la rama del
fallo, así que la función sigue hasta la del acierto. Por PostgREST basta un
`POST /rpc/desbloquear_historia` con `{"p_pin": null}` y la sesión del navegador: **la historia se
abre sin PIN.** Es exactamente el escenario contra el que existe el ADR-026: alguien ante una sesión
abierta. La Server Action no lo permite (`esquemaPin` exige seis dígitos), pero PostgREST sí.

El canje no tiene ese defecto: allí la comparación va en un `where` y el NULL no casa.

# Qué queda fijado por este contrato

1. **Dos pasos para el PIN**:
   - `comprobar_pin_historia(p_pin text) returns void` coteja y confirma siempre;
   - `desbloquear_historia()`, sin argumentos, abre la ventana solo si el paso uno dejó una
     autorización vigente.
   - La firma `desbloquear_historia(text)` desaparece.
2. **Dos pasos para el canje**:
   - `comprobar_codigo_recuperacion(p_codigo text) returns void`;
   - `canjear_codigo_recuperacion()`, sin argumentos, que **es** el canje: consume el código
     autorizado, audita y avisa.
   - La firma `canjear_codigo_recuperacion(text)` desaparece.
3. **Un PIN nulo o vacío es un intento fallido**: cuenta y bloquea como cualquier otro.
4. **La autorización del PIN dura 60 s, con un tope de 2** (como DR2 de T-038). **La del canje dura
   60 s y apunta a un único código**, que vuelve a comprobarse vigente en el paso dos. Pendiente de
   confirmar: P1 y P2 del diseño.
5. Lo que el ADR-026 y el ADR-039 ya fijaban **no cambia**:
   - cinco fallos bloquean quince minutos;
   - `PIN_FALLIDO` en cada fallo y `PIN_BLOQUEADO` más el aviso `pin_bloqueado` al bloquear;
   - el bloqueo se mira antes de comparar;
   - el canje no exige segundo factor;
   - un código canjeado no vuelve a valer;
   - `TOTP_REPUESTO` y el aviso `totp_repuesto` en el canje;
   - el factor se borra con la Admin API en `lib/`.
6. **Las Server Actions y las pantallas no cambian de contrato.** `abrirHistoria` y `canjearCodigo`
   siguen recibiendo y devolviendo lo mismo, porque los dos pasos viven en `lib/cuentas/`.

# Tareas

1. La migración `supabase/migrations/20261009120000_pin_y_canje_en_dos_pasos.sql`, como dice
   `tickets/T-042/diseno.md` §1.1. Si T-038 entra con otro sello de tiempo, esta va justo detrás.
2. En el banco:
   - ayudantes de dos pasos en `scripts/rls/00-ayudantes.sql`;
   - cambio mecánico de las llamadas a la puerta de un paso en los bancos;
   - banco nuevo `scripts/rls/24-pin-y-canje-dos-pasos.sql` (diseño §1.3).
3. `lib/cuentas/candado.ts` y `lib/cuentas/totp.ts`, con dos llamadas cada una y sus pruebas
   (diseño §1.4).
4. `scripts/t042-oraculo.mjs`: el oráculo y la concurrencia por HTTP (diseño §1.5).
5. `accesibilidad/recuperar.spec.ts`: el canje real de extremo a extremo (diseño §1.6).
6. `npm run tipos`, tras aplicar la migración.
7. Bitácora en `docs/bitacora/T-042.md` y `docs/state.md` reescrito. Se cierra el hallazgo «PIN y
   canje» y se añaden los que salgan.

# Criterios de aceptación

Cada criterio se cierra con la salida real del comando que dice el diseño §3, y cada mutante del
diseño §3 se ve en rojo **con el motivo dicho** antes de revertirlo.

## Base de datos

1. **Firmas.** `to_regprocedure('public.desbloquear_historia(text)')` y
   `to_regprocedure('public.canjear_codigo_recuperacion(text)')` son nulos. Las cuatro funciones
   nuevas:
   - existen con la aridad del diseño;
   - son `security definer` y `volatile`, con `search_path=""`;
   - las dos comprobaciones devuelven `void`;
   - `authenticated` tiene `execute` y `anon` no.
2. **El PIN nulo no abre.**
   - `comprobar_pin_historia(null)` seguido de `desbloquear_historia()` devuelve
     `pin_incorrecto`, suma un intento y deja una fila `PIN_FALLIDO`. `historia_desbloqueada()`
     sigue falsa.
   - Lo mismo con `''`.
   - Cinco nulos bloquean.
3. **PIN en dos pasos.**
   - La comprobación devuelve lo mismo con el PIN bueno y con el malo.
   - El malo confirma el intento y deja la autorización a 0; el paso dos da `pin_incorrecto`.
   - El bueno deja una autorización de 60 s; el paso dos da `ok` y abre la ventana. Un segundo paso
     dos da `pin_incorrecto`.
   - Tres buenos seguidos dejan 2 autorizaciones.
   - Un bueno y luego un malo dejan 0.
   - Con la autorización caducada, o sin paso uno, el paso dos da `pin_incorrecto`.
4. **El bloqueo del ADR-026 sigue igual.**
   - Cinco fallos dan `bloqueado` durante 15 minutos.
   - Dejan exactamente cinco `PIN_FALLIDO`, un `PIN_BLOQUEADO` con `bloqueado_hasta` y un aviso
     `pin_bloqueado`.
   - El PIN correcto durante el bloqueo no autoriza ni toca la fila.
   - Ninguna entrada de auditoría lleva el PIN ni el hash.
5. **Canje en dos pasos.**
   - La comprobación devuelve lo mismo con un código bueno y con uno malo.
   - El malo suma un intento al lote y limpia la autorización; el paso dos da `codigo_invalido`.
   - El bueno autoriza **ese** código durante 60 s. El paso dos da `ok`, marca el código usado y deja
     `TOTP_REPUESTO` (`via = codigo_recuperacion`) y el aviso `totp_repuesto`.
   - Un segundo paso dos da `codigo_invalido`.
   - Un bueno y luego un malo dan `codigo_invalido`, y el código sigue sin usar.
   - Si entre los dos pasos se genera un lote nuevo, el paso dos da `codigo_invalido`.
   - Con la autorización caducada, o sin paso uno, da `codigo_invalido`.
6. **Lo que el canje ya hacía sigue igual.**
   - Cinco fallos bloquean y el código bueno durante el bloqueo no autoriza.
   - Sin lote, el paso dos da `sin_codigos`.
   - Funciona con una sesión **sin** segundo factor.
   - Sin sesión o con el perfil inactivo, 42501 en las dos funciones.
7. **Solo lectura.** En una transacción de solo lectura, las dos comprobaciones lanzan 25006 con el
   mismo texto para el secreto bueno y para el malo, y ningún contador cambia.
8. **Estructura (diseño §3, CA8).**
   - La guarda de solo lectura y el candado van antes de `extensions.crypt(`.
   - Después de `extensions.crypt(` no hay ningún `if`, `return` ni `raise`.
   - Hay una sola sentencia que escribe en la tabla del contador.
   - El parámetro secreto no aparece en `raise`, `format`, `jsonb_build_object` ni `execute`.
   - No hay `exception when`.
9. **Oráculo por HTTP.** `npx tsx scripts/t042-oraculo.mjs` sale con 0 y escribe
   `tickets/T-042/oraculo-postgrest.json` con O1 a O7 en verde (diseño §1.5).
10. **Concurrencia por HTTP**, en el mismo guion:
    - tres comprobaciones malas a la vez suman tres;
    - dos canjes autorizados a la vez dan exactamente un `ok`, un código usado y un `TOTP_REPUESTO`.

## Servidor y pantalla

11. `desbloquearHistoria` hace dos llamadas, en este orden:
    - `rpc('comprobar_pin_historia', { p_pin })`;
    - `rpc('desbloquear_historia')`, sin argumentos.

    Si la primera falla, no hay segunda y el resultado es `motivo: 'error'`. El PIN no aparece en
    ningún `console.error`. Lo cubre `lib/cuentas/candado.test.ts`.
12. `canjearCodigoRecuperacion` sigue el mismo patrón con `comprobar_codigo_recuperacion` y
    `canjear_codigo_recuperacion`. La Admin API se llama solo con `ok`. Lo cubre
    `lib/cuentas/totp.test.ts`.
13. **El contrato de las Server Actions y de las pantallas no cambia.**
    - `git diff main -- app/ components/` está vacío.
    - `accesibilidad/nota-clinica.spec.ts`, que abre la historia con el PIN real, pasa.
14. **Canje real.** `accesibilidad/recuperar.spec.ts` pasa:
    - con un código bueno lleva a `/primera-vez`, deja 0 factores TOTP y marca el código usado;
    - con uno malo enseña «código no válido» y deja `intentos_fallidos = 1` confirmado en el lote.

## Cierre

15. Pasan, con la salida en la evidencia:
    - `npm run test:rls`, `npm test`, `npm run lint`, `npm run lint:migraciones` y `npm run build`;
    - `npx playwright test accesibilidad/nota-clinica.spec.ts accesibilidad/recuperar.spec.ts --workers=1`.

    `lib/supabase/tipos-bd.ts` cambia solo en las cuatro funciones.

# Notas para el agente

- **Base compartida.** No se hace `db reset` mientras otro agente la use. Las medidas sin migración,
  en `begin … rollback`. El `db reset` del cierre se coordina con el orquestador.
- **Ningún `{ get: true }`** en las llamadas nuevas: el paso uno lleva el secreto y tiene que ir por
  POST.
- Los guiones `scripts/t002-rls.sql` y `scripts/t004-auditoria.sql` llaman a la firma vieja y **no**
  se tocan (diseño, «Lo que no entra»).
- Si algo obliga a tocar `app/**`, se para y se pregunta: el contrato dice que no hace falta.

# Decisiones y preguntas para el propietario

Las preguntas con su recomendación están en `tickets/T-042/diseno.md` §8:

- P1: PIN, 60 s y 2.
- P2: el contador del canje sigue siendo por lote.
- P3: el PIN nulo, ¿arreglo inmediato o con este ticket?

# Lo que no entra

Está en `tickets/T-042/diseno.md`, «Lo que no entra, y por qué».
