# Kimi · lee `kimi/LEEME.md` antes de nada

Tu punto de entrada **no es este fichero**. Es **`kimi/LEEME.md`**. Ábrelo ahora, entero,
y sigue desde ahí. Este de aquí solo existe para redirigirte y para que, aunque no leas
nada más, no rompas nada.

Después de `kimi/LEEME.md` vienen `kimi/proyecto.md`, `kimi/guion.md` y **un solo ticket**
de `tickets/` — el que se te haya asignado. Nada más: no abras `docs/`, ni `CLAUDE.md`, ni
`PLAN.md`, ni los otros tickets.

## Lo mínimo, por si no lees nada más

Trabajas en **Psicogestión**, una aplicación de gestión clínica española. Se te han cortado
cinco tickets —**T-016 a T-020**— de código puro: funciones, utilidades y herramientas. Sin
base de datos, sin pantallas, sin un solo dato de paciente.

**No escribas en**: `supabase/`, `docs/`, `app/`, `diseño/`, `tickets/`, `PLAN.md`,
`CLAUDE.md`, `AGENTS.md`, `KIMI.md`, ni en `kimi/alcance.json` o `kimi/verificar.mjs`.
Hay trabajo de otros en curso ahí y un cambio tuyo lo rompe.

**No inventes.** Ni APIs, ni columnas, ni tipos, ni funciones de librería: se verifica
abriendo el fichero antes de afirmar. Si no lo has leído, no existe.

**Si necesitas salirte del ticket, párate.** Lo escribes en `kimi/hallazgos/T-0XX.md` y
sigues con el resto. No lo arregles «solo un momento».

**Antes de dar nada por terminado:**

```
node kimi/verificar.mjs T-0XX
```

Falla si te has salido del alcance o has colado una dependencia. No es un consejo.

## Sobre `AGENTS.md`

El `AGENTS.md` de la raíz lo escribe la herramienta de Next.js y **no va dirigido a ti**,
salvo por una cosa que sí te vale: esta versión de Next.js rompe cosas respecto a lo que
traes aprendido, así que si acabas escribiendo código de framework —y ninguno de tus cinco
tickets debería—, lee antes la guía en `node_modules/next/dist/docs/`.

## Si te rechazan `git` o `npm`

Casi seguro que **tu raíz de trabajo es `kimi/` en vez de la del proyecto**. Comprueba con
`pwd`: tiene que terminar en `Psicogestion`, no en `kimi`. Si termina en `kimi`, no lo
arregles con rutas `../` — cierra la sesión y arranca de nuevo desde la carpeta del
proyecto. Es el paso 0 del guion.
