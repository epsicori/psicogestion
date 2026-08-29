# Tres carriles

Tres modelos trabajando a la vez sobre el mismo repositorio. Esto es el mapa: quién hace
qué, por qué le toca a ese, y **qué regla impide que se pisen**.

Lo lee quien coordina —tú—, no los agentes. Cada carril tiene su propio punto de entrada y
**ninguno lee este fichero**.

| Carril | Punto de entrada del agente | Territorio |
|---|---|---|
| **Claude** · la fábrica | `CLAUDE.md` + `fabrica/ORDEN.md` | La base de datos y todo lo caro |
| **MiniMax** · la interfaz | `MINIMAX.md` → `minimax/LEEME.md` | `components/`, `app/`, i18n, CI |
| **Kimi** · funciones puras | `KIMI.md` → `kimi/LEEME.md` | `lib/identidad`, `lib/fechas`, `lib/agenda` |

---

## Paso 0 · `main` está atrasado, y hasta arreglarlo no arranca nadie

Ahora mismo el árbol de trabajo tiene sin comitear **las decisiones que dos de los tres
carriles necesitan citar**:

```
 M docs/decisions.md      ← ADR-045 a ADR-053
 M docs/interfaz.md       ← cuatro módulos (ADR-050), choque 13
 M docs/architecture.md   ← seccion de clasificación regulatoria
 M docs/state.md · PLAN.md · CLAUDE.md
?? tickets/T-010 … T-015  ← fase 1 entera, sin rastrear
?? supabase/migrations/20260822160000_rls_funciones_y_politicas.sql
?? scripts/t002-rls.sql
```

Un agente que ramifique de `main` **hoy** lee un `docs/interfaz.md` con **siete** módulos y
construye la navegación vieja. No es un riesgo teórico: es lo primero que haría MiniMax en
T-007.

**Antes de repartir nada: comitea y empuja.** Después, cada carril ramifica de `main` y ya
ve lo mismo que tú.

## La regla que sostiene el reparto: un territorio, un dueño

No se reparte por dificultad ni por precio. Se reparte por **fichero**, y de ahí sale sola
la asignación:

- **La base de datos tiene exactamente un dueño.** Dos carriles escribiendo migraciones se
  ordenan mal entre sí, y el `db reset` del segundo aplica el esquema del primero a medias.
  Todo lo que toca `supabase/` es del carril Claude, sin excepción y aunque el ticket sea
  `sonnet`.
- **La interfaz tiene exactamente un dueño**, por el ADR-040: sin librería de componentes,
  las primitivas las escribimos nosotros **una vez**. Dos carriles escribiendo diálogos es
  precisamente el fallo que el ADR quería evitar.
- **Las funciones puras no tocan a nadie**, y por eso el carril de Kimi ya existía antes de
  este reparto y no cambia.

### Territorio de escritura

| Ruta | Dueño |
|---|---|
| `supabase/**`, `scripts/*.sql`, `lib/supabase/**` | **Claude** |
| `components/**`, `app/**`, `next.config.ts`, `proxy.ts`, `lib/i18n/**`, `lib/contraste/**`, `.github/**` | **MiniMax** |
| `lib/identidad/**`, `lib/fechas/**`, `lib/agenda/**`, `scripts/lint-migraciones.ts` | **Kimi** |
| `docs/**`, `PLAN.md`, `CLAUDE.md`, `tickets/**`, `CARRILES.md`, los `alcance.json` | **Nadie automático.** Tú y el arquitecto |
| `package.json`, `package-lock.json` | Compartido, con reglas — abajo |

`docs/` se **lee** en el carril de MiniMax —`interfaz.md` es la especificación de sus
pantallas— y **no se escribe en ninguno**. El material para la memoria sube por la sección
**§Para `docs/state.md`** del informe, y lo transcribe el arquitecto. Es lo que ya se
decidió el 27-08 para Kimi y vale igual para los tres.

### `package.json` es el único fichero de verdad compartido

Tres reglas, y con ellas un conflicto aquí no cuesta más de un minuto:

1. **Solo se añaden las dependencias que el ticket nombra**, y ancladas de versión. El
   verificador de cada carril lo comprueba y falla.
2. **Nadie sube de versión nada que ya estuviera.** Actualizar el stack no es de ningún
   ticket: es un hallazgo.
3. **Un conflicto en `package-lock.json` no se resuelve a mano**: se toma el de `main`, se
   reaplica el `package.json` y se corre `npm install`. Editar un lock a mano produce
   árboles de dependencias que no existen.

---

## Carril Claude · la fábrica

**Criterio**: equivocarse obligaría a migrar datos o podría exponer información. Esquema,
RLS, auditoría, cadena de huellas, autenticación, siembra. Y **la revisión de los otros dos
carriles**, que es donde este carril rinde más por hora.

| Orden | Ticket | Puede empezar |
|---|---|---|
| 1 | **T-002 · enmienda ADR-051** (multi-centro), y después la revisión con Opus | **ahora** |
| 2 | **T-004 · Auditoría por triggers** | **ahora** — depende solo de T-001 |
| 3 | T-003 · Banco de pruebas de RLS | tras T-002 |
| 4 | T-005 · Cadena de huellas — **leer ADR-046 antes de la primera línea** | tras T-004 |
| 5 | T-006 · Autenticación completa | tras T-002 |
| 6 | T-008 · Seed determinista de los tres roles | tras T-002, T-004 y T-005 |

