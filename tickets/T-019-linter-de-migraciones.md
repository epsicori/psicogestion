---
id: T-019
titulo: Linter de migraciones — la regla 6 de la constitución, comprobada
modelo: sonnet
fase: 0
prioridad: alta
depende_de: [T-016]
estado: pendiente
---

# Contexto

La regla 6 de la constitución dice que **nada clínico ni económico se modifica ni se
borra**, y que «un `UPDATE` o `DELETE` sobre `notas_clinicas_versiones`, `facturas`,
`auditoria` o `accesos_historia` **es un bug, no una optimización** — y la base de datos
debe impedirlo, no solo la aplicación». Hoy eso lo impide la base de datos **cuando alguien
se acordó de escribir el `revoke`**, y lo comprueba una persona leyendo el diff.

Este ticket lo convierte en un comando. Es **análisis estático de texto sobre los ficheros
`.sql` de `supabase/migrations/`**: no levanta Docker, no se conecta a Postgres, no aplica
nada. Por eso puede correr en paralelo con T-002 y T-003 sin tocarles un fichero.

La diferencia con **T-004** y con **T-009** es la frontera, y hay que respetarla: T-004
escribe la auditoría y su comprobador de **cobertura** consultando la base viva; T-009
**engancha** este comando y aquel a CI. Aquí solo nace el comando, y lee texto.

Referencias: constitución regla **6**, ADR **033** y **051** (multi-centro), CLAUDE.md
§Convenciones («migraciones siempre hacia delante y nunca destructivas en un solo paso»).

## Tareas

- [ ] `scripts/lint-migraciones.ts`, ejecutable con `tsx` —ya está en el proyecto— y
      enganchado como `npm run lint:migraciones`. Salida legible: fichero, número de línea,
      regla incumplida y **por qué importa**, no solo un código.
- [ ] **Regla 1 · Solo adición.** Ningún `update` ni `delete` **ni `truncate`** dirigido a
      las tablas de solo adición. La lista de tablas protegidas vive en **una constante
      exportada y comentada** al principio del fichero: `auditoria`,
      `notas_clinicas_versiones`, `accesos_historia`, `accesos_historia_vistas`,
      `facturas`. Ampliarla es una línea.
- [ ] **Regla 2 · Nada destructivo en un solo paso.** `drop table`, `drop column`,
      `drop type`, `alter column … type` y `alter column … set not null` **sin valor por
      defecto** se marcan. No se prohíben para siempre: se exigen **anunciados**, con un
      comentario `-- destructivo: <motivo>` en la línea anterior, y el linter lo acepta si
      está. Una migración destructiva silenciosa falla; una explicada, pasa.
- [ ] **Regla 3 · RLS de origen.** Toda sentencia `create table` en `public` va acompañada,
      **en el mismo fichero**, de su `alter table … enable row level security`. Una tabla
      sin RLS en una base con RLS es una puerta abierta que nadie ve.
- [ ] **Regla 4 · `search_path` en `security definer`.** Toda función `security definer`
      lleva `set search_path` explícito. Sin él, quien controle el `search_path` de la
      sesión elige qué código corre con privilegios ajenos. Este proyecto ya vive de
      funciones `security definer` —`rol_actual()`, `historia_desbloqueada()`,
      `centros_actuales()`—: la regla protege las que vengan.
- [ ] **Regla 5 · Nombres y orden.** Los ficheros siguen
      `AAAAMMDDHHMMSS_descripcion_en_castellano.sql`, los sellos son **estrictamente
      crecientes** y no hay dos iguales. Dos migraciones con el mismo sello se aplican en
      orden indefinido.
- [ ] **Regla 6 · Sin ediciones hacia atrás.** Compara con `git` el listado de migraciones
      **ya presentes en `main`**: si el contenido de una cambió, falla. Una migración
      aplicada en algún sitio ya no se edita, se enmienda con otra. Si `git` no está
      disponible, la regla **se salta con aviso** y no rompe el comando.
- [ ] Cada regla trae **su prueba** en el banco de T-016, con un fragmento SQL en línea
      —cadena en el propio fichero de prueba, **no** una migración de mentira dentro de
      `supabase/migrations/`— que la dispara y otro que no.
- [ ] Ejecuta el comando sobre las migraciones **que ya existen** y deja el resultado en el
      PR. Si algo real salta, **no lo arregles aquí**: anótalo en `docs/state.md`
      §Hallazgos anotados con fichero y línea, y marca la regla como aviso hasta que su
      ticket la limpie. La regla 2 de la constitución vale también para el linter.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm run lint:migraciones` corre sobre `supabase/migrations/`
      **sin Docker levantado** y devuelve 0 o 1 según haya hallazgos, nunca una excepción
      sin capturar.
- [ ] **Automático** — un fragmento con `delete from auditoria` es marcado por la regla 1,
      y el mensaje nombra la tabla.
- [ ] **Automático** — `drop column` sin comentario anunciador falla; con
      `-- destructivo: <motivo>` en la línea anterior, pasa.
- [ ] **Automático** — un `create table public.x (…)` sin su `enable row level security` en
      el mismo fichero falla.
- [ ] **Automático** — una función `security definer` sin `set search_path` falla.
- [ ] **Automático** — dos ficheros con el mismo sello temporal fallan por la regla 5.
- [ ] **Automático** — `npm test` en verde con al menos **dos** casos por regla, uno
      positivo y uno negativo.
- [ ] **Automático** — `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. `npm run lint:migraciones` con Docker **parado**: corre y responde.
2. Añadir `delete from auditoria;` al final de una migración: el comando lo señala con
   fichero y línea. Revertir.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.**
- **Esto es un linter, no un analizador de SQL.** No instales un parser de Postgres: lee
  línea a línea, normaliza espacios y mayúsculas, e **ignora comentarios y cadenas
  literales** —un `delete from auditoria` dentro de un `--` o de un `$$ … $$` no es una
  sentencia—. Que se te escape un caso raro es aceptable; que grites por un comentario, no:
  un linter que da falsos positivos se desactiva a la semana.
- **No modifiques ninguna migración existente**, ni siquiera para «arreglar» lo que el
  linter encuentre. `supabase/migrations/` es de solo lectura en este ticket.
- **T-002 está en curso sobre esos ficheros.** Toca `scripts/`, `package.json` y las
  pruebas; nada más dentro de `supabase/`.
- No metas este comando en ningún flujo de CI: eso es **T-009**, y allí se decide el orden.
