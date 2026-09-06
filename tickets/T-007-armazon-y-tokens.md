---
id: T-007
titulo: Armazón de navegación, tokens y primitivas accesibles de components/ui
modelo: sonnet
fase: 0
prioridad: alta
depende_de: [T-002]
estado: en_curso
notas: Cortes A (primitivas), B (piezas) y C (cacheComponents, formularios y los cuatro modulos) INTEGRADOS en main. Falta el corte D -armazon con datos reales-, en minimax/cortes/T-007.md.
---

# Contexto

El armazón y los tokens ya entraron a medias con la maqueta (`components/armazon/`,
`app/globals.css`). Este ticket lo cierra y, sobre todo, **paga la factura del ADR-040**:
sin librería de componentes, las piezas con comportamiento —diálogo, menú, pestañas,
desplegable, emergente, casilla— las escribimos nosotros, **una sola vez**, en
`components/ui/`, y cada una nace con su lista de comprobación cumplida.

Es el ticket que más creció, y se sabe por qué: los ADR **040** (todo a mano) y **044**
(todo desde 360 px) se decidieron el 22-08 contra la recomendación. Es trabajo de una vez.

Módulos del prototipo que implementa: el **armazón** entero (barra lateral, cabecera,
contenido) descrito en `docs/interfaz.md` §Armazón y §Vocabulario de componentes.
Choques que le tocan: **1** (el selector es de **centro**, no de organización; el nombre de
la organización es rótulo fijo) y el rótulo de rol, que sale de `perfiles.rol` y no de un
literal.

Referencias: ADR **025** (relación con el prototipo), **040** (primitivas a mano),
**041** (WCAG 2.2 AA; el verificador en el pipeline es T-009), **042** (tema claro, ningún
color literal), **043** (`cacheComponents`), **044** (360 px y 44 px de objetivo táctil).

## Tareas

- [ ] **Primitivas con comportamiento en `components/ui/`**: `dialogo`, `menu`, `pestanas`,
      `desplegable`, `emergente`, `casilla`. Cada una **compartida**, nunca dentro de la
      pantalla que la necesitó primero.
- [ ] Cada primitiva cumple la lista de `interfaz.md` §De dónde sale cada pieza: trampa de
      foco y **devolución del foco** al cerrar, `tabindex` móvil donde el patrón lo pida,
      `role` / `aria-expanded` / `aria-controls` correctos, cierre con **Escape** y con
      clic fuera, anuncio al lector de pantalla, **objetivo táctil de 44 px** y
      funcionamiento a **360 px**.
- [ ] **Prueba de teclado por primitiva**, automatizada. Es criterio de aceptación, no una
      buena intención.
- [ ] **Piezas de pintura** del vocabulario que aún no existen: tarjeta, métrica, píldora
      de estado (tres, no más), fila con avatar, barra de progreso, franja de color,
      encabezado de módulo, panel lateral, estado vacío. Son `div` con texto: sin
      comportamiento y sin dependencias.
- [ ] **Estados de carga, vacío y error** como parte del vocabulario — el prototipo solo
      dibuja el caso feliz (`interfaz.md` §Lo que el prototipo no cubre).
- [ ] **Selector de centro** en la barra lateral (choque 1), alimentado de `centros`
      reales. Si la instancia tiene un solo centro, **no se pinta**: control sin acción
      real detrás está prohibido.
- [ ] **`cacheComponents: true`** en la **raíz** de `next.config.ts` (no bajo
      `experimental`), más el saneamiento que destape: `<Suspense>` **por bloque de datos,
      no por página**, error boundary también por bloque, y **ningún dato de paciente,
      usuario o rol en `use cache`** — tampoco `use cache: private`.
- [ ] **`react-hook-form`** integrado con los esquemas Zod ya compartidos, saldando la
      deuda consciente que T-000 dejó anotada. `/login` y `/pacientes` se migran.
- [ ] **Ningún color literal en ningún componente**: siempre token (ADR-042). Y **ningún
      conmutador de tema**.
