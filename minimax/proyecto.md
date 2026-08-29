# Contexto mínimo

Lo justo para que tus entregas tengan sentido. **No es la documentación del proyecto**; es
el recorte que te toca. Si algo no está aquí ni en tu corte, es que tu entrega no lo
necesita — o es un hallazgo.

## Qué es

Gestión clínica y facturación para consultas de psicología en España. Historia clínica,
agenda, facturación. Los datos que maneja son **datos de salud**, y eso explica dos cosas
que te afectan directamente aunque tú no toques la base de datos:

1. **Hay tres roles y no ven lo mismo**: administrador, profesional sanitario y técnico
   administrativo. Una pantalla que enseña un campo de más es una fuga, no un detalle de
   diseño.
2. **El prototipo visual está dibujado sin roles.** Es una maqueta bonita que enseña de
   más en trece sitios concretos. Los trece están resueltos en `docs/interfaz.md` §Donde el
   prototipo choca con la arquitectura. **Si interfaz y arquitectura chocan, gana la
   arquitectura.**

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript estricto · Tailwind 4 ·
Supabase (Postgres 17) · Zod 4 · react-hook-form · TanStack Table · date-fns 4 ·
Vitest 4 + jsdom + Testing Library.

**Aviso sobre Next.js, y para ti no es un aviso menor**: esta versión rompe cosas respecto
a lo que traes aprendido, y tú escribes código de framework en todas tus entregas. Antes de
escribir un Server Component, un `<Suspense>`, un error boundary o cualquier cosa con
`use cache`, **lee la guía correspondiente en `node_modules/next/dist/docs/`**. No escribas
de memoria: la API que recuerdas puede haber cambiado de nombre o de sitio.

## Comandos

| Qué | Comando |
|---|---|
| Instalar | `npm install` |
| Desarrollo | `npm run dev` → http://localhost:3000 |
| Pruebas | `npm test` · `npm run test:watch` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Verificar tu alcance | `node minimax/verificar.mjs T-0XX` |

**`next build` ya no ejecuta lint**: son dos pasos, no uno. Los dos tienen que estar en
verde.

**No necesitas Docker ni la base de datos** en las entregas que puedes empezar hoy. Si te
ves escribiendo `npx supabase`, te has salido del carril: eso es de otro.

## Convenciones que sí te afectan

- **Server Components por defecto.** `"use client"` solo cuando haga falta estado o eventos
  del navegador. Una primitiva con comportamiento es cliente; una tarjeta es servidor.
- **Castellano** en ficheros y símbolos que nombran conceptos del dominio (`dialogo.tsx`,
  `esProfesionalAsignado`, `pestanas`); inglés en lo puramente técnico. Los comentarios, en
  castellano, y solo donde expliquen un *porqué*: no narres el código.
- **TypeScript estricto.** Nada de `any`, nada de `@ts-ignore`, nada de `!` para callar al
  compilador, nada de `eslint-disable` para que algo pase.
- **El fichero de prueba vive junto al módulo**: `components/ui/dialogo.tsx` →
  `components/ui/dialogo.test.tsx`. Nada de una carpeta `__tests__` aparte.
- **Dependencias**: solo las que tu entrega nombra, y **ancladas** (sin `^` ni `~`).
  Cualquier otra, el verificador la rechaza. Si crees que necesitas una más, es un
  hallazgo, no una decisión tuya.
- **Las horas se calculan en servidor** y bajan como cadena ya formateada. Un `new Date()`
  en cliente rompe la hidratación, y además la hora correcta es la de la zona del centro,
  no la del navegador de quien mira.
- **Identificadores UUID.** Jamás un nombre de paciente en una URL.

## Las reglas de interfaz que ya están decididas

No son preferencias de estilo. Son ADR cerrados, y varios se decidieron **contra la
recomendación técnica**, a sabiendas de lo que costaban. No los reabras.

**ADR-040 · Todo a mano.** Sin librería de componentes: ni shadcn/ui, ni Radix, ni Base UI,
ni Headless UI. Las piezas con comportamiento —diálogo, menú, pestañas, desplegable,
emergente, casilla— se escriben **una sola vez** en `components/ui/` y **nunca** dentro de
la pantalla que las necesitó primero. Repetir el patrón por pantalla lo multiplica por
siete y garantiza que seis salgan mal.

**ADR-041 · WCAG 2.2 AA, comprobado en cada build**, no declarado. Sin librería debajo, el
verificador es la única red: un fallo de teclado no lo caza nadie más.

