# MiniMax · empieza aquí y no leas nada más todavía

Trabajas en **Psicogestión**, una aplicación de gestión clínica para consultas de
psicología en España. Tu carril es **la interfaz**: las piezas de `components/ui/`, el
armazón de navegación, las pantallas de `app/`, el andamiaje de i18n y el flujo de CI.

Hay **otros dos carriles trabajando a la vez** sobre este mismo repositorio: uno lleva la
base de datos y otro las funciones puras de `lib/`. El reparto es por fichero y está
cerrado. Nada de lo que se te pide exige tocar el territorio de nadie.

## Lo único que tienes que leer, en este orden

1. **Este fichero**, entero.
2. **`minimax/proyecto.md`** — el contexto mínimo: stack, comandos, convenciones y las
   reglas de interfaz que ya están decididas.
3. **`minimax/guion.md`** — los pasos, en orden, sin saltarte ninguno.
4. **Tu entrega**: el corte en `minimax/cortes/`, y el ticket que lo origina en `tickets/`.
5. **`docs/interfaz.md`** — solo cuando tu entrega lo cite, y solo las secciones que cite.

**Nada más.** No abras `CLAUDE.md`, ni `PLAN.md`, ni `CARRILES.md`, ni los tickets que no
son tuyos, ni el carril `kimi/`.

## La excepción de lectura que tu carril sí tiene

`docs/interfaz.md` **se lee**. Es la especificación de las pantallas y contiene lo que no
está en ningún otro sitio: el vocabulario de componentes, la lista de comprobación de cada
primitiva, los anchos, y **los trece sitios donde el prototipo enseña de más**, ya
resueltos. Un ticket de interfaz sin ella es un ticket inventado.

También puedes leer `docs/architecture.md` §Roles cuando tu entrega lo cite, y las entradas
de `docs/decisions.md` de los ADR que tu entrega nombre por número.

**Leer sí. Escribir en `docs/`, jamás y en ningún caso.** Esa memoria la mantiene el
arquitecto. Lo que quieras que quede escrito allí va en la sección **§Para `docs/state.md`**
de tu informe, redactado para pegarse tal cual.

## Las seis reglas

1. **Nunca inventes.** Ni APIs, ni columnas, ni tipos, ni funciones de librería. Antes de
   afirmar que algo existe, **abre el fichero y míralo**. Si no lo has leído, no existe.
   Con Next.js 16 esto no es retórica: lee `node_modules/next/dist/docs/`.
2. **El corte es el contrato.** Nada fuera de su alcance, por tentador que sea. El corte
   dice qué entra en **esta** entrega; el ticket dice de dónde viene y qué entrará en las
   siguientes. Lo que está en el ticket y no en tu corte, **no lo hagas**.
3. **Nada está hecho sin evidencia.** Cada criterio se cierra pegando la **salida real**
   del comando. Un criterio que dice «funciona» y no trae salida, no está cerrado.
4. **Si necesitas salirte, párate.** No lo hagas «solo un momento». Lo escribes en
   `minimax/hallazgos/T-0XX.md` y **sigues con el resto de la entrega**.
5. **Ninguna librería de componentes.** Ni shadcn/ui, ni Radix, ni Base UI, ni Headless UI,
   ni MUI. Es el **ADR-040** y es lo que da sentido a tu carril: las primitivas accesibles
   las escribimos nosotros, una sola vez, en `components/ui/`.
6. **No integres nada.** No hagas `merge`, ni `push` a `main`, ni cierres el ticket. Tu
   trabajo acaba en una rama con su informe. Lo revisa una persona.

## Fuera de límites — no escribir

| Ruta | Por qué |
|---|---|
| `supabase/`, `lib/supabase/` | Migraciones, RLS y tipos generados. Los lleva otro carril y hay trabajo en curso. Los tipos **se generan**, no se editan. |
| `lib/identidad/`, `lib/fechas/`, `lib/agenda/` | Funciones puras del tercer carril. Cuando existan, las **usas**; nunca las escribes ni las corriges. |
| `scripts/` | Guiones de base de datos y herramientas de otros carriles. |
| `docs/` | Memoria del proyecto y decisiones cerradas. **Se lee** lo que tu entrega cite; se escribe nunca. |
| `app/prototipo/`, `diseño/` | Maqueta visual **congelada**. Es la referencia contra la que se compara: tocarla es borrar la referencia. Está exenta de ESLint a propósito; no la «arregles». |
| `tickets/`, `PLAN.md`, `CLAUDE.md`, `AGENTS.md`, `CARRILES.md`, `KIMI.md` | El contrato. No se edita el contrato desde dentro. |
| `kimi/` | El pack de otro carril. |
| `.claude/`, `minimax/verificar.mjs`, `minimax/alcance.json`, `minimax/cortes/` | Herramienta y guardarraíl. Cambiarlos es hacer trampa al examen. |

Esto **no** es una recomendación: `node minimax/verificar.mjs T-0XX` lo comprueba y **falla**
si has tocado algo de esa lista. Ejecútalo antes de dar nada por terminado.

## Lo que sí escribes

`components/ui/`, `components/armazon/`, `app/` —salvo `app/prototipo/`—, `app/globals.css`,
`next.config.ts`, `lib/i18n/`, `lib/contraste/`, `.github/workflows/`. Y siempre **dentro
del alcance de tu entrega**, que es más estrecho: lo fija `minimax/alcance.json`.

## El orden de las entregas

Al día a **06-09-2026**. Lo tachado ya está entregado e integrado en `main`: no se vuelve
a hacer, se usa.

```
T-007·A  seis primitivas accesibles                    ENTREGADA e integrada
T-007·B  piezas de pintura y estados                   ENTREGADA e integrada
T-009·A  andamiaje de i18n y validador de contraste    ENTREGADA e integrada
T-007·C  cacheComponents, formularios y los 4 módulos  ← empieza aquí
T-007·D  armazón con datos reales                      (necesita C; T-002 ya está en main)
T-009·B  flujo de CI y verificador de accesibilidad    (bloqueada: T-003 aún no está en main)
T-006·b  acceso y pantallas de invitación, MFA y PIN   (bloqueada: T-006a aún no está en main)
T-013    ficha del paciente                            (bloqueada: espera a T-007·D y T-006)
```

**A iba primero y no se discutía**: B, C y D pintan con las primitivas que A escribe, y
T-012, T-013 y T-014 —de otros carriles y fases— esperan a lo mismo. Ya está hecho, así
que las primitivas de `components/ui/` **existen y se usan**; escribir una segunda versión
de algo que ya está ahí es el error que este orden existe para evitar.

**Las tres bloqueadas lo están por `main`, no por ti.** T-009·B necesita `npm run test:rls`
(T-003) y T-006·b necesita `lib/cuentas/` y el `[auth.mfa.totp]` de `supabase/config.toml`
(T-006a): las dos cosas están escritas y verificadas en otro carril, pero todavía en su
rama. Si te asignan una de ellas y `main` no las trae, **para y avisa**: es un error de
reparto, no algo que se resuelva escribiendo el hueco a mano.

Una entrega cada vez. Una rama cada vez. **No abras dos.**
