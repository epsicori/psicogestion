# MiniMax · lee `minimax/LEEME.md` antes de nada

Tu punto de entrada **no es este fichero**. Es **`minimax/LEEME.md`**. Ábrelo ahora, entero,
y sigue desde ahí. Este de aquí solo existe para redirigirte y para que, aunque no leas
nada más, no rompas nada.

Después de `minimax/LEEME.md` vienen `minimax/proyecto.md`, `minimax/guion.md` y **una sola
entrega** — la que se te haya asignado, con su corte en `minimax/cortes/` y su ticket en
`tickets/`. Nada más.

## Lo mínimo, por si no lees nada más

Trabajas en **Psicogestión**, una aplicación de gestión clínica española. Tú llevas **la
interfaz**: las primitivas accesibles de `components/ui/`, el armazón, las pantallas, el
andamiaje de i18n y el flujo de CI. Hay otros dos carriles trabajando a la vez sobre este
mismo repositorio, y **el reparto es por fichero**.

**No escribas en**: `supabase/`, `docs/`, `lib/supabase/`, `lib/identidad/`, `lib/fechas/`,
`lib/agenda/`, `scripts/`, `app/prototipo/`, `diseño/`, `tickets/`, `kimi/`, `PLAN.md`,
`CLAUDE.md`, `AGENTS.md`, `CARRILES.md`, ni en `minimax/alcance.json` o
`minimax/verificar.mjs`. Ahí hay trabajo de otros en curso y un cambio tuyo lo rompe.

**Sí lees `docs/interfaz.md`.** Es la especificación de tus pantallas y es la única
excepción de lectura que tiene tu carril: sin ella inventarías. Leer sí, escribir jamás.

**No inventes.** Ni APIs, ni columnas, ni tipos, ni funciones de librería: se verifica
abriendo el fichero antes de afirmar. Si no lo has leído, no existe.

**Prohibido instalar shadcn/ui, Radix o Base UI.** Es el ADR-040, no una preferencia. Si
una tarea parece pedirlo, es que la has leído mal: las primitivas se escriben a mano, y ese
es justo el trabajo que se te ha encargado.

**Si necesitas salirte de la entrega, párate.** Lo escribes en
`minimax/hallazgos/T-0XX.md` y sigues con el resto. No lo arregles «solo un momento».

**Antes de dar nada por terminado:**

```
node minimax/verificar.mjs T-007a
```

Falla si te has salido del alcance o has colado una dependencia. No es un consejo.

## Sobre `AGENTS.md`

El `AGENTS.md` de la raíz lo escribe la herramienta de Next.js y **no va dirigido a ti**,
salvo por una cosa que sí te vale, y a ti más que a nadie: **esta versión de Next.js rompe
cosas respecto a lo que traes aprendido**. Tú escribes código de framework todo el rato
—Server Components, Suspense, `cacheComponents`—, así que lee la guía en
`node_modules/next/dist/docs/` **antes**, no después de que falle el build.

## Si te rechazan `git` o `npm`

Casi seguro que **tu raíz de trabajo es `minimax/` en vez de la del proyecto**. Comprueba
con `pwd`: tiene que ser la raíz del proyecto —o la copia aparte que te hayan dado—, **no**
la carpeta `minimax/`. Si termina en `minimax`, no lo arregles con rutas `../` — cierra la
sesión y arranca de nuevo desde la carpeta del proyecto. Es el paso 0 del guion.
