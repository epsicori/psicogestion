---
id: T-004
titulo: Auditoría por triggers y protección de solo adición en tres capas
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-001]
estado: pendiente
---

# Contexto

T-000 dejó `fn_auditar()` escrita **genérica a propósito** (`TG_OP`, `TG_TABLE_NAME`,
`to_jsonb`) y colgada de una sola tabla. Aquí se cuelga de todas y se cierra el invariante
2 con las tres capas que `docs/architecture.md` §Solo adición exige, no con una.

La tercera capa es la que casi nadie escribe y es la que importa: **`TRUNCATE` no dispara
disparadores `FOR EACH ROW` y RLS no lo intercepta**. Sin un disparador
`BEFORE TRUNCATE ... FOR EACH STATEMENT`, una tabla «inmutable» se vacía en una línea.

Referencias: `docs/architecture.md` §Solo adición (las tres capas y el regalo de
privilegios de Supabase), §Registro de accesos. `docs/state.md` §Aprendizajes
«Invariante de solo adición». Constitución, regla 6.

No depende de T-002: la auditoría no es una política, es un disparador. Se puede
paralelizar con él.

## Tareas

- [ ] Revisar `fn_auditar()` y colgarla de **todas** las tablas del esquema de T-001, con
      la convención de nombre `auditar_<tabla>`. Las tablas de solo adición **también**
      se auditan: auditar un `insert` es correcto.
- [ ] Registrar en `auditoria` lo que no es un cambio de fila pero sí un hecho auditable:
      **inicio de sesión, búsqueda que devuelve pacientes** (choque 8 de `interfaz.md`),
      **fallo y bloqueo de PIN** (ADR-026) y **cambio de titularidad o de asignación de
      paciente** (ADR-032).
- [ ] **Capa 1 · Revoke** sobre `notas_clinicas_versiones`, `facturas` *(cuando exista)*,
      `auditoria` y `accesos_historia`: `revoke update, delete on table ... from` todos los
      roles, `postgres` incluido.
- [ ] **Capa 2 · Disparador `FOR EACH ROW`**: `fn_impedir_modificacion()` genérica vía
      `TG_TABLE_NAME`, `before update or delete`, `raise exception` con `errcode = '42501'`
      y mensaje que nombre la tabla.
- [ ] **Capa 3 · Disparador `FOR EACH STATEMENT`**: `before truncate` en las mismas
      tablas, misma excepción. **Es la capa que tapa el agujero real.**
- [ ] `alter default privileges in schema public revoke all on tables from anon,
      authenticated, service_role` — Supabase concede TRUNCATE, TRIGGER y REFERENCES a
      tablas nuevas sin pedirlo.
- [ ] **Comprobador de cobertura**: consulta que, dada la lista de tablas de solo adición,
      devuelve las que **no** tienen las tres capas. Se ejecuta en el banco de T-003 y en
      CI (T-009), de modo que una tabla nueva sin proteger **rompe el build**.
- [ ] Índices de consulta de `auditoria` pensados para la pantalla de auditoría de fase 1:
      por actor y fecha, por tabla y registro.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npx supabase db reset`, `npm run lint` y `npm run build` limpios.
- [ ] **Automático** — un `insert`, un `update` y un `delete` en una tabla mutable
      cualquiera dejan **exactamente una fila** en `auditoria` cada uno, con actor, tabla,
      operación, `registro_id` y los estados anterior y posterior correctos.
- [ ] **Automático** — sobre **cada una** de las tablas de solo adición y como `postgres`:
      `update` → permiso denegado; tras conceder `update` a la fuerza → excepción 42501 del
      disparador; `truncate` → excepción 42501 del disparador de sentencia. Los tres, tabla
      por tabla, sin excepción.
- [ ] **Automático** — el comprobador de cobertura devuelve **cero** tablas desprotegidas.
- [ ] **Automático** — añadir una tabla de solo adición **sin** sus tres capas hace que el
      comprobador **falle**. Se demuestra ejecutándolo.
- [ ] **Automático** — `\dp` sobre las tablas nuevas no muestra TRUNCATE para `anon`,
      `authenticated` ni `service_role`.
- [ ] **Automático** — un fallo de PIN y un bloqueo por intentos dejan su entrada en
      `auditoria` (gemelo del criterio de T-002).
- [ ] **Automático** — `auditoria` no es escribible directamente por `authenticated`: un
      `insert` a mano **falla**; el disparador `security definer` sí escribe.

## Guion de comprobación manual

1. `npx supabase db reset`.
2. En Studio, crea un paciente desde `/pacientes` y mira `auditoria`: una fila, con tu
   usuario como actor.
3. Intenta `delete from auditoria` en el editor SQL de Studio: debe fallar con el mensaje
   de solo adición, no con un error críptico.

## Notas para el agente

- **Los dos cerrojos tapan agujeros distintos**: el `revoke` da el `permission denied` pero
  no frena a un superusuario; el disparador sí. Los dos, siempre.
- Auditar con `security definer` es lo que permite que `auditoria` **no** tenga política de
  `insert` para `authenticated`: así un cliente no puede fabricar registros. No lo
  «arregles» añadiéndola.
- `actor_id` es **anulable y sin clave foránea**: la siembra escribe sin JWT y un registro
  de auditoría sobrevive al borrado del usuario.
- `registro_id` es `text`, no `uuid`, precisamente para que el mismo disparador valga en
  todas las tablas.
- Cuidado con el volumen: auditar `update` de `desbloqueos_historia` en cada prolongación
  de ventana puede inundar la tabla. Decide en diseño **qué se audita y qué no**, y deja el
  motivo escrito.
- Lo que aquí no entra: la **pantalla** de auditoría y la de accesos, que son fase 1
  (`interfaz.md` §Lo que el prototipo no cubre).
