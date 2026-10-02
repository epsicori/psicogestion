---
id: T-015
titulo: Avisos — sesión en curso, notificaciones y escalado de la nota pendiente
modelo: opus   # subido el 02-10-2026: migración con RLS, disparadores y pg_cron = riesgo alto
fase: 1
prioridad: alta
depende_de: [T-010, T-014]
estado: pendiente
riesgo: alto
territorio:   # del diseño §6 (02-10-2026), con P1 y P4 decididas
  - supabase/migrations/20261006120000_avisos_y_escalado.sql
  - lib/supabase/tipos-bd.ts
  - lib/citas/avisos.ts
  - lib/citas/agenda.ts
  - lib/agenda/avisos.ts
  - lib/agenda/avisos.test.ts
  - lib/i18n/es.ts
  - components/armazon/armazon.tsx
  - components/armazon/armazon-cliente.tsx
  - components/armazon/aviso-sesion.tsx
  - components/armazon/aviso-sesion.test.tsx
  - components/armazon/aviso-notas.tsx
  - components/armazon/campana.tsx
  - components/armazon/campana.test.tsx
  - components/armazon/acciones-avisos.ts
  - components/armazon/acciones-avisos.test.ts
  - components/armazon/avisos-constantes.ts
  - app/(app)/agenda/bloques.ts
  - app/(app)/agenda/bloques.test.ts
  - app/(app)/agenda/documentacion.tsx
  - app/(app)/agenda/documentacion.test.tsx
  - app/(app)/agenda/esquema-alertas.ts
  - app/(app)/agenda/acciones-alertas.ts
  - app/(app)/agenda/acciones-alertas.test.ts
  - app/(app)/agenda/resolver-alerta.tsx
  - scripts/rls/22-avisos.sql
  - scripts/rls/README.md
  - scripts/rls/11-cobertura.sql        # solo si hay que declarar algo nuevo
  - accesibilidad/avisos.spec.ts
  - docs/bitacora/T-015.md
  - docs/state.md
  - docs/interfaz.md                    # solo §Armazón: la campana y los avisos ya existen
---

# Contexto

Cierra el recorrido. T-014 pinta el estado en el calendario y T-012 escribe la nota; falta
lo que empuja: el aviso que aparece cuando empieza la sesión y el que insiste cuando la
nota no se ha hecho.

Trae además una deuda anotada en `docs/state.md`: **la tabla `notificaciones` no existe**,
y la necesitan también el acceso de emergencia y los cinco fallos de PIN.

Es `sonnet` **con revisión de Opus** —toca una tabla nueva y sus políticas— y va
sobre-especificado.

Sección: `docs/interfaz.md` §Armazón («todavía no está: la campana de notificaciones») y
§Lo que el prototipo no cubre. ADR **047** (el aviso no interrumpe), **045** («en curso»
calculado), **038** (las notificaciones internas viven en la aplicación, **nunca** en el
correo, y jamás llevan contenido clínico), **024** (outbox), **041** (WCAG), **054**
(lenguaje claro: el `titulo` y el `cuerpo` de cada notificación se redactan sin jerga,
frase corta y verbo activo — «Falta firmar la nota de ayer», no «Documentación pendiente de
cumplimentación»).

## Tareas

- [ ] **Tabla `notificaciones`**: `destinatario_id`, `tipo`, `origen_tabla`, `origen_id`,
      `creada_en`, `leida_en`, `titulo`, `cuerpo`. **Nunca contenido clínico dentro**
      (ADR-038): «Nota pendiente de la sesión del 25/08», no el motivo de consulta.
      - RLS: cada uno **solo** las suyas. Marcar como leída es el único `update`
        permitido, y solo sobre `leida_en`.
      - Auditoría con `fn_auditar()`.
      - Tipos de partida: `nota_pendiente`, `nota_pendiente_escalada`, `acceso_emergencia`,
        `pin_bloqueado`.
- [ ] **Aviso de sesión en curso**, **no modal** (ADR-047): franja que aparece al empezar
      la cita, con paciente, hora y botón «Notas» hacia
      `/pacientes/<uuid>/historia/notas?cita=<uuid>`.
      - **No roba el foco.** Se anuncia con `role="status"` y `aria-live="polite"`, nunca
        con `alert`.
      - Se descarta y **no vuelve**; el descarte se recuerda por sesión de navegador.
      - **Ancla persistente en la cabecera** mientras la sesión dure, aunque la franja se
        haya descartado.
      - **Nada de diálogo modal disparado por el reloj**, ni aquí ni en ninguna pantalla.
- [ ] **El instante baja resuelto desde servidor**, como el saludo del armazón. El cliente
      solo cuenta hacia delante desde lo que recibió; **ni un `new Date()` para el primer
      pintado**.
- [ ] **Escalado de la nota pendiente en tres tiempos**, sobre `alertas_documentacion`
      (T-010), **nunca sobre `notas_clinicas`**:

      | Nivel | Cuándo | Dónde se ve |
      |---|---|---|
      | 1 | Al pasar el fin de la cita | Discreto, en el panel derecho de Agenda y en la ficha de la cita |
      | 2 | A las 24 h | Destacado en la cabecera, con recuento |
      | 3 | A las 72 h | Notifica al **administrador** |

      Los umbrales son **configurables por centro**, con esos valores por defecto. Tres
      tiempos, porque una alerta que siempre está encendida deja de leerse a la semana.
- [ ] **La cabecera muestra el aviso persistente de notas pendientes con su recuento.** Es
      lo primero que se ve y lo último que desaparece. El recuento sale de
      `alertas_documentacion` y **cuenta lo que el rol puede ver** —no el total de la
      organización (choque 2).
