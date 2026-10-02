---
id: T-036
titulo: La firma no se fía del cliente — cita_id cotejado, borrador vivo, abierta_en de la cabecera y «en sesión» recalculado en la base
modelo: opus
riesgo: alto
fase: 2
prioridad: alta
depende_de: [T-012c, T-012]
estado: hecho
territorio:
  - supabase/migrations/*_firma_cotejada_con_borrador_y_cita.sql
  - scripts/rls/00-ayudantes.sql        # solo si sobre_prueba tiene que leer borrador_abierta_en de la cabecera
  - scripts/rls/04-baja.sql             # su firma como authenticated (PROBAJA) es retrofechada y sin borrador
  - scripts/rls/14-cadena-huellas.sql
  - scripts/rls/19-nota-en-episodio.sql # solo sus firmas como authenticated
  - scripts/rls/20-*.sql                # el banco de T-012, solo sus firmas como authenticated
  - scripts/rls/README.md
  - scripts/t005-concurrencia.sql       # la doble firma concurrente (criterio 6)
  - docs/architecture.md
---

# Contexto

Este ticket cierra lo que T-012 deja abierto a propósito. El origen es doble:

- **ADR-073.4 (P7 de T-012c, hecho H27).** En la era 4, el disparador de versiones coteja con la
  cabecera de `notas_clinicas` las claves del sobre que deciden quién lee: `nota_id`,
  `paciente_id`, `episodio_id`, `autor_id`, `fecha_sesion` y `coprofesional_id`. `cita_id` va
  sellado en el sobre, pero no se compara con `notas_clinicas.cita_id`. Una versión puede llevar en
  el sobre una cita distinta de la que marca su cabecera, y ni el disparador ni `verificar:huellas`
  lo notan.
- **Decisiones D1 y D3 del propietario (01-10-2026), en `tickets/T-012/diseno.md` §D.**
  - **D1, el sello es falsificable.** El autor puede insertar por PostgREST una versión con
    `abierta_en` o `redactada_en_sesion` inventados. El disparador comprueba sus tipos, no su
    origen (`fn_sellar_version_nota`, 6.8 y 6.9 de `20261001120000_nota_id_en_el_sobre.sql`).
    Hoy una casilla de «lo escribí en sesión» la marca quien firma, que es justo lo que el ADR-046
    prohíbe («se calcula en el servidor al firmar […] no es un campo que el usuario marque»).
  - **D3, doble firma de una modificación.** Dos pulsaciones de «Firmar v2» dan una v2 y una v3
    idénticas, porque la segunda leyó el borrador antes de que la primera lo vaciara. T-012 solo
    desactiva el botón (diseño de T-012, §4.5). No cubre dos pestañas, dos dispositivos ni PostgREST.

El propietario aprobó el 01-10-2026 que T-036 lo cierre en la base con tres puntos más el original:

| # | Qué exige el disparador al insertar una versión | Cierra |
|---|---|---|
| **A** | El `cita_id` del sobre es el `cita_id` de la cabecera | H27 |
| **B** | La nota tiene un **borrador vivo** (`notas_clinicas.borrador_contenido is not null`) | D3 |
| **C** | El `abierta_en` del sobre es el `notas_clinicas.borrador_abierta_en` de la cabecera | D1 |
| **D** | `redactada_en_sesion` es el que la base recalcula, sin fiarse de ninguna entrada del cliente | D1 |

**No cambia la forma del sobre ni abre una era 5.** `lib/huella/**` no se toca.

## Depende de T-012 integrado

T-036 **no puede empezar hasta que T-012 esté en `main`.** Los puntos B, C y D usan piezas que
crea T-012 y que **no existen en `main` (`c7bb544`)**. Comprobado con `grep` en
`supabase/migrations/`, `scripts/` y `lib/`: no aparece `borrador_abierta_en`, ni ninguna columna
`margen_sesion_minutos` en tabla (solo como clave del sobre). Los nombres salen del diseño de
T-012, §1.2 (migración `supabase/migrations/20261002120000_nota_clinica_borrador_firma.sql`):

| Pieza (creada por T-012) | Para qué la usa T-036 |
|---|---|
| `notas_clinicas.borrador_abierta_en timestamptz`, escrita solo por `fn_tocar_borrador()` | C |
| `notas_clinicas_borrador_abierta_ck`: `(borrador_abierta_en is null) = (borrador_contenido is null)` | B y C |
| `organizacion.margen_sesion_minutos smallint not null default 15` y `centros.margen_sesion_minutos smallint` (nulo = hereda) | D |
| El margen efectivo: `centros.margen_sesion_minutos ?? organizacion.margen_sesion_minutos`, con el centro de la cita (diseño de T-012, §1.5 paso 4) | D |

Lo que ya está en `main` y también se usa: `fn_vaciar_borrador_al_firmar()` (`after insert`,
`20260829210000_cadena_de_huellas.sql`), el bloqueo `for no key update` de la cabecera en el
paso 2 de `fn_sellar_version_nota`, `citas.inicio`, `citas.fin` (`timestamptz not null`) y
`citas.centro_id` (**nulable**: sin centro, el margen es el de la organización).

**El diseño de T-036 vuelve a verificar estos nombres contra `main` después de T-012.** Si T-012
los renombra al integrarse, mandan los de `main`. La marca de la migración de T-036 es posterior a
la de T-012 (y a la de T-035 si ya está). Orden de integración: T-014 → T-012 → T-035/T-036, en
serie, porque los cuatro tocan `supabase/`.

## Quién queda sujeto: los roles

Los cuatro puntos se aplican **solo cuando `current_setting('role', true)` es `authenticated` o
`anon`**, igual que el paso 0 (ADR-071.5). Así:

- Las firmas retrofechadas que hacen `postgres` en la siembra (`supabase/seed-completo.sql`), en
  `npm run test:huellas` (`scripts/t005-concurrencia.sql`, `creada_en` de 2026-01-01) y en la
  fijación de los bancos siguen entrando sin tocar esos ficheros.
- El `fn_tocar_borrador` de T-012 fija `borrador_abierta_en := now()` siempre. Una firma
  retrofechada nunca podría cumplir C y la 6.8 (`abierta_en <= firmada_en`) a la vez.
- D1 y D3 llegan por PostgREST, que es `authenticated`.
- Lo decidió el propietario el 01-10-2026 (P1).

Las firmas como `authenticated` que ya hay en los bancos se rehacen para que firmen como lo haría
la aplicación: con borrador vivo, el `abierta_en` de la cabecera y el `firmada_en` del reloj de la
base. Son la de PROBAJA en `04-baja.sql:30` (retrofechada y sin borrador), la gemela de C.perm en
`14-cadena-huellas.sql:982` y las de `19-nota-en-episodio.sql` posteriores a `como(:PRO1)`.

## Decidido por el propietario el 01-10-2026

- **P1 · Las comprobaciones son solo para `authenticated` y `anon`, como el paso 0.** Por lo que
  dice la sección de arriba. La siembra, `01-fijacion.sql` y `t005-concurrencia.sql` no cambian
  sus firmas de `postgres`. El futuro importador decidirá su propia regla. Criterio 13.
- **P2 · `firmada_en` (= `creada_en`) va acotado al reloj de la base.** Hoy `creada_en` lo manda
  quien firma (`lib/huella/firmar.ts` lo pone en el `insert`) y nada lo ata a `now()`. Si la base
  recalculara D con un `firmada_en` elegido por el cliente, bastaría con retrofecharlo dentro de la
  ventana para que saliera «en sesión», y D no cerraría D1. El diseño fija la tolerancia, pensando
  en el riesgo 6 de T-012 (reloj de Node frente al de la base). Criterio 11.
- **P3 · «En sesión» exige que la cita sea de esta nota.** Es la misma regla que
  `fn_resolver_alerta_nota_sin_firmar` de T-012 (§1.2 paso 9): la cita tiene el mismo paciente que
  la nota y su profesional es el autor. Hoy `notas_clinicas.cita_id` no está atado a su cita
  (diseño de T-012, hecho 18), y antes de la primera firma el autor puede apuntar su cabecera a la
  cita de otro profesional. La versión cuya cabecera apunta a una cita ajena se rechaza al firmar.
  Criterio 12.
- **Prioridad alta**: T-036 va inmediatamente después de T-012.

## Tareas

- [ ] **Diseño corto** (`tickets/T-036/diseno.md`, arquitecto), hecho sobre `main` con T-012
  integrado. Parte del disparador y del verificador que haya en ese momento, verificados contra el
  código. Tiene que decir:
  - el número de cada comprobación nueva (desde la 6.17, o la siguiente libre) y su sitio en el
    disparador. B va después del paso 0 y del bloqueo de la cabecera (paso 2), y antes de C. Ningún
    error nuevo puede salir antes que el 42501 del paso 0;
  - el mensaje de cada una, con un fragmento que no contenga ningún otro mensaje del disparador
    (regla de `.claude/rules/supabase.md`, T-012c H1/H2);
  - cómo se normalizan las mayúsculas de `cita_id` (el sobre no la pasa a minúsculas);
  - cómo se compara `abierta_en` (milisegundos con «Z», como `toISOString()`) con
    `borrador_abierta_en` (microsegundos): truncando, no redondeando, igual que hace la acción de
    T-012 al construir el `Date`;
  - la fórmula de D, idéntica a `calcularRedactadaEnSesion` de `lib/huella/sesion.ts`:
    `abierta_en >= inicio − margen` y `firmada_en <= fin + margen`, con los dos bordes incluidos;
  - la tolerancia de P2 y su porqué;
  - la línea nueva del verificador, que es solo para A (ver «Lo que no entra»);
  - cómo fija el banco un `borrador_abierta_en` con microsegundos no nulos (criterio 7).
- [ ] **Migración hacia delante** que re-emite `fn_sellar_version_nota()`,
  `verificar_cadena_huellas(uuid)` y `fn_congelar_cabecera_sellada()`, con sus comentarios. El
  cuerpo de cada una se toma con `pg_get_functiondef`; no se reescribe a mano (lección N1 de
  T-012b). Hoy el mensaje y el comentario de `fn_congelar_cabecera_sellada` dicen que el verificador
  coteja la cabecera «salvo la cita» (`20261001120000:619-622` y `:631-634`). Tras T-036 eso es
  falso, así que se corrigen, conservando el fragmento «no se puede reatribuir» que comprueba la
  19.41.
- [ ] **Banco 14**, más las firmas `authenticated` de los otros bancos del territorio:
  - una negativa con su gemela positiva por cada comprobación nueva, como `authenticated`;
  - un mutante por comprobación;
  - la fila manipulada para el verificador.
- [ ] **`scripts/t005-concurrencia.sql`**: la doble firma concurrente de una modificación.
- [ ] **`docs/architecture.md`**: las comprobaciones nuevas, a quién se aplican (P1) y por qué el
  verificador no recalcula D.

## Criterios de aceptación

Todas las negativas nuevas lanzan **`23514`**, la familia de las 6.x. Así la acción de T-012 las
traduce a «conflicto» sin cambiar código (§1.5 paso 7 de su diseño). Cada negativa se asevera con
`pg_temp.assert_lanza_codigo_msg` y el fragmento propio de su comprobación. Cada gemela, con
`pg_temp.assert_no_lanza`.

**Generales**

1. `npx supabase db reset`, `npm run seed`, `npm run test:rls` y, tras otro `db reset`,
   `npm run test:huellas` salen con exit 0.

**A · `cita_id` (H27)**

2. Como `authenticated`, una versión con un `cita_id` en el sobre distinto del de la cabecera
   falla con 23514 y su fragmento. También fallan las dos formas con nulo: el sobre con cita y la
   cabecera sin ella, y al revés. La gemela, con el mismo `cita_id`, entra.
3. Una versión cuya cabecera tiene la cita cambiada como `postgres` (con los disparadores
   levantados) aparece en `npm run verificar:huellas` como `sobre_no_coincide_con_fila`. Sin el
   cambio, sale «cadena íntegra».

**B · Borrador vivo (D3)**

4. Como `authenticated`, el autor con la historia desbloqueada:
   - firma la v1;
   - comprueba que `borrador_contenido` quedó nulo (`fn_vaciar_borrador_al_firmar`);
   - inserta otra versión con motivo **sin reabrir el borrador**: falla con 23514 y el fragmento de
     B.

   La gemela reabre el borrador como lo haría `empezarModificacion` de T-012
   (`update … set borrador_contenido = …` como autor) y la v2 con motivo entra. También falla con
   23514 y el fragmento de B una v1 contra una cabecera que nunca tuvo borrador.
5. **El orden no filtra nada (ADR-071.5).** Contra una nota sin borrador, quien no es el autor y el
   autor sin desbloqueo reciben el **42501 del paso 0**, con el mismo mensaje que el resto de C.perm,
   y no el 23514 de B. La aserción «mismo error» de C.perm incluye este caso.
6. **Doble firma concurrente** (`npm run test:huellas`). Dos conexiones como `authenticated`, del
   mismo autor con la historia desbloqueada, firman a la vez la misma modificación (borrador vivo,
   motivo, el mismo sobre salvo `creada_en`). La segunda espera al cerrojo de la primera y, tras su
   `commit`, falla con 23514 y el fragmento de B. Al final la nota tiene **exactamente una** versión
   más.

**C · `abierta_en` (D1)**

7. Como `authenticated`:
   - un sobre cuyo `abierta_en` difiere en 1 ms de `borrador_abierta_en`, hacia atrás y hacia
     delante, falla con 23514 y el fragmento de C;
   - la gemela, con el valor exacto, entra;
   - con un `borrador_abierta_en` cuyos microsegundos por debajo del milisegundo no son cero (por
     ejemplo `…12.345999`), entra el sobre truncado (`…12.345Z`) y falla el redondeado (`…12.346Z`).

**D · `redactada_en_sesion` recalculado (D1)**

8. Como `authenticated`, con una cita de la cabecera:
   - el sobre dice `true` donde la base calcula `false`: falla con 23514 y el fragmento de D;
   - el sobre dice `false` donde la base calcula `true`: también falla;
   - las dos gemelas, con el valor que calcula la base, entran.
9. **Bordes incluidos**, igual que `calcularRedactadaEnSesion`: con `abierta_en = inicio − margen`
   y `firmada_en = fin + margen` exactos, `true` entra. Con 1 ms fuera por cualquiera de los dos
   lados, `true` falla.
10. **El margen tampoco lo elige el cliente (ADR-046: «el margen del centro»).** Un sobre con un
    `margen_sesion_minutos` distinto del efectivo falla con 23514 y su fragmento. El efectivo es el
    del centro de la cita si no es nulo y, si no, el de la organización. Hay dos gemelas: la de una
    cita cuyo centro tiene margen propio y la de una cita sin centro o con el margen del centro
    nulo, que hereda el de la organización. Sin cita, la 6.9 sigue igual.
11. *(P2.)* Un sobre con `creada_en`/`firmada_en` un día antes o un día después del reloj de la base
    falla con 23514 y su fragmento. La gemela, dentro de la tolerancia del diseño, entra.
12. *(P3.)* Una versión cuya cabecera apunta a una cita de otro paciente, o
    de otro profesional, falla con 23514 y su fragmento. La gemela, con la cita propia, entra.

**Alcance y regresión**

13. *(P1.)* Una prueba del banco 14 deja escrita la exención: como `postgres`, una firma sin borrador
    y retrofechada entra. Si alguien extiende las comprobaciones a todos los roles, esta prueba
    falla y obliga a revisar la decisión.
14. **Mutantes.** Por cada comprobación nueva (A, B, C, D, margen, `firmada_en` de P2 y cita de la nota de P3), el
    banco re-emite el disparador sin esa condición. Comprueba que su negativa deja de lanzar, lo
    restaura y comprueba con `pg_get_functiondef` que la función es idéntica a la guardada. Es el
    patrón de C.perm.
15. **El camino de la aplicación sigue firmando.** `npx tsx scripts/t012-nota.ts` (el guion de
    T-012) sale con exit 0 con la migración de T-036 aplicada. Firma «en sesión» `true` contra la
    cita en curso y `false` contra la de ayer.
16. `lib/huella/vectores-congelados.json` sin diff: ni la era ni el sobre cambian.
17. `npm run verificar:huellas` sobre la siembra: «cadena íntegra».
18. `npm run lint:migraciones`, `npm test`, `npm run build` limpios, y `territorio.mjs T-036` en
    verde.

## Lo que no entra, y por qué

- **El verificador no recalcula `redactada_en_sesion`.** El ADR-046 lo prohíbe: «derivarlo en la
  verificación en lugar de releerlo del sobre». Además, la cita se puede reprogramar después de
  firmar y el sello guarda lo que valía al firmar.
- **El verificador no coteja `abierta_en` ni el borrador vivo.** `borrador_abierta_en` se vacía al
  firmar (`fn_tocar_borrador` de T-012), así que después no hay nada contra qué cotejarlo. B y C son
  comprobaciones de alta, no de verificación.
- **Cotejar el cuerpo firmado con el borrador.** Ningún punto aprobado lo pide, y el autor escribe
  lo que quiere en su propio borrador: no protege nada.
- **Las firmas de `postgres` y `service_role`** (P1). Quedan como el paso 0. El importador decidirá
  su propia regla cuando exista.
- **La holgura de `fn_alertar_nota_sin_firmar`**, que se da por satisfecha con cualquier versión con
  ese `cita_id`, y atar `notas_clinicas.cita_id` a su cita al escribir la cabecera. Siguen como
  hallazgo sin ticket en `docs/state.md`. Por P3, T-036 exige la cita de la nota al firmar, no al
  escribir la cabecera.
- **Código de aplicación.** `firmarNota` de T-012 ya toma `abiertaEn`, la ventana, el margen y la
  cita de la base, y ya traduce el 23514. T-036 no toca `app/` ni `lib/`.
