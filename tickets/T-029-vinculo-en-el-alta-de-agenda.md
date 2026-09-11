---
id: T-029
titulo: El vínculo con el paciente, exigido también al crear agenda
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-010, T-011]
estado: hecho
---

# Contexto

Sale del **hallazgo 7 de la revisión con Opus de T-011a** (11-09-2026), anotado allí y
decidido por el propietario el mismo día: se corrige, y se corrige en su propio ticket
porque toca políticas de **T-010 ya integradas en `main`**.

Las políticas de alta de `citas` y `series_cita`, y las funciones de dominio `agenda_*`
que replican su predicado, miran el rol, el profesional y el centro — y **nunca si el
paciente es del profesional**. Un `profesional_sanitario` puede crear una cita o una serie
entera sobre el `paciente_id` de otro profesional.

```sql
create policy citas_alta on public.citas
  for insert to authenticated
  with check (
    rol_actual() is not null
    and ( rol_actual() = 'administrador'
          or profesional_id = auth.uid()
          or ( rol_actual() = 'tecnico_administrativo'
               and centro_id in (select centros_actuales()) ) ) );
--  ^ en ningún sitio: es_profesional_asignado(paciente_id)
```

**Lo que NO es**: no es una fuga de datos. `citas_agenda` solo expone identificadores,
`pacientes` sigue cerrada por RLS y el nombre no sale por ningún lado. Lo que permite es
**escribir** agenda sobre el paciente de otro, firmada con tu nombre en la auditoría.

**Lo que sí es**: el invariante de `architecture.md` §Roles —un profesional ve y toca lo
suyo— se cumple en lectura y no en el alta de agenda. Hoy no hay datos reales dentro; con
consulta en marcha, cada fila mal atribuida es una cita en la agenda de alguien y un cobro
colgando de ella.

Referencias: `docs/architecture.md` §Roles e §Invariante 3. `es_profesional_asignado()` de
T-001. El catálogo de políticas, en la sección 10 del «Diseño aprobado» de
`tickets/T-002-rls-politicas.md`.

## La pregunta de dominio, antes del código

**El diseño no puede empezar sin contestarla, y no la contesta un agente.** Hay dos filos:

1. **El técnico administrativo.** Casi con seguridad **sí** debe poder citar a cualquier
   paciente de su centro: es su trabajo, y no ve la historia. Si es así, su rama se queda
   como está y la exigencia cae solo sobre el profesional.
2. **El profesional con un paciente que aún no es suyo.** ¿Citar es un acto reservado a
   quien ya tiene el vínculo, o **citar es justamente como se crea el vínculo** (primera
   consulta de un paciente que llega hoy)? Si es lo segundo, la respuesta no es prohibir:
   es que dar la primera cita **cree la asignación**, explícitamente y con su auditoría.

La respuesta se escribe en `docs/decisions.md` como ADR antes de tocar una línea.

## Tareas

- [x] **Contestar la pregunta de dominio** y dejarla como ADR en `docs/decisions.md`.
- [x] Añadir la exigencia de vínculo a la rama del profesional en `citas_alta` y
      `series_cita_alta`, **sin tocar la rama del técnico** si la decisión es la esperada.
- [x] El **mismo** predicado en las funciones `definer` que hoy lo replican:
      `agenda_crear_serie()`, y la comprobación equivalente en `agenda_confirmar_propuesta()`
      cuando crea una cita nueva desde una propuesta.
- [x] Si la decisión es «citar crea el vínculo»: el alta de la asignación va **en la misma
      transacción** que la cita, nunca en dos llamadas desde el cliente.
- [x] Módulo nuevo en el banco (`scripts/rls/17-...`), al final y con el número siguiente,
      como manda `scripts/rls/README.md` §7.

## Criterios de aceptación (verificables)

- [x] **Automático** — `PRO1` intenta crear una cita con el `paciente_id` de `PRO2`:
      **falla con 42501**, por política y también por la función de dominio.
- [x] **Automático** — **gemela positiva sobre la misma fila**: `PRO1` crea la cita con un
      paciente suyo y entra.
- [x] **Automático** — misma pareja de pruebas para `agenda_crear_serie()` y para
      `agenda_confirmar_propuesta()` en su rama de creación.
- [x] **Automático** — el técnico administrativo **sigue pudiendo** citar a cualquier
      paciente de su centro (o lo que diga el ADR): la prueba afirma la decisión escrita,
      no la que le parezca al agente.
- [x] **Automático** — `npm run test:rls` en verde entero, sin tocar el recuento de ningún
      módulo anterior por otro motivo que este.
- [x] **Automático** — con el arreglo quitado, la negativa **falla**. Reproducido y pegado
      en el ticket.

## Notas para el agente

- **La trampa conocida**: una prueba negativa que sale verde por el motivo equivocado. Con
  RLS activo y sin política aplicable, un `INSERT` de un rol sin permiso puede fallar por
  la clave ajena, por otro disparador o por no ver la fila — no por el candado que crees
  estar probando. Usa `assert_lanza_codigo` con el código exacto y su gemela positiva
  sobre la misma fila (`scripts/rls/README.md` §8 y el patrón de error de T-001).