- [ ] Repasar el armazón contra `interfaz.md` §Armazón: lo que sigue sin datos detrás
      —búsqueda global, campana, «más opciones», banda de aviso— **no se dibuja todavía**.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm run lint` y `npm run build` limpios, y el build **sin avisos
      `blocking-prerender-*`**.
- [ ] **Automático** — prueba de teclado de cada primitiva: abrir, recorrer con Tab sin
      salirse, cerrar con Escape, y **el foco vuelve** al disparador. Seis primitivas, seis
      pruebas.
- [ ] **Automático** — `grep` de colores literales (`#`, `rgb(`, `oklch(`) en
      `components/` y `app/` **fuera de `app/globals.css` y de `app/prototipo/`** devuelve
      cero resultados.
- [ ] **Automático** — no existe ningún `use cache` en un módulo que lea datos de paciente,
      usuario o rol; `use cache: private` no aparece en el repositorio.
- [ ] **Automático** — ninguna página envuelve todo su contenido en un solo `<Suspense>`.
- [ ] **Manual** — `/pacientes` y `/login` al lado de `/prototipo`: mismo vocabulario
      visual, sin controles de adorno (nada sin dato ni acción real detrás).
- [ ] **Manual** — la misma ruta con cada rol que la pueda abrir enseña exactamente lo que
      le concede la matriz de `architecture.md` §Roles, ni un campo más. En particular el
      rótulo de rol sale de `perfiles.rol`.
- [ ] **Manual** — a **360 px**, el armazón, el cajón, las seis primitivas y las dos
      pantallas funcionan **enteras**. Ninguna pantalla avisa de que «se ve mejor en
      ordenador»; si aparece, está sin terminar (ADR-044).
- [ ] **Manual** — con `prefers-reduced-motion` activo, ninguna primitiva anima.
- [ ] **Automático** — `disponible: true` en `components/armazon/modulos.ts` **solo** para
      los módulos realmente integrados; el resto sigue apagado y marcado «pronto».
- [ ] **Automático** — `components/armazon/modulos.ts` tiene **cuatro** entradas —Agenda,
      Pacientes, Facturación, Ajustes— y ninguna llamada `Inicio`, `Clinica` ni `Usuarios`
      (ADR-050). `app/page.tsx` redirige a `/agenda`, no a `/pacientes`.

## Guion de comprobación manual

1. `npm run dev` y abre `/pacientes` en escritorio. Compara con `/prototipo` al lado.
2. Recorre la aplicación **solo con el teclado**: cajón, menú de usuario, formulario de
   alta, diálogo. El foco nunca desaparece ni se escapa detrás de una capa.
3. Reduce la ventana a **360 px** y repítelo entero, incluido el cajón.
4. Activa «reducir movimiento» en el sistema y comprueba que nada anima.
5. Entra con los tres roles y comprueba el rótulo de rol y el selector de centro.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.**
- **Prohibido instalar shadcn/ui, Radix o Base UI** (ADR-040). Si el ticket parece pedirlo,
  se para y se escala.
- **Prohibido escribir un diálogo, un menú, unas pestañas o un desplegable dentro de una
  pantalla.** Van en `components/ui/` o no van.
- Las primitivas nacen **responsivas y táctiles la primera vez**: escribirlas para
  escritorio y adaptarlas después cuesta el doble (ADR-044).
- El saludo, la fecha y **cualquier hora** se calculan en **servidor** y bajan como cadena.
  `new Date()` en cliente rompe la hidratación (`state.md` §Aprendizajes).
- `cacheComponents` **destapará** cosas que hoy bloquean el prerenderizado en silencio.
  Ese saneamiento **es parte del ticket**, no una sorpresa.
- El verificador de accesibilidad del pipeline es **T-009**. Aquí se cumple WCAG; allí se
  demuestra en cada build.
- `/prototipo` sigue exento de ESLint y público en `proxy.ts`. **No se edita para
  «arreglarlo»**: es la referencia contra la que se compara.
