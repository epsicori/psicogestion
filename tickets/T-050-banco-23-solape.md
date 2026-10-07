---
id: T-050
titulo: Banco de RLS 23 (cita en episodio) choca por solape con citas previas de la base compartida
modelo: sonnet
riesgo: medio
fase: 1
prioridad: alta
depende_de: []
# abierto el 07-10-2026 por decisión del propietario (T-023 ronda 1, CA15): ajeno a T-023
estado: pendiente
delegable: no
territorio:
  - scripts/rls/23-cita-en-episodio.sql
  - tickets/T-050/**
  - docs/bitacora/T-050*.md
  - docs/state.md
---

# Contexto

`npm run test:rls` cae en el banco `scripts/rls/23-cita-en-episodio.sql`, paso Z:
`FALLO: Z fijacion de la cita pasada c_z en ET39 (abierto) (23P01 citas_sin_solape_profesional)`.
Lo vio el verificador de T-023 el 07-10-2026 (`tickets/T-023/evidencia.json`, criterio 15): el
fichero 23 es idéntico en `main` y falla igual con los bancos de `main` contra la base sembrada;
los bancos 00+01+23 aislados pasan. Es la misma familia que T-049 (fechas que caducan y franjas
por módulo, `scripts/rls/README.md` regla 10 y tabla de franjas): la cita de Z cae en una franja
que ya ocupa otra cita del mismo profesional a fecha de hoy.

## Tareas

- [ ] Reproducir el fallo con `npm run test:rls` tras `npx supabase db reset` + `npm run seed`.
- [ ] Mover las citas del banco 23 a la franja que le toque según la tabla de franjas de T-049
      (o reservarle una), sin fechas fijas que caduquen.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm run test:rls` en verde, banco 23 incluido, tras `db reset` + `seed`.
- [ ] **Automático** — el lint de fechas fijas de T-049 sigue en verde.

## Notas para el agente

Solo el banco 23; ningún cambio de producto ni de migración. Si el choque viene de otro banco,
se anota en `docs/state.md` §Hallazgos y no se toca.