- `es_profesional_asignado()` ya existe; no se reescribe.
- Las funciones de dominio son `security definer`: **RLS no las cubre**. Cambiar solo la
  política deja la puerta de la función abierta, que es exactamente cómo nació este
  hallazgo.
- Migración hacia delante, nunca destructiva en un solo paso. Las políticas se sustituyen
  en la misma migración que las vuelve a crear.

## Diseño aprobado y ejecutado · 11-09-2026

**La pregunta de dominio la contestó el propietario el 11-09-2026** y está escrita como
**ADR-055**: el técnico administrativo sí cita a cualquier paciente de su centro; el
profesional solo a los suyos; **citar no crea el vínculo**.

### La decisión de diseño: dos capas, y solo una cierra el agujero

| Capa | Qué cubre | Qué pasa si falta |
|---|---|---|
| `citas_alta` / `series_cita_alta` con `es_profesional_asignado(paciente_id)` | el `INSERT` directo por PostgREST | el contrato deja de verse en `pg_policies`, que es donde se lee la regla |
| Disparador `exigir_vinculo_agenda` (`before insert` en las dos tablas) | **las funciones `agenda_*`** | **el agujero sigue abierto**: son `security definer` y RLS no las mira |

El ticket pedía repetir el predicado dentro de cada función de dominio. Se hace con un
disparador en su lugar, por dos motivos: `create or replace` de `agenda_crear_serie()`
duplicaría doscientas líneas en una migración para cambiar una condición, y sobre todo
**cada función futura tendría que acordarse de repetir el predicado**. El disparador no se
olvida. Lo que la función sí conserva es su propio 42501 de autorización: lo que se le
quita es la responsabilidad de recordar el vínculo.

**El disparador solo muerde a quien la decisión acota**: si `rol_actual()` no es
`profesional_sanitario` —administrador, técnico, o `postgres` en siembras y migraciones,
donde es nulo— deja pasar sin mirar. Y solo cuando el profesional agenda **para sí mismo**:
si la fila es de otro profesional, la que rechaza es la política, que es a quien le toca.

### Que las dos capas son independientes, demostrado

Neutralizando el disparador (`if false then` en vez de la comprobación) y corriendo el
banco entero:

    OK (lanzó 42501 como se esperaba): T-029: PRO1 NO puede crear una cita para P2  ← la política
    ASERCIÓN FALLIDA (debía lanzar 42501 y no lanzó nada): T-029: agenda_crear_serie()
      TAMBIÉN rechaza el paciente ajeno, aunque sea security definer y RLS no la mire
    npm run test:rls → código 3

El `INSERT` directo **sigue** rechazado por la política; la función `definer` **deja pasar
al paciente ajeno**. Es el hallazgo 7 de T-011a reproducido en una línea, y la prueba de
que la capa que lo cierra es el disparador.

### El módulo del banco: `scripts/rls/17-vinculo-agenda.sql`

Al final y con el número siguiente, como manda el README. Nueve comprobaciones en cuatro
bloques, y **cada negativa con su gemela positiva sobre la misma tabla y la misma hora**:

- **A · el `INSERT` directo**: PRO1 sobre P2 (de PRO2) lanza 42501 con
  `assert_lanza_codigo` —el código exacto, no «falló algo»—; PRO1 sobre P1 entra. Lo mismo
  con una serie.
- **B · las funciones**: `agenda_crear_serie()` sobre P2 lanza 42501; sobre P1 materializa
  sus dos citas.
- **C · a quién no acota la decisión**: el técnico de centro A crea una cita para P1, que
  **no es suyo y nunca lo será** —no tiene pacientes, no es profesional—; el administrador
  crea una para P2 en el centro B.
- **D · que la negativa no sea verde por el motivo equivocado**: se le pregunta a la base
  lo mismo que pregunta el disparador, en sesión de PRO1 y de PRO2:
  `es_profesional_asignado(P2)` da **false** para PRO1 y **true** para PRO2. Y PRO2 crea la
  misma cita que a PRO1 se le negó. El 42501 es por el vínculo, no porque no vea la fila ni
  por una clave ajena — que es el patrón de falso verde que ya costó dos revisiones en
  T-001.

### Evidencia

`npm run test:rls`: **344 aserciones, cero fallidas**, 18 módulos. `npm run lint:migraciones`:
11 migraciones limpias. `npx supabase db reset` limpio y los dos disparadores presentes
después del reset (`citas` y `series_cita`), que es la trampa de Docker ya pagada en T-005.
`npm run lint`, `npx vitest run` y `npm run build`, limpios.

### Lo que este ticket NO ha tocado, y conviene saber

- **`agenda_actualizar_cita()` no cambia**: no admite cambiar el paciente de una cita, así
  que no hay por dónde reatribuir. Y en una cita pasada, `fn_proteger_cita_pasada()` ya
  prohíbe tocar `paciente_id`.
- **La rama del técnico sigue acotada por centro y no por vínculo**, que es la decisión, no
  un olvido.
- **El `UPDATE` de `citas` no lleva la exigencia**: cambiar el paciente de una cita futura
  no está permitido hoy por otra vía, pero no hay una negativa que lo demuestre. Anotado
  para quien toque `citas_modificacion`.