**T-006 y T-008 son `sonnet` en `PLAN.md` y aun así caen aquí.** No por dificultad: por
territorio. Los dos escriben en `supabase/`, y `supabase/` tiene un solo dueño. Siguen
saltándose la etapa de diseño; lo único que cambia es quién los ejecuta.

El detalle está en **`fabrica/ORDEN.md`**.

## Carril MiniMax · la interfaz

**Criterio**: equivocarse es reescribir un componente. Y es el carril que **desbloquea a
los demás**: T-012, T-013 y T-014 esperan a que existan las primitivas.

| Orden | Entrega | Puede empezar |
|---|---|---|
| 1 | **T-007·A — seis primitivas accesibles** | **ahora** |
| 2 | T-007·B — piezas de pintura y estados de carga, vacío y error | tras A |
| 3 | T-007·C — `cacheComponents`, `react-hook-form` y los cuatro módulos | ahora, en paralelo con B |
| 4 | T-007·D — armazón con datos reales (selector de centro, rótulo de rol) | tras T-002 |
| 5 | T-009·A — andamiaje de i18n y validador de contraste | ahora |
| 6 | T-009·B — flujo de CI y verificador de accesibilidad | tras T-003 |
| 7 | T-013 · Ficha del paciente | tras T-007·D y T-006 |

**T-007 se parte en cuatro entregas y el ticket no cambia.** El corte está en
`minimax/cortes/T-007.md`, y existe por dos motivos: el grueso de T-007 no toca la base de
datos y por tanto no tiene por qué esperar a T-002, y una primitiva mal escrita debe costar
una rama, no el armazón entero. **T-007 se cierra cuando entran las cuatro**, no antes.

## Carril Kimi · funciones puras

**No cambia.** Ya estaba abierto y en marcha desde el 27-08, y el reparto no lo toca: su
territorio —`lib/` por subcarpetas— no lo quiere nadie más.

| Orden | Ticket | Estado |
|---|---|---|
| 1 | T-017 · Identificadores y contacto españoles | **entregado, esperando integración** |
| 2 | T-018 · Fechas, zona horaria y semana | siguiente |
| 3 | T-019 · Linter de migraciones | libre |
| 4 | T-020 · Estados de la cita, puros | tras T-018 |

**T-017 ya está hecho.** Vive en el *worktree* `../Psicogestion-kimi`, rama
`T-017-identificadores-espanoles`, con su informe y sus hallazgos: siete módulos nuevos en
`lib/identidad/` —NIF, IBAN, teléfono, código postal, colegiado, esquemas— con sus pruebas.
El verificador de su carril da alcance limpio **salvo un fichero**: `eslint.config.mjs`, y
no es una salida de carril —viene del commit `3797cb0`, que es el cierre de **T-016**
(ignorar `coverage/`) arrastrado en la misma rama—. Es correcto y entra; solo conviene
saberlo al leer el diff, para no buscarle a T-017 un motivo que no tiene.

**Es lo primero que se integra**, en cuanto `main` esté al día: es la rama más antigua y la
que menos choca con nada.

Lo único que se le añade al carril es un aviso en `kimi/LEEME.md`: ahora hay dos carriles
más moviendo `main`, así que **rebasar sobre `main` y volver a `npm install`** deja de ser
excepcional.

---

## Integración

1. **Una rama por entrega**, `T-0XX-<slug>` —o `T-007a-primitivas` para un corte—. Nadie
   abre dos a la vez.
2. **Ningún carril integra.** Ni `merge`, ni `push` a `main`, ni cerrar el ticket. La rama
   se deja lista con su informe y para. **Integras tú.**
3. **Un carril rebasa sobre `main`, nunca sobre la rama de otro carril.** Si necesita algo
   que otro carril aún no ha entregado, eso no es un rebase: es que la entrega estaba mal
   ordenada.
4. **Orden de integración cuando hay varias listas**: primero Claude —mueve el esquema que
   los demás leen—, después Kimi —`lib/` no choca con nada—, después MiniMax. Solo importa
   por `package-lock.json`.
5. **Revisión con Opus** en todo lo de Claude y en cualquier rama que toque RLS, dinero o
   datos clínicos. Una entrega de interfaz pura cierra con verificador, `lint` y `build`.

## Las cuatro maneras conocidas de romper esto

1. **Empezar sin el paso 0.** Dos carriles construyen contra decisiones derogadas.
2. **Dejar que un carril «solo un momento» toque el territorio de otro.** Para eso está el
   verificador de cada pack, y por eso falla en vez de avisar.
3. **Acumular ramas sin integrar.** Tres carriles produciendo y nadie integrando convierte
   el rebase en el trabajo principal. Se integra en cuanto una rama está verde y revisada.
4. **Pedirle a un carril una decisión de dominio.** Lo que no esté cerrado en un ADR **no
   lo decide un agente**: se anota como hallazgo y se sigue. Vale para los tres.

## Deuda conocida

`kimi/verificar.mjs` y `minimax/verificar.mjs` son **gemelos**: mismo comportamiento, misma
salida, y el de MiniMax deduce el carril del nombre de su propia carpeta. Se duplicó a
propósito —cada pack se sostiene solo y un carril no puede romperle el guardarraíl a otro—,
pero **un arreglo hay que hacerlo dos veces**. Cuando el carril de Kimi quede libre, el
suyo se sustituye por el genérico y quedan dos ficheros idénticos, o uno compartido.