**ADR-042 · Tema claro, y así se queda en v1.** **Ningún componente escribe un color
literal** —ni `#`, ni `rgb(`, ni `oklch(`—: siempre token, y los tokens viven en
`app/globals.css`. No se pinta conmutador de tema. Con esa regla, añadir el oscuro algún
día es añadir un bloque de tokens, no auditar la aplicación entera.

**ADR-044 · Todo funciona desde 360 px.** No hay mínimo por pantalla ni vista degradada. Si
una pantalla avisa de que «se ve mejor en ordenador», está sin terminar. **44 px de
objetivo táctil** en todo lo que se pulse. Las primitivas nacen **responsivas y táctiles la
primera vez**: escribirlas para escritorio y adaptarlas después cuesta el doble.

**ADR-047 · Nada parpadea.** Un estado que reclama atención **late**: ciclo de unos 2 s, un
solo elemento animado a la vez, y `prefers-reduced-motion` lo detiene del todo. El color
nunca es el único portador de información.

**Nada de controles de adorno.** Ni un botón, ni un icono, ni un selector sin un dato o una
acción real detrás. Si el prototipo lo dibuja y no hay nada que enseñar todavía, **no se
dibuja**. Esto incluye la búsqueda global, la campana, el «más opciones» y la banda de
aviso del armazón.

### Tipografía y color, en corto

- **Serif solo en titulares y cifras.** Nunca en cuerpo de texto ni en formularios.
- **Monoespaciada solo para horas** en listas de agenda.
- **El ámbar reclama atención, el rojo es error.** Ni ámbar para errores de formulario, ni
  rojo para «pendiente».
- **El malva es selección**, no un estado. Lo seleccionado va en `bg-secondary`.
- La píldora de estado tiene **tres** variantes: `success`, `info`, `warning`. Tres, no más.

El vocabulario completo —tarjeta, métrica, fila con avatar, barra de progreso, franja de
color, encabezado de módulo, panel lateral, estado vacío— está en `docs/interfaz.md`
§Vocabulario de componentes, con la forma de cada una. **Antes de inventar un componente,
comprueba que no sea uno de esos.**

## Cómo está el repositorio hoy

- `app/globals.css` — tokens de color y radios. **El único sitio con colores literales.**
- `app/layout.tsx` — fuentes (Geist + DM Serif Display).
- `components/armazon/` — barra lateral, cabecera y contenido. `modulos.ts` tiene todavía
  **siete** módulos; el ADR-050 los deja en **cuatro** (Agenda, Pacientes, Facturación,
  Ajustes) y eso lo arregla la entrega T-007·C, no tú por tu cuenta.
- `components/ui/` — hoy solo `button.tsx` y `field.tsx`. Está casi vacío a propósito: es
  lo que vienes a llenar.
- `components/ui/teclado.test.tsx` — **plantilla de prueba de teclado** que dejó T-016,
  con un diálogo mínimo montado dentro del propio test. Está escrita para que la
  reapuntes a la primitiva real. **Es tuya para sustituirla**, y hacerlo es parte de la
  entrega A.
- `app/login/` y `app/(app)/pacientes/` — las dos pantallas que existen, con sus esquemas
  Zod (`esquemas.ts`) y sus pruebas. Los formularios todavía **no** usan `react-hook-form`
  aunque esté instalado: es deuda consciente que salda la entrega C.
- `app/(app)/` es un grupo de rutas y **no añade segmento a la URL**: `/pacientes` sigue
  siendo `/pacientes`.
- `lib/formularios.ts` — esquemas Zod compartidos. **Léelo** antes de importar de él.
- `lib/supabase/` — cliente y tipos generados. Los **usas** para leer datos; no los
  escribes, y `tipos-bd.ts` se genera, no se edita.
- `app/prototipo/` — maqueta congelada, exenta de ESLint y pública. **Se mira, se compara,
  no se toca.**
- `proxy.ts` — rutas públicas y protección de sesión.

## Dos cosas que ya se estrellaron una vez

- **Una prueba en verde por el motivo equivocado no vale.** Pregúntate siempre si la prueba
  seguiría verde con el arreglo quitado. Si sí, no prueba nada.
- **`cacheComponents` destapa cosas que hoy bloquean el prerenderizado en silencio.** Ese
  saneamiento no es una sorpresa: es parte de la entrega que lo activa.
