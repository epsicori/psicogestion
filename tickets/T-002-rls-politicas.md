---
id: T-002
titulo: RLS — funciones auxiliares y políticas de los tres roles
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-001]
estado: pendiente
---

# Contexto

T-001 dejó todas las tablas con RLS activo y **sin una sola política**, es decir,
denegando todo. Este ticket escribe las políticas, y con ellas la matriz de roles deja de
ser una tabla en un documento y pasa a ser código que la base hace cumplir.

Es el ticket más caro de equivocar del proyecto: **una política mal escrita es una
filtración**, y se propaga a las veinte pantallas que la dan por buena. Las pruebas que lo
demuestran son T-003 y son ticket aparte a propósito — quien escribe la política no es
quien la prueba.

Referencias: `docs/architecture.md` §Roles (la matriz manda), §RLS, §Candado,
§Separación por sensibilidad. ADR **026** (`historia_desbloqueada()`), **028** (acceso del
representante), **030** (participación en episodio), **031** (resolver por el vínculo),
**032** (baja del profesional, titularidad), **033** (centro acota al técnico), **036**
(el borrador va bajo candado y bajo RLS).

## Tareas

- [ ] **Funciones auxiliares**, todas `stable security definer set search_path = ''`, con
      `revoke execute from public` y `grant` solo a `authenticated`:
      - `rol_actual()` — ya existe de T-000; revisar, no reescribir.
      - `es_profesional_asignado(paciente_id)` — **resuelve el vínculo de fusión en un
        solo salto** (ADR-031) y devuelve **falso si el perfil no está `activo`**
        (ADR-032).
      - `historia_desbloqueada()` — desbloqueo vigente y no revocado (ADR-026). Invoca
        `extensions.crypt`, no `crypt`, porque el `search_path` está vacío.
      - `centro_actual()` — el centro del perfil, para acotar al técnico (ADR-033).
- [ ] **Disparador de alta de perfil**: al crearse un `auth.users` se crea su fila en
      `perfiles`. Es la deuda que T-000 dejó anotada («un usuario creado a mano en Studio
      no tendrá perfil»).
- [ ] **Políticas del dominio Organización**: `organizacion` y `centros` legibles por los
      tres roles; escritura solo administrador. `perfiles`: lectura propia siempre, y
      lectura del directorio según la matriz. **Ninguna política sobre `perfiles` invoca
      `rol_actual()`** — regla permanente.
- [ ] **Políticas de `pacientes`**: administrador total; profesional los suyos vía
      `es_profesional_asignado()`; técnico administrativo **el subconjunto de lectura**
      acotado a su centro.
- [ ] **Políticas de `pacientes_identificacion`**: administrador total, profesional los
      suyos, **técnico sin acceso** (ni una fila).
- [ ] **Políticas del contenido clínico** —`episodios_asistenciales`, `diagnosticos`,
      `valoraciones_riesgo`, `notas_clinicas`, `notas_clinicas_versiones`, `evaluaciones`,
      `evaluacion_archivos`, `informes`— **exigiendo `historia_desbloqueada()` además del
      resto** (ADR-026). El administrador **no ve notas ajenas** (decisión 5); el
      profesional, como autor o asignado.
- [ ] **Riesgo para el técnico**: nunca la fila de `valoraciones_riesgo`. El indicador
      binario sale de columna o vista derivada, no de un `select` filtrado en la
      aplicación (decisión 6, invariante 3).
- [ ] **Nota conjunta** (ADR-030): visible para el profesional de **cualquier**
      participante del episodio, por participación y no por copia.
- [ ] **Acceso del representante legal** (ADR-028) y su restricción por defecto a partir
      de los 16 años, levantable por el profesional dejando constancia.
- [ ] **`alertas_documentacion` queda fuera del candado**: se lee sin desbloqueo, porque
      son recuentos y estados, no contenido (ADR-026, choque 11).
- [ ] **`pines_historia` y `desbloqueos_historia`**: sin `select` para nadie; se tocan solo
      por funciones `security definer` (fijar PIN, verificar PIN, desbloquear, bloquear,
      prolongar). **Ninguna de sus políticas invoca `historia_desbloqueada()`** — sin
      recursión por construcción.
