@AGENTS.md

# Psicogestión

Gestión clínica y facturación para consultas sanitarias españolas (psicología).

Dos fuentes, dos destilados. **No abras las fuentes enteras**; lee los destilados:

| Fuente | Destilado | Manda sobre |
|---|---|---|
| `docs/documento-maestro.html` | `docs/architecture.md` | Modelo, invariantes, **quién ve qué** |
| Prototipo visual en `/prototipo` | `docs/interfaz.md` | Qué pantallas hay y qué muestran |

Lo cerrado está en `docs/decisions.md`. **Si arquitectura e interfaz chocan, gana la
arquitectura.**

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 ·
Supabase (Postgres 17 + Auth + Storage, local vía Docker) · Zod 4 · react-hook-form ·
TanStack Table · date-fns.

## Comandos

| Qué | Comando |
|---|---|
| Base de datos local | `npx supabase start` / `npx supabase stop` |
| Resetear y aplicar migraciones | `npx supabase db reset` |
| Servidor de desarrollo | `npm run dev` → http://localhost:3000 |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Sembrar datos | `npm run seed` *(desde T-008)* |
| Pruebas de RLS | `npm run test:rls` *(desde T-003)* |

## Convenciones

- **Server Components por defecto.** `"use client"` solo cuando haga falta estado o
  eventos del navegador. Los datos clínicos se renderizan en servidor.
- Mutaciones vía **Server Actions**, validadas con el **mismo esquema Zod** que usa el
  formulario en cliente.
- Nunca la clave de servicio de Supabase en el navegador. El cliente del navegador usa
  la clave anónima y depende de RLS.
- Identificadores **UUID**. Jamás un nombre de paciente en la URL.
- Ficheros y símbolos en castellano cuando nombran conceptos del dominio
  (`notas_clinicas`, `esProfesionalAsignado`); en inglés lo que es puramente técnico.
- **Interfaz**: antes de escribir una pantalla, `docs/interfaz.md` — el prototipo está
  dibujado sin roles, y allí están resueltos los sitios donde enseña de más. Nada de
  controles sin un dato o una acción real detrás.
- Migraciones en `supabase/migrations/`, siempre hacia delante y nunca destructivas en
  un solo paso.

## Constitución de agentes

1. **Nunca inventes.** APIs, columnas, tipos ni comportamientos. Se verifica leyendo el
   fichero antes de afirmar. **Next.js 16 rompe cosas respecto a lo que traes aprendido**:
   antes de escribir código de framework, lee la guía correspondiente en
   `node_modules/next/dist/docs/`.
2. **El ticket es el contrato.** Nada fuera de su alcance, por tentador que sea. Si
   aparece algo que hay que arreglar y no está en el ticket, se anota en `docs/state.md`
   y se sigue.
3. **Nada está «hecho» sin evidencia.** Cada criterio de aceptación se cierra con la
   salida real del comando o la comprobación que lo demuestra.
4. **Lee `docs/state.md` antes de tocar código** y deja la memoria actualizada al acabar.
5. **Contexto mínimo.** A un subagente se le pasa el id del ticket y punteros, nunca la
   conversación ni el historial de otros tickets.
6. **Nada clínico ni económico se modifica ni se borra. Solo se añade.**
   Toda corrección es una versión nueva encadenada por huella SHA-256 al registro
   anterior. Un `UPDATE` o `DELETE` sobre `notas_clinicas_versiones`, `facturas`,
   `auditoria` o `accesos_historia` **es un bug, no una optimización** — y la base de
   datos debe impedirlo, no solo la aplicación.

## Enrutado de modelos

- Ticket **`opus`**: equivocarse obligaría a migrar datos o podría exponer información.
  Esquema, RLS, auditoría, cadena de huellas, series de citas, facturación y Verifactu,
  cifrado, importador, acceso de emergencia. Pasa por la etapa de diseño.
- Ticket **`sonnet`**: equivocarse es reescribir un componente. Pantallas, formularios,
  tablas, filtros, ajustes, seed. **Va sobre-especificado y salta el diseño.**
- **Revisión con Opus** solo en tickets `opus` y en cualquiera que toque RLS, dinero o
  datos clínicos. Un ticket de interfaz pura cierra con verificador, lint y build.