- [ ] **Campana de notificaciones** en el armazón, con el desplegable de T-007: no leídas
      primero, marcar como leída, y ninguna acción destructiva.
- [ ] **El escalado a nivel 3 crea la notificación al administrador** sin exponerle nada
      clínico: sabe que hay una nota pendiente, de qué profesional y desde cuándo. **No
      sabe de qué paciente**, porque no puede leer esa historia (decisión 5).
- [ ] Server Actions para descartar la franja, marcar notificaciones leídas y resolver una
      alerta. Nada de mutaciones en el render.

## Criterios de aceptación (verificables)

- [ ] **Manual** — con una cita que abarque la hora actual, aparece la franja «Sesión en
      curso · [paciente] · Notas» **sin robar el foco**: se puede seguir escribiendo en el
      campo que estuviera activo.
- [ ] **Manual** — descartar la franja y navegar: el **ancla de cabecera sigue ahí**; la
      franja no vuelve.
- [ ] **Manual** — con un lector de pantalla, la franja se anuncia una vez y no interrumpe
      la lectura en curso.
- [ ] **Automático** — una cita `realizada` de ayer sin nota firmada genera alerta de
      **nivel 2** y sube el recuento de la cabecera.
- [ ] **Automático** — a las 72 h se crea **una** fila en `notificaciones` para el
      administrador, y su `cuerpo` **no contiene** nombre de paciente ni dato clínico.
- [ ] **Automático** — como `profesional_sanitario`: cero filas de notificaciones ajenas.
- [ ] **Automático** — `update notificaciones set titulo = 'x'` **falla**; marcar `leida_en`
      **entra**.
- [ ] **Automático** — el recuento de la cabecera de un profesional **no** incluye alertas
      de otro profesional.
- [ ] **Manual** — a 360 px la franja no tapa la acción primaria de la pantalla ni el
      teclado virtual.
- [ ] **Manual** — `/agenda` y la cabecera al lado de `/prototipo`: mismo vocabulario, sin
      controles de adorno.
- [ ] **Automático** — `npm run lint && npm run build` limpios, y el verificador de
      accesibilidad de T-009 en verde.

## Guion de comprobación manual

1. `npm run dev` y ajustar una cita del seed para que empiece en un minuto.
2. Quedarse escribiendo en un campo cualquiera y esperar: la franja aparece y **el cursor
   no se mueve**.
3. Descartarla, navegar a `/pacientes` y comprobar el ancla de cabecera.
4. Marcar una cita de ayer como `realizada` sin nota y comprobar el recuento.
5. Entrar como administrador y comprobar la notificación de nivel 3 y que no dice de quién.

## Notas para el agente

- **El aviso informa; no bloquea.** Nada de impedir cerrar la aplicación, ni de modales, ni
  de deshabilitar la navegación porque falte una nota. La obligación se recuerda, no se
  impone a golpe de interfaz.
- **`alertas_documentacion` vive fuera del candado a propósito**: alimenta contadores, no
  contenido. Un candado que tapa los contadores se queda abierto todo el día.
- Los umbrales por centro se leen de la configuración; si el centro no los fija, hereda de
  la organización y **nunca resuelve a nulo** (patrón de `retencion_efectiva()`, T-001).
- Quien calcula el escalado —una función de Postgres sobre `alertas_documentacion` o el
  consumidor del outbox— lo decide el diseño. Lo que no vale es que esté en los dos sitios.
- No toques `notas_clinicas` desde aquí. Ni para leer.

## Heredado de T-011a · qué significa que un evento esté «entregado»

**Añadido el 11-09-2026, decisión del propietario sobre el hallazgo 3 de la revisión con
Opus de T-011a.** No es un arreglo pendiente: es una pregunta que este ticket tiene que
contestar cuando escriba el consumidor del outbox.

`agenda_propuestas_de_evento()` (T-011a) marca el evento **`entregado`** al terminar,
aunque solo haya procesado una parte de sus citas. Es deliberado y correcto por dentro: un
evento de `agenda.zona_centro_cambiada` afecta a citas de varios profesionales, y el
llamante omite las que no le tocan en vez de abortar el lote — omitir es lo que evita que
un profesional falle por culpa de la agenda de otro.

    for v_cita_id in select ... citas_afectadas loop
      ...
      if not (autorizado) then
        continue;          -- se omite la que no le toca
      end if;
      ...
    end loop;

    update public.eventos_salientes
       set estado = 'entregado', actualizado_en = now()
     where id = p_evento_id;

Hoy no se pierde nada, porque la función **no mira el estado**: el siguiente profesional
que la llame todavía crea sus propuestas. El problema aparece **cuando este ticket escriba
el consumidor**: un barrido que salte los `entregado` no volverá a mirar un evento
procesado a medias, y las citas de los demás profesionales se quedarán sin proponer, en
silencio.

**Lo que hay que decidir aquí, y dejar escrito en el comentario de la función**: o
`entregado` significa «se procesó entero» —y entonces la marca se pone solo si no quedan
citas del evento sin propuesta, con un estado intermedio para lo demás—, o significa
«alguien lo procesó» —y entonces el barrido no puede usar el estado como filtro—. Lo que
no vale es que el comentario diga una cosa y el consumidor suponga la otra.

**Cuando se toque, hace falta una negativa**: un evento con citas de dos profesionales,
procesado por uno, y la comprobación de que las del otro **siguen alcanzables** por el
camino que este ticket elija. Sin esa prueba el arreglo está escrito, no hecho.
