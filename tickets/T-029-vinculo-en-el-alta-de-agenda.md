---
id: T-029
titulo: El vínculo con el paciente, exigido también al crear agenda
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-010, T-011]
estado: pendiente
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

- [ ] **Contestar la pregunta de dominio** y dejarla como ADR en `docs/decisions.md`.
- [ ] Añadir la exigencia de vínculo a la rama del profesional en `citas_alta` y
      `series_cita_alta`, **sin tocar la rama del técnico** si la decisión es la esperada.
- [ ] El **mismo** predicado en las funciones `definer` que hoy lo replican:
      `agenda_crear_serie()`, y la comprobación equivalente en `agenda_confirmar_propuesta()`
      cuando crea una cita nueva desde una propuesta.
- [ ] Si la decisión es «citar crea el vínculo»: el alta de la asignación va **en la misma
      transacción** que la cita, nunca en dos llamadas desde el cliente.
- [ ] Módulo nuevo en el banco (`scripts/rls/17-...`), al final y con el número siguiente,
      como manda `scripts/rls/README.md` §7.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `PRO1` intenta crear una cita con el `paciente_id` de `PRO2`:
      **falla con 42501**, por política y también por la función de dominio.
- [ ] **Automático** — **gemela positiva sobre la misma fila**: `PRO1` crea la cita con un
      paciente suyo y entra.
- [ ] **Automático** — misma pareja de pruebas para `agenda_crear_serie()` y para
      `agenda_confirmar_propuesta()` en su rama de creación.
- [ ] **Automático** — el técnico administrativo **sigue pudiendo** citar a cualquier
      paciente de su centro (o lo que diga el ADR): la prueba afirma la decisión escrita,
      no la que le parezca al agente.
- [ ] **Automático** — `npm run test:rls` en verde entero, sin tocar el recuento de ningún
      módulo anterior por otro motivo que este.
- [ ] **Automático** — con el arreglo quitado, la negativa **falla**. Reproducido y pegado
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
