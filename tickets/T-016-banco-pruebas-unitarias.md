---
id: T-016
titulo: Banco de pruebas unitarias — Vitest, jsdom y teclado
modelo: sonnet
fase: 0
prioridad: alta
depende_de: []
estado: hecho
---

# Contexto

**No hay corredor de pruebas en el proyecto.** `package.json` no tiene ni `test` ni
ninguna dependencia de pruebas, y sin embargo dos tickets ya escritos dan por hecho que
existe: T-007 exige «**prueba de teclado por primitiva, automatizada**. Es criterio de
aceptación, no una buena intención», y T-009 exige que el validador de contraste traiga
«su prueba» con casos conocidos. Los dos se estrellarían contra el mismo agujero.

Este ticket abre el agujero y lo tapa **antes**, no dentro de ellos. Es infraestructura
pura: **no toca la base de datos, ni RLS, ni ninguna pantalla**. No hay dato clínico ni
económico a la vista, así que no necesita revisión con Opus.

Referencias: ADR **040** (las primitivas son nuestras, luego su accesibilidad se
comprueba), ADR **041** (verificado en el pipeline). No hay sección de `interfaz.md` que
aplique: este ticket no dibuja nada.

## Tareas

- [ ] Instalar como **dependencias de desarrollo**, y solo estas: `vitest`,
      `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`,
      `@testing-library/user-event`, `@testing-library/jest-dom` y `vite-tsconfig-paths`.
      Versiones **ancladas** (sin `^`) en `package.json`. Ninguna dependencia de
      producción nueva.
- [ ] `vitest.config.ts` en la raíz con:
      - entorno `jsdom` y `globals: true`;
      - `setupFiles` apuntando a `vitest.setup.ts`, donde entra `@testing-library/jest-dom`
        y un `afterEach(cleanup)`;
      - `include` restringido a `**/*.test.ts` y `**/*.test.tsx`;
      - **`exclude` con las mismas exclusiones que `eslint.config.mjs`**: `.next/**`,
        `app/prototipo/**`, `diseño/**`, `.claude/**`, `supabase/.temp/**`,
        `supabase/.branches/**`, `node_modules/**`. Si esto se olvida, el corredor audita
        los worktrees de la fábrica y la maqueta de v0, igual que le pasó a `lint`.
      - resolución de `@/…` vía `vite-tsconfig-paths`, no rutas relativas a mano.
- [ ] Guiones en `package.json`: `test` (una pasada, no interactivo),
      `test:watch` y `test:cobertura`. **`test` no puede quedarse colgado esperando
      entrada**: en CI y en la fábrica se ejecuta sin terminal.
- [ ] **Convención de ubicación, escrita y única**: el fichero de prueba vive **junto al
      módulo** que prueba (`app/login/esquemas.ts` → `app/login/esquemas.test.ts`). Nada de una
      carpeta `__tests__` paralela. Déjala escrita en **dos** sitios, y ninguno es
      `docs/`: un comentario en la cabecera de `vitest.config.ts`, donde la lee quien
      configure, y una línea en tu informe bajo **§Para `docs/state.md`**, que el
      arquitecto transcribe a la memoria del proyecto.
- [ ] **Una prueba real que ya aporte**, no un `expect(true)`: los **dos** esquemas Zod que
      hoy existen, con sus casos límite —campo obligatorio vacío, tipo equivocado, recorte
      de espacios, longitud máxima—. Están en `app/login/esquemas.ts`
      (`esquemaInicioSesion`) y en `app/(app)/pacientes/esquemas.ts`
      (`esquemaNuevoPaciente`). **Ábrelos antes**: no inventes campos ni mensajes.
      - Las pruebas van **junto a ellos**, en `app/…/esquemas.test.ts`. Es la única
        excepción a la zona prohibida de `app/` en todo el carril, y existe porque la
        convención de «el fichero de prueba vive junto al módulo» manda sobre ella.
      - Un `.test.ts` dentro de `app/` **no crea ninguna ruta**: Next enruta por
        `page`, `layout` y `route`, no por cualquier fichero. Compruébalo con
        `npm run build`, que es criterio.
      - **No modifiques `esquemas.ts` ni ningún otro fichero de `app/`.** Solo añades
        los dos ficheros de prueba.
- [ ] **Una prueba de teclado de ejemplo**, sobre un componente ya existente de
      `components/ui/`, que sirva de **plantilla** para las seis primitivas de T-007:
      tabulación, `Escape`, foco devuelto al disparador. Elige el componente leyendo qué
      hay; si ninguno tiene comportamiento todavía, monta la plantilla sobre un `<dialog>`
      mínimo **dentro del propio fichero de prueba** y deja el comentario que explique que
      T-007 la reapunta a la primitiva real.
- [ ] `eslint.config.mjs`: que los ficheros de prueba **no** disparen falsos positivos, sin
      apagar reglas para el resto del proyecto.
- [ ] La cobertura **se mide y no se exige**. Nada de umbral mínimo en este ticket: un
      umbral puesto sobre un banco vacío solo enseña a escribir pruebas que no comprueban.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm test` termina solo, en verde, y su salida nombra al menos dos
      ficheros de prueba.
- [ ] **Automático** — `npm test` **no** entra en modo interactivo: se ejecuta en una
      consola sin TTY y devuelve código de salida 0.
- [ ] **Automático** — romper a propósito un `min(1)` de `esquemaNuevoPaciente` hace que
      `npm test` devuelva código distinto de 0. Se demuestra rompiéndolo, viendo el rojo y
      **revirtiéndolo**. Es la **única** vez que este ticket toca un fichero de `app/`, y
      el cambio no sobrevive: cierra con `git status`, que tiene que salir sin ese
      fichero. Pega las tres salidas —rojo, revertido, `git status`—.
- [ ] **Automático** — la prueba de teclado falla si se le quita la devolución del foco al
      cerrar. Se demuestra igual: romper, ver rojo, revertir.
- [ ] **Automático** — `npm run test:cobertura` produce informe sin fallar por umbral.
- [ ] **Automático** — `npm test` **no** recorre `app/prototipo/`, `diseño/` ni `.claude/`:
      compruébalo con la lista de ficheros que imprime el corredor.
- [ ] **Automático** — `npm run lint && npm run build` siguen limpios.

## Guion de comprobación manual

1. `npm test` — verde, y termina sin pedir nada.
2. `npm run test:watch` — arranca, se sale con `q`.
3. Romper un `min(1)` de `app/(app)/pacientes/esquemas.ts`, `npm test` — rojo. Revertir y
   comprobar con `git status` que no queda rastro.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.**
- **Esto no es Vitest sobre Vite a secas**: el proyecto es Next.js 16 con Turbopack. No
  intentes reutilizar la configuración del bundler de Next ni instalar un plugin de Next
  para Vitest. Vitest corre aparte y solo tiene que resolver TypeScript y los alias.
- **No toques `supabase/`, `docs/architecture.md`, `docs/decisions.md`, `app/prototipo/`
  ni ninguna pantalla.** Este ticket no cambia una sola línea de producto.
- No añadas Jest, ni Playwright, ni Cypress. El navegador de verdad lo decide **T-009**,
  que es quien elige la herramienta de accesibilidad y la ancla de versión.
- Nada de configuración global que apague `strict` de TypeScript en las pruebas.
