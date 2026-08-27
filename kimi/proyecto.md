# Contexto mínimo

Lo justo para que tus cinco tickets tengan sentido. **No es la documentación del
proyecto**; es el recorte que te toca. Si algo no está aquí, es que tu ticket no lo
necesita.

## Qué es

Gestión clínica y facturación para consultas de psicología en España. Historia clínica,
agenda, facturación. Los datos que maneja son **datos de salud**, lo que explica por qué
el proyecto es tan estricto con lo que se puede modificar y lo que no.

Tú trabajas en la capa de abajo: **funciones puras, utilidades y herramientas**. Ninguno de
tus cinco tickets ve un dato de un paciente.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript estricto · Tailwind 4 ·
Supabase (Postgres 17) · Zod 4 · react-hook-form · date-fns 4.

**Aviso sobre Next.js**: esta versión rompe cosas respecto a lo que traes aprendido. Si un
ticket te lleva a escribir código de framework —y ninguno de los cinco debería—, lee antes
la guía en `node_modules/next/dist/docs/`. **No escribas de memoria.**

## Comandos

| Qué | Comando |
|---|---|
| Instalar | `npm install` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Pruebas | `npm test` *(no existe hasta que T-016 lo cree)* |
| Verificar tu alcance | `node kimi/verificar.mjs T-0XX` |

**No necesitas Docker ni la base de datos.** Ninguno de tus tickets la levanta. Si te ves
escribiendo `npx supabase`, te has salido del carril.

## Convenciones que sí te afectan

- **Castellano** en ficheros y símbolos que nombran conceptos del dominio
  (`validarNif`, `limitesDeSemana`, `estados-cita.ts`); inglés en lo puramente técnico.
  Los comentarios, en castellano.
- **TypeScript estricto.** Nada de `any`, nada de `@ts-ignore`, nada de `!` para callar al
  compilador.
- **Funciones puras** donde el ticket lo pida: entrada, salida, y nada más. Sin `fetch`,
  sin `Date.now()`, sin `process.env`, sin Supabase. Los tickets lo comprueban con `grep`,
  así que no es una preferencia de estilo.
- **El fichero de prueba vive junto al módulo**: `lib/fechas/semana.ts` →
  `lib/fechas/semana.test.ts`. Nada de una carpeta `__tests__` aparte.
- **Dependencias**: solo las que tu ticket nombra por su nombre, **ancladas** (sin `^` ni
  `~`). Cualquier otra, el verificador la rechaza. Si crees que necesitas una más, es un
  hallazgo, no una decisión tuya.
- **Ninguna librería de componentes** (Radix, shadcn, Base UI, MUI…). Está prohibida por
  decisión de arquitectura, no por gusto.

## Dos reglas del proyecto que explican tus tickets

1. **Nada clínico ni económico se modifica ni se borra. Solo se añade.** Una corrección es
   siempre un registro nuevo, nunca un `UPDATE`. Esto es lo que **T-019** convierte en un
   comando.
2. **Las horas se calculan en servidor, en la zona horaria del centro.** Nunca con el reloj
   del navegador. Esto es lo que hace que **T-018** y **T-020** reciban `ahora` como
   parámetro en vez de leerlo dentro.

## Cómo está el repositorio hoy

- `lib/formularios.ts` — esquemas Zod compartidos. **Léelo** si tu ticket lo menciona.
- `lib/supabase/` — cliente y tipos generados. **No lo toques y no lo importes**: ninguno
  de tus tickets habla con la base de datos.
- `components/ui/` — primitivas de interfaz, todavía escasas.
- `app/(app)/`, `app/login/` — las dos pantallas que existen.
- `app/prototipo/` — maqueta visual congelada, excluida de lint. **No la abras.**
- `scripts/` — utilidades sueltas. Ahí va lo de T-019.
- `supabase/migrations/` — SQL. **Solo T-019 lo lee, y jamás lo escribe.**
