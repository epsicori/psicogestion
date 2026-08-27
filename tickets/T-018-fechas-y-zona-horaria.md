---
id: T-018
titulo: Utilidades de fecha, zona horaria y semana — funciones puras
modelo: sonnet
fase: 0
prioridad: alta
depende_de: [T-016]
estado: pendiente
---

# Contexto

El ADR-034 mete `zona_horaria` en organización y centro, y deja para **T-011** lo caro:
`hora_local` en la serie, instantánea de zona en la cita y **las anomalías de marzo y
octubre marcadas como desviación**. **T-014** formatea las horas de la semana con
`@date-fns/tz`, que **hoy ni siquiera está instalado**.

Los dos son `opus` y los dos empezarían por escribir las mismas cuatro funciones de
calendario. Este ticket las escribe antes, **puras y probadas**, para que T-011 y T-014
gasten su presupuesto de diseño en lo que sí es suyo: el modelo de la serie y la pantalla.

**Este ticket no decide nada del dominio.** No dice cómo se guarda una serie, ni qué
cuenta como desviación, ni qué pinta el calendario. Entrega aritmética de calendario con
zona, comprobable con un reloj fijo. No toca la base de datos, ni RLS, ni ninguna pantalla.

Referencias: ADR **034** (zona horaria en organización y centro, nombres IANA), ADR **045**
(«en curso» se calcula en servidor, en la zona del centro, **nunca con `new Date()` en
cliente»). Sin sección de `interfaz.md`: no dibuja.

## Tareas

- [ ] Instalar **`@date-fns/tz`** como dependencia de producción, anclada de versión. Es la
      única dependencia nueva que este ticket permite. `date-fns` v4 ya está.
- [ ] `lib/fechas/` con módulos por asunto y un `index.ts` que reexporte. **Toda función
      recibe el instante actual como parámetro** —`ahora: Date`— y **ninguna llama a
      `new Date()` sin argumentos ni a `Date.now()`**. Un reloj implícito es una función
      que no se puede probar y una decisión que se toma en el cliente.
- [ ] **Zona**: `esZonaHorariaValida(zona)` contra la lista que expone la plataforma
      (`Intl.supportedValuesOf('timeZone')`), no contra una lista escrita a mano. Y
      `resolverZona(zonaDelCentro, zonaDeLaOrganizacion)`, que implementa la **herencia**
      del ADR-034: el centro manda, la organización es el valor por defecto, y **un nulo en
      los dos es un error explícito, no un `UTC` silencioso**.
- [ ] **Formateo en zona**: hora, fecha corta, fecha larga y rango («10:00 – 10:50»), todos
      con el `locale` `es` de `date-fns` y una zona IANA explícita. Ninguna función de
      formateo usa la zona del sistema.
- [ ] **Semana**: `limitesDeSemana(fecha, zona)` devolviendo inicio y fin con la semana
      empezando en **lunes**, y `diasDeSemana(fecha, zona)` con los siete días. Son los
      límites que T-014 pedirá a la base de datos, así que devuelven **instantes**, no
      cadenas.
- [ ] **Anomalías del cambio de hora**, que es la parte que existe por el ADR-034.
      `clasificarHoraLocal(fechaLocal, horaLocal, zona)` devuelve **uno de tres**:
      - `normal` — la hora local existe una sola vez;
      - `inexistente` — cae en el salto de marzo (en `Europe/Madrid`, las 02:30 del último
        domingo de marzo **no existen**);
      - `ambigua` — cae en el solape de octubre y ocurre **dos veces**.
      Devuelve además los instantes candidatos: ninguno, uno o dos. **La función clasifica
      y no decide**: qué hace la aplicación con una cita ambigua lo decide T-011.
