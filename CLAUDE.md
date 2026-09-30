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
| Pruebas unitarias | `npm test` · `npm run test:watch` · `npm run test:cobertura` |
| Sembrar datos | `npm run seed` *(desde T-008; exige `db reset` antes)* |
| Pruebas de RLS | `npm run test:rls` *(desde T-003)* |
| Verificar la cadena de huellas | `npm run verificar:huellas` *(desde T-005; `--json`, `--paciente <uuid>`)* |
| Prueba de concurrencia de la cadena | `npm run test:huellas` *(desde T-005; confirma filas, no idempotente)* |

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
4. **Lee las primeras 80 líneas de `docs/state.md` antes de tocar código** y deja la memoria
   al día al acabar: la bitácora del ticket en `docs/bitacora/`, y `state.md` reescrito, no
   ampliado (un hook lo limita a 80 líneas). Las trampas de cada zona están en `.claude/rules/`
   y se cargan solas al tocar sus ficheros; la historia anterior al 13-09-2026, en
   `docs/bitacora/estado-hasta-2026-09-13.md`.
5. **Contexto mínimo.** A un subagente se le pasa el id del ticket y punteros, nunca la
   conversación ni el historial de otros tickets.
6. **Nada clínico ni económico se modifica ni se borra. Solo se añade.**
   Toda corrección es una versión nueva encadenada por huella SHA-256 al registro
   anterior. Un `UPDATE` o `DELETE` sobre `notas_clinicas_versiones`, `facturas`,
   `auditoria` o `accesos_historia` **es un bug, no una optimización** — y la base de
   datos debe impedirlo, no solo la aplicación.

## Enrutado por riesgo (pipeline v3; `modelo: opus` equivale a `riesgo: alto`, `sonnet` a `medio`)

- **`riesgo: alto`**: equivocarse obligaría a migrar datos o podría exponer información.
  Esquema, RLS, auditoría, cadena de huellas, series de citas, facturación y Verifactu,
  cifrado, importador, acceso de emergencia. Diseño con el arquitecto (`tickets/T-XXX/diseno.md`),
  implementación con Opus, verificación y **dos revisores** en paralelo.
- **`riesgo: medio`**: equivocarse es reescribir un módulo. Diseño corto, Sonnet, un revisor.
- **`riesgo: bajo`**: pantallas de pintura, textos, seed. Sin diseño; cierra con verificador,
  lint y build. Solo lo que no tiene comportamiento es `delegable: volumen`.
- El ticket lleva `territorio:` (qué puede escribir) y el gate de merge exige
  `tickets/T-XXX/evidencia.json` y `revision.json` sellados por los hooks.

## Carriles

El reparto por fichero (quién escribe dónde, qué se delega y cómo se integra) está en
`.claude/rules/pipeline.md`, que se carga siempre. `CARRILES.md` y `fabrica/ORDEN.md` quedan
como historia del reparto a tres del 29-08-2026; el carril de interfaz lo lleva la fábrica desde
el 06-09-2026 y el de funciones puras desde el 30-09-2026 (Kimi deja el proyecto). `kimi/`,
`KIMI.md` y `kimi/alcance.json` quedan como historia: el territorio lo da el `territorio:` del
ticket, no ese fichero.