- [ ] **Bloqueo por intentos** dentro de la función de verificación: cinco fallos, quince
      minutos, entrada en `auditoria` y notificación al titular. El contador vive en la
      base, no en la sesión. El PIN viaja **como parámetro ligado**, jamás interpolado.

## Criterios de aceptación (verificables)

Todos con sesión simulada (`set local role authenticated` + `request.jwt.claims`), en el
guion SQL de este ticket. La batería completa por rol es T-003.

- [ ] **Automático** — `npx supabase db reset`, `npm run lint` y `npm run build` limpios.
- [ ] **Automático** — el `tecnico_administrativo` obtiene **cero filas** de
      `pacientes_identificacion`, `notas_clinicas`, `notas_clinicas_versiones`,
      `episodios_asistenciales`, `diagnosticos`, `valoraciones_riesgo`, `evaluaciones`,
      `evaluacion_archivos` e `informes`.
- [ ] **Automático** — el técnico de un centro **no ve** los pacientes de otro centro; el
      profesional **sí** ve a los suyos aunque estén en otro centro (ADR-033).
- [ ] **Automático** — el `administrador` obtiene **cero filas** de `notas_clinicas` de
      otro profesional, incluso con desbloqueo vigente.
- [ ] **Automático** — el profesional asignado **sin desbloqueo vigente** obtiene **cero
      filas** de `notas_clinicas`; tras desbloquear, las suyas; tras `bloquear`, cero otra
      vez (prueba negativa del ADR-026).
- [ ] **Automático** — el mismo profesional **sí** lee `alertas_documentacion` sin
      desbloqueo alguno.
- [ ] **Automático** — un paciente `fusionado_en` otro es legible por el profesional del
      **superviviente**, en un solo salto, y crear una cadena de dos saltos es imposible.
- [ ] **Automático** — un profesional con `estado = 'baja'` obtiene **cero filas** de sus
      propios pacientes y de sus propias notas.
- [ ] **Automático** — el profesional de **cualquier** participante de un episodio conjunto
      lee la nota conjunta; un profesional ajeno al episodio, cero filas.
- [ ] **Automático** — cinco verificaciones fallidas de PIN dejan el PIN bloqueado, generan
      su entrada en `auditoria`, y la sexta **no** desbloquea aunque el PIN sea correcto.
- [ ] **Automático** — `select` directo sobre `pines_historia` como `authenticated` falla
      con permiso denegado, con y sin desbloqueo vigente.
- [ ] **Automático** — ninguna política sobre `perfiles`, `pines_historia` ni
      `desbloqueos_historia` menciona `rol_actual()` ni `historia_desbloqueada()`
      (comprobable con `select ... from pg_policies`).

## Guion de comprobación manual

1. `npx supabase db reset` y `npm run dev`.
2. Entra con el profesional sembrado y abre `/pacientes`: sigue viendo solo los suyos.
3. En Studio, ejecuta el guion SQL del ticket y comprueba que **el bloque de desbloqueo
   caduca solo** esperando la ventana o adelantando la caducidad a mano.

## Notas para el agente

- **`(select auth.uid())` siempre entre paréntesis** → InitPlan, una evaluación por
  sentencia y no por fila. Patrón de proyecto, no preferencia.
- Una política que lo deniega todo **también pasa** una prueba negativa. Cada criterio
  negativo lleva su gemelo positivo, o no prueba nada.
- **La ventana de desbloqueo se prolonga en Server Actions, jamás en el renderizado**
  (ADR-026). Aquí solo se escriben las funciones; quien las llama es T-006 y la fase 1.
- Nada de guardar el rol en el JWT: quedaría cacheado hasta la renovación y revocar un rol
  no tendría efecto inmediato (T-000 §Diseño, descartado con motivo).
- Las políticas se leen como frases o están mal escritas. Si una necesita un comentario
  para entenderse, el comentario va en la migración.
- **Cada política que escribas aquí tiene su prueba en T-003.** Una política sin test es
  código no escrito (`architecture.md` §RLS): deja la lista de las que añades para que
  T-003 no tenga que deducirla.