- [ ] **Duración y solape**: `duracionEnMinutos(inicio, fin)` y
      `seSolapan(a, b)` con la convención de intervalo **semiabierto** —`[inicio, fin)`—
      declarada en un comentario. Dos citas consecutivas a las 10:00-10:50 y 10:50-11:40
      **no** se solapan. Esta convención la heredará la restricción de exclusión de T-010:
      si aquí se decide cerrada, allí sobran conflictos falsos.
- [ ] **`estaEnCurso(inicio, fin, ahora)`**, la mitad de reloj del ADR-045: sin estados,
      sin cita, sin base de datos. Solo el intervalo y el instante. La otra mitad —qué
      estados anulan «en curso»— es de **T-020**.
- [ ] Pruebas con el banco de **T-016**, con **reloj fijo** (`vi.setSystemTime`) y zonas
      explícitas. Casos obligatorios: 29 de marzo de 2026 a las 02:30 en `Europe/Madrid`
      (inexistente), 25 de octubre de 2026 a las 02:30 en `Europe/Madrid` (ambigua, dos
      instantes separados por una hora), una semana que **cruza** el cambio de hora y por
      tanto no dura 168 horas, `Atlantic/Canary` frente a `Europe/Madrid` a la misma hora
      absoluta, y el 29 de febrero.
- [ ] Ejecuta la suite además con `TZ=America/New_York` y comprueba que **da lo mismo**. Si
      un resultado cambia con la zona del sistema, hay una llamada implícita al reloj.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm test` en verde, y **también** en verde con `TZ=UTC` y con
      `TZ=America/New_York`. Los tres se pegan en el PR.
- [ ] **Automático** — `clasificarHoraLocal('2026-03-29', '02:30', 'Europe/Madrid')`
      devuelve `inexistente` con cero candidatos.
- [ ] **Automático** — `clasificarHoraLocal('2026-10-25', '02:30', 'Europe/Madrid')`
      devuelve `ambigua` con **dos** candidatos separados por 3 600 000 ms.
- [ ] **Automático** — `limitesDeSemana` sobre la semana del cambio de octubre devuelve un
      rango de **169** horas; sobre la de marzo, de **167**.
- [ ] **Automático** — `resolverZona(null, null)` **lanza**; `resolverZona(null, 'Europe/Madrid')`
      devuelve la de la organización; `resolverZona('Atlantic/Canary', 'Europe/Madrid')`
      devuelve la del centro.
- [ ] **Automático** — `esZonaHorariaValida('Europe/Madrid')` es cierto y
      `esZonaHorariaValida('CET')` y `esZonaHorariaValida('Madrid')` son falsos.
- [ ] **Automático** — `seSolapan` devuelve falso para 10:00-10:50 y 10:50-11:40.
- [ ] **Automático** — `grep -rn "new Date()\|Date.now()\|supabase" lib/fechas/` devuelve
      **cero** resultados (`new Date(algo)` con argumento sí vale).
- [ ] **Automático** — `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. `npm test` — verde.
2. `TZ=America/New_York npm test` — verde e **idéntico**.
3. Cambiar la fecha del caso de marzo por un día cualquiera y volver a lanzar: la
   clasificación pasa a `normal` y el caso falla. Revertir.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.**
- **`@date-fns/tz` no es `date-fns-tz`.** Son paquetes distintos; el primero es el de
  `date-fns` v4 y el que nombra el plan. Lee su README instalado antes de escribir código:
  la API no es la que traes aprendida.
- **No modeles la cita, ni la serie, ni la regla de recurrencia.** Si te tienta escribir
  RRULE, para: es **T-011**, y es `opus` por un motivo. Anótalo en `docs/state.md`
  §Hallazgos anotados y sigue (constitución, regla 2).
- **No toques `supabase/`, `docs/architecture.md`, `docs/decisions.md` ni ninguna
  pantalla.** Este ticket añade `lib/fechas/`, sus pruebas y una dependencia.
- Los nombres de día y mes en castellano salen del `locale` de `date-fns`, **no** de un
  array escrito a mano.
