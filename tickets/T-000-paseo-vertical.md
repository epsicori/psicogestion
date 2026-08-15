---
id: T-000
titulo: Paseo vertical — login → crear paciente → verlo en lista
modelo: opus
fase: 0
prioridad: alta
depende_de: []
estado: pendiente
---

# Contexto

Primera cosa que se construye. Atraviesa el stack entero con lo mínimo indispensable
para demostrar que las piezas encajan **y para fijar los tres patrones que el resto del
proyecto va a copiar decenas de veces**:

1. cómo se lee la sesión en un Server Component,
2. cómo se escribe una política RLS apoyada en funciones auxiliares,
3. cómo se cuelga un trigger de auditoría de una tabla.

Si estos tres salen bien, los siguientes veinte tickets son repetición. Si salen mal, se
propaga el error. Por eso es `opus` pese a ser pequeño.

**No es un prototipo desechable**: lo que se escriba aquí se queda y T-001 lo amplía.
Alcance deliberadamente recortado, calidad no.

Referencias: `docs/architecture.md` §Los cuatro invariantes (1 y 2), §RLS, §Roles.
Decisiones que aplican: 1 (instancia dedicada, sin `organizacion_id` en filas), 3
(Server Components), 5 (el profesional solo ve lo suyo).

## Tareas

- [ ] Migración con lo mínimo: enum `rol_usuario`, tabla `perfiles` (extiende
      `auth.users`) y tabla `pacientes` reducida — `id` uuid, `nombre`, `apellidos`,
      `profesional_id`, `creado_en`.
- [ ] Función auxiliar `rol_actual()` en SQL, marcada `security definer` y `stable`.
- [ ] RLS activo en ambas tablas. Política de `pacientes`: un `profesional_sanitario`
      solo ve y solo crea filas donde `profesional_id = auth.uid()`.
- [ ] Tabla `auditoria` de solo adición (`UPDATE` y `DELETE` revocados a todos los roles)
      y trigger genérico `fn_auditar()` colgado de `pacientes`.
- [ ] Cliente de Supabase para navegador y para servidor con `@supabase/ssr`, y
      middleware que refresca la sesión.
- [ ] Página de login con correo y contraseña.
- [ ] Ruta protegida `/pacientes`: lista en Server Component y alta por Server Action
      validada con Zod.
- [ ] Dos usuarios de prueba sembrados, ambos `profesional_sanitario`, con un paciente
      cada uno.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npx supabase db reset` aplica las migraciones sin error.
- [ ] **Automático** — `npm run lint` y `npm run build` limpios.
- [ ] **Automático** — autenticado como profesional A, `select * from pacientes`
      devuelve **solo** sus filas; las de B no aparecen.
- [ ] **Automático** — `insert` en `pacientes` con `profesional_id` de otro usuario es
      **rechazado** por RLS.
- [ ] **Automático** — tras crear un paciente existe exactamente una fila nueva en
      `auditoria` con el actor, la tabla y el estado posterior.
- [ ] **Automático** — `update auditoria set ...` y `delete from auditoria` **fallan**
      con error de permisos, incluso como `postgres`.
- [ ] **Automático** — visitar `/pacientes` sin sesión redirige a `/login`.
- [ ] **Manual** — el guion de abajo se completa entero.

## Guion de comprobación manual

1. `npx supabase start` y `npm run dev`.
2. Abre `http://localhost:3000/pacientes` **sin haber entrado**: debe mandarte a `/login`.
3. Entra como el profesional A. Debes ver su paciente y ninguno más.
4. Crea un paciente nuevo. Debe aparecer en la lista sin recargar a mano.
5. Cierra sesión y entra como el profesional B. **No debes ver ninguno de los pacientes
   de A**, ni el que acabas de crear.

## Notas para el agente

- **Lee `node_modules/next/dist/docs/` antes de escribir código de framework.** Next 16
  cambia cosas respecto a lo aprendido: middleware, cookies y Server Actions incluidos.
- Usa `@supabase/ssr`, no el patrón antiguo de `auth-helpers`, que está retirado.
- La clave de servicio **no** aparece en ningún código que llegue al navegador.
- `rol_actual()` debe evitar la recursión infinita clásica: si consulta `perfiles` y
  `perfiles` tiene una política que llama a `rol_actual()`, se cuelga. Resuélvelo con
  `security definer` y `search_path` fijo.
- El trigger de auditoría se escribe **genérico desde el principio** (`TG_TABLE_NAME`,
  `to_jsonb(NEW)`), porque en T-004 se cuelga de todas las tablas sin reescribirlo.
- Nada de `organizacion_id` en las filas: es instancia dedicada (decisión 1).
- Interfaz mínima y sin adornos: el sistema de diseño llega en T-007. Que funcione y se
  entienda, nada más.
