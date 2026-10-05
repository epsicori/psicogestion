---
id: T-041
titulo: Altas de centro para quien atiende — profesional invitado y administrador que también atiende
modelo: opus
riesgo: alto
fase: 1
prioridad: media
depende_de: [T-035]
estado: hecho
completado: 2026-10-05
territorio:                           # provisional: lo cierra el diseño
  - supabase/migrations/*_altas_de_centro.sql   # solo si el diseño necesita función o política; cola de un solo dueño
  - supabase/seed.sql
  - supabase/seed-completo.sql
  - scripts/rls/*-altas-de-centro.sql
  - scripts/rls/README.md
  - scripts/rls/11-cobertura.sql
  - lib/supabase/tipos-bd.ts          # solo regenerado con `npm run tipos`
  - lib/cuentas/**
  - lib/i18n/es.ts
  - app/(app)/ajustes/**
  - accesibilidad/**
  - docs/architecture.md
  - docs/interfaz.md
---

# Contexto

T-035 dejó al administrador como coprofesional posible de una nota en episodio, con tres condiciones
en la base: rol de `ROLES_COPROFESIONAL`, activo, y **alta vigente en `perfiles_centros` para el
centro del episodio** (paso 7c de `fn_exigir_episodio_coherente_en_nota`).

La revisión de T-035 (B-H1, MEDIA, `tickets/T-035/revision.md`) encontró que esa tercera condición
solo se cumple en el banco de pruebas, que inserta el alta como `postgres`:

- `supabase/seed.sql` siembra al administrador sin centro;
- la invitación (`app/(app)/ajustes/invitar/formulario-invitar.tsx:87-91`) borra `centroId` para
  cualquier rol que no sea técnico;
- ninguna ruta de `app/` ni de `lib/` escribe en `perfiles_centros`.

Consecuencia: la coterapia con el administrador no funciona en una instalación real, y **tampoco un
profesional invitado desde la aplicación** puede ser coprofesional de nadie.

**Decisión del propietario (02-10-2026)**: se dan altas de centro a quien atiende, profesional o
administrador, igual que a un profesional. La regla 7c de la base **no cambia**.

Referencias: `docs/architecture.md` §Roles y §multicentro, migración
`20260829120000_perfiles_centros_multicentro.sql` (políticas `perfiles_centros_lectura` y
`perfiles_centros_alta_administrador`, disparador `espejar_centro_principal`), ADR-073, ADR-065.

## Tareas

- [ ] La invitación de un profesional sanitario o de un administrador permite elegir uno o varios
      centros de alta (hoy solo el técnico lleva centro).
- [ ] En Ajustes, el administrador da y retira altas de centro a un perfil existente. Retirar es
      cerrar la vigencia, nunca borrar la fila, si `perfiles_centros` guarda vigencia; si no, el
      diseño dice cómo se conserva el rastro.
- [ ] La siembra de demostración da alta al administrador en los centros donde atiende, para que el
      selector de coprofesional lo ofrezca.
- [ ] Qué ve de más quien gana un alta de centro (agenda, pacientes, alertas), contrastado con la
      matriz de `docs/architecture.md`, y escrito en el diseño **antes** de dar la primera alta.

## Criterios de aceptación (verificables)

- [ ] **Automático** — un administrador con alta en el centro del episodio entra como coprofesional
      en una nota de un profesional (y su gemela: sin alta, 23514), con el alta dada **por la ruta de
      la aplicación**, no insertada como `postgres`.
- [ ] **Automático** — un profesional invitado desde la aplicación con un centro puede ser coprofesional
      en ese centro y no en otro.
- [ ] **Automático** — solo el administrador da o retira altas; un profesional o un técnico reciben
      error desde la base.
- [ ] **Automático** — dar un alta no concede al administrador lectura de notas ajenas (decisión
      fundacional 5): cero filas de `notas_clinicas_versiones` ajenas tras el alta.
- [ ] **Manual** — con la siembra, Ana abre una nota en un episodio de Madrid y el selector de
      coprofesional ofrece al administrador.
- [ ] **Manual** — `/ajustes` con cada rol enseña la gestión de altas solo al administrador.
- [ ] **Automático** — `npm run lint && npm run build` limpios; `test:rls` verde.

## Guion de comprobación manual

1. `npm run seed`. Entrar como Ana, abrir una nota en un episodio de Madrid: el administrador aparece
   como coprofesional posible.
2. Como administrador, invitar a un profesional con el centro de Madrid.
3. Como administrador, retirar el alta de Madrid a ese profesional: deja de aparecer en el selector.

## Notas para el agente

- El diseño va primero (`tickets/T-041/diseno.md`). Si no hace falta migración, que lo diga y el
  ticket sale de la cola de `supabase/`.
- Abierto también por H2 de T-035: si ADR-065 guarda al director administrativo como marca en el perfil
  con `rol = 'administrador'`, pasaría 7b. Este ticket no lo resuelve, pero no debe darle un alta de
  centro que lo haga coprofesional.
