---
id: T-053
titulo: El técnico no puede deducir el tipo ni el episodio de una cita leyendo su propia auditoría (H25)
modelo: opus
riesgo: alto            # RLS y auditoría; es el único hallazgo marcado «bloquea producción»
fase: 2
prioridad: alta         # etapa 1 de docs/plan-puesta-en-marcha.md: sin esto no hay datos reales
depende_de: [T-039]     # episodio_id en citas y su auditoría
estado: pendiente
delegable: no
territorio:
  - supabase/migrations/        # una migración nueva, hacia delante
  - scripts/rls/                # banco nuevo y su fila en el README
  - lib/supabase/tipos-bd.ts    # solo si cambia una firma
  - docs/architecture.md        # el párrafo de H25 se cierra
  - docs/bitacora/T-053.md
  - docs/state.md
---

# Contexto

H25 está abierto desde T-028a. El propietario lo sacó a un ticket propio el 02-10-2026 («Q1» de `tickets/T-028a-base-del-alta-de-cita.md`). `docs/architecture.md:199` y `:505` lo marcan como **bloqueo de producción**.

- **`auditar_citas`** es `fn_auditar('id', 'nota_operativa')`. Copia la fila entera, incluidos `tipo_terapia_id` y `episodio_id`, en `estado_anterior` y `estado_posterior`. Lo hace con `actor_id = auth.uid()`, también dentro de las funciones `security definer`. Para `series_cita` pasa lo mismo.
- **`auditoria_lectura_propia`** (`supabase/migrations/20260829180000_revision_corte_por_baja.sql:31`) deja a cualquier rol leer las filas en las que es actor.
- **El resultado**: el técnico que da de alta o reprograma una cita lee después en su auditoría el tipo de terapia y el `episodio_id`. Con el `episodio_id` puede agrupar a los pacientes que comparten episodio: parejas y familias. Eso es información clínica que la matriz de quién ve qué (ADR-074.2) le niega.

La puerta de la **duración** (deducir el tipo por `fin − inicio`) es un riesgo **aceptado** por el propietario (R2-H1 de T-028a). **No entra aquí.**

# Tareas

- [ ] **Diseño** (arquitecto, `tickets/T-053/diseno.md`). Inventario de **todas** las tablas auditadas cuyas filas lee el técnico como actor y que llevan columnas clínicas o de agrupación: al menos `citas` y `series_cita`. El diseñador busca las demás (`rg -n "fn_auditar" supabase/migrations`).
  - Para cada tabla elige una de dos salidas:
    - **(a)** que la lectura propia del técnico no devuelva esas claves;
    - **(b)** que el técnico no lea esas filas de auditoría.
  - Hay que justificar la elección contra lo que la app lee de `auditoria` hoy: `app/(app)/pacientes/[id]/datos.ts`, `panel-datos.tsx`, `panel-diferido.tsx`, `lib/cuentas/invitar.ts` y la consulta de `20260916120000_alta_de_paciente_completa.sql:481`.
- [ ] **Una migración nueva, hacia delante.** No se reescribe ninguna fila de `auditoria` (constitución, regla 6): el arreglo actúa sobre la lectura, nunca sobre lo ya escrito. El administrador sigue leyendo la auditoría completa.
- [ ] **Banco RLS nuevo**:
  - como técnico, después de dar de alta y de reprogramar una cita con tipo y episodio, ninguna consulta suya a `auditoria`, ni a vistas o funciones derivadas, devuelve `tipo_terapia_id` ni `episodio_id`;
  - como administrador, sí los devuelve;
  - lo que la app usa hoy de la auditoría propia sigue funcionando.
- [ ] Cerrar H25 en `docs/architecture.md`, en los dos párrafos, y en `docs/state.md`. La bitácora va en `docs/bitacora/T-053.md`.

# Criterios de aceptación (verificables)

- [ ] **Automático.** El banco nuevo pasa dentro de `npm run test:rls` (exit 0), sobre `db reset` y con `max(version)` igual a la migración nueva.
- [ ] **Automático, mutantes.** `tickets/T-053/mutantes.json` lleva al menos cinco mutantes, todos muertos y medidos en `begin … rollback`:
  - quitar el filtro de rol;
  - dejar `episodio_id`;
  - dejar `tipo_terapia_id`;
  - olvidar `series_cita`;
  - abrir la lectura al profesional ajeno.
- [ ] **Automático.** Los demás bancos y `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx next build --webpack` y `npx tsc --noEmit` siguen en verde.
- [ ] **Automático.** `npm run verificar:huellas` dice «cadena íntegra»: la auditoría no se ha tocado.
- [ ] **QA visible (verificador, navegador a la vista).**
  - Como técnico, la ficha del paciente y las pantallas que hoy leen la auditoría propia se pintan igual que en `main`, sin errores de consola.
  - Como administrador, la auditoría de una cita sigue enseñando el tipo y el episodio.
  - Se hace `qa.mjs visita` de las rutas afectadas.

# Notas para el agente

- **La regla 6 manda.** Un `UPDATE` sobre `auditoria` es un bug. Si el diseño necesita otra forma de guardar, se añade, y lo escrito antes de la migración se protege por lectura.
- La auditoría la escribe el actor que ejecuta, también dentro de las funciones definer. **No arregles H25 cambiando quién figura como actor**: eso falsea la auditoría.
- Una vista con `security_invoker` o una función definer que filtre las claves son caminos posibles. Elige con la lista de lectores de arriba delante.
- Lee `.claude/rules/` de `supabase/**` y el patrón «la doc generaliza la cobertura» del revisor: al cerrar H25 en `architecture.md`, que la frase nueva no niegue otro residuo aceptado.

# Preguntas abiertas al propietario (con recomendación)

Ninguna por adelantado. Si el diseño concluye que el técnico debe perder alguna lectura que hoy ve en pantalla, se pregunta en el gate del diseño.

# Lo que no entra, y por qué

- **La duración como canal del tipo**: es un riesgo aceptado (R2-H1, 02-10-2026).
- **P4 = A** (el administrador deduce el episodio por la resolución automática): riesgo aceptado en T-039.
- **El residuo C18TEC del banco 18**: está anotado aparte en `architecture.md`.
