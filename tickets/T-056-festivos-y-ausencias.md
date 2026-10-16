---
id: T-056
titulo: Festivos y ausencias. Días sin consulta por centro (nacionales, autonómicos, locales y cierres) y vacaciones del profesional; el alta avisa y deja agendar, las sugerencias no los proponen
modelo: opus
riesgo: alto            # esquema, RLS y auditoría de una tabla nueva (T-056a); T-056b es interfaz, riesgo medio
fase: 2
prioridad: alta         # etapa 2 de docs/plan-puesta-en-marcha.md: pieza del primer día
depende_de: [T-055a]    # reutiliza agenda_horario_del_dia, la pura del aviso y p_aceptar_aviso; T-056b depende también de T-055b
estado: pendiente
delegable: parcial      # solo en T-056b: textos de i18n y la lista de pintura (diseño §7)
partido_en: [T-056a, T-056b]   # propuesta del arquitecto; ver «Partición»
territorio:
  # T-056a
  - supabase/migrations/20261020120000_festivos_y_cierres.sql
  - supabase/seed-completo.sql                  # festivos y un cierre inventados
  - scripts/rls/38-festivos-y-cierres.sql
  - scripts/rls/11-cobertura.sql                # las cuatro políticas de la tabla nueva
  - scripts/rls/README.md                       # fila del módulo 38 y su ancla Y+16
  - lib/supabase/tipos-bd.ts
  - lib/agenda/aviso-horario.ts                 # variante dia_sin_consulta
  - lib/agenda/aviso-horario.test.ts
  - tickets/T-056/mutantes.json
  - tickets/T-056/mutantes/
  # T-056b
  - lib/citas/horario.ts                        # el Zod admite dias_sin_consulta
  - lib/citas/horario.test.ts
  - lib/citas/festivos.ts
  - lib/citas/festivos.test.ts
  - lib/citas/franjas.ts                        # vacaciones (ausencias de día entero)
  - lib/citas/franjas.test.ts
  - app/(app)/agenda/nueva/aviso-horario.tsx    # el texto de la variante nueva
  - app/(app)/ajustes/page.tsx                  # el enlace a «Festivos»
  - app/(app)/ajustes/festivos/
  - app/(app)/ajustes/horario/                  # sección de vacaciones
  - lib/i18n/es.ts
  # los dos
  - docs/architecture.md                        # fila «Días sin consulta» de la matriz
  - docs/interfaz.md
  - docs/bitacora/T-056a.md
  - docs/bitacora/T-056b.md
  - docs/state.md
---

# Contexto

En la entrevista del 16-10-2026 (`docs/plan-puesta-en-marcha.md`) el propietario decidió:

- Hay festivos nacionales, autonómicos y locales, que pueden ser distintos en cada centro. Además, vacaciones del profesional y cierres de centro.
- En un festivo, la app **avisa y deja agendar**, con el mismo aviso que T-055. Las sugerencias de hueco nunca proponen esos días.

Hoy solo existe el festivo **por profesional** (`disponibilidad.tipo = 'festivo'`, de T-010). No hay festivos ni cierres de centro: el festivo local de Madrid habría que darlo de alta a mano para cada profesional. Las vacaciones sí caben: son ausencias de día entero (`tipo = 'ausencia'`), con centro nulo si valen para todos.

Este ticket añade la tabla `dias_sin_consulta` por centro, la mete en los huecos, en el bloqueo del alta y en el horario del día de T-055 (T-056a), y pone las pantallas para gestionarla y para las vacaciones (T-056b).

**Datos inventados.** El propietario no ha entregado ni los festivos locales ni el calendario laboral de cada centro. La siembra pone los nacionales y autonómicos públicos de 2026 y 2027 y un local y un cierre **inventados**, y lo dice en un comentario y en el nombre.

# Partición (propuesta del arquitecto)

| Parte | Qué | Riesgo | Depende de |
|---|---|---|---|
| **T-056a** | Migración, RLS, auditoría, funciones, banco 38, mutantes, variante del aviso, siembra | alto | T-055a |
| **T-056b** | Ajustes › Festivos (administrador), vacaciones en Ajustes › Horario, texto del aviso | medio | T-056a y T-055b |

T-056a puede ir en paralelo con T-055b: no comparten ficheros.

# Tareas

## T-056a
- [ ] Migración `20261020120000_festivos_y_cierres.sql` (diseño §1.A.1): tipo `clase_dia_sin_consulta`, tabla `dias_sin_consulta` con checks, unicidad, disparador, RLS, grants y auditoría. Además, `agenda_bloques_profesional`, `alta_bloqueo_disponibilidad` y `agenda_horario_del_dia` la tienen en cuenta.
- [ ] Variante `dia_sin_consulta` en `lib/agenda/aviso-horario.ts`, con sus pruebas.
- [ ] Banco `scripts/rls/38-festivos-y-cierres.sql`, las cuatro políticas en `11-cobertura.sql`, la fila del README y `tickets/T-056/mutantes.json`.
- [ ] Siembra marcada como inventada (diseño §1.A.4).
- [ ] `npm run tipos`, la fila de la matriz en `docs/architecture.md`, la bitácora y `state.md`.

## T-056b
- [ ] Ajustes › Festivos (`/ajustes/festivos`, solo el administrador): lista por centro y año, alta, corrección y baja.
- [ ] Vacaciones en Ajustes › Horario: desde, hasta, centro opcional (vacío = todos) y motivo opcional. Lista y cierre.
- [ ] El aviso del alta nombra el día sin consulta: «Festivo local: <nombre>» o «Centro cerrado: <nombre>».
- [ ] `docs/interfaz.md`, la bitácora y `state.md`.

# Criterios de aceptación (verificables)

## T-056a
- [ ] **Automático.** `npx supabase db reset && npm run test:rls`: exit 0, con `max(version)` = `20261020120000` y el módulo 38 dentro. Lo pega el verificador.
- [ ] **Automático.** `npm run seed && npm run test:rls`: exit 0. `npm run seed` dos veces seguidas no da error.
- [ ] **Automático, mutantes.** `tickets/T-056/mutantes.json` lleva al menos los diez del diseño §1.A.5, todos muertos, con la aserción en la que cae cada uno.
- [ ] **Automático.** `npx vitest run lib/agenda/aviso-horario.test.ts` en verde, con la variante nueva primera en el orden y un cierre de varios días que avisa en su último día.
- [ ] **Automático.** En verde: `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx tsc --noEmit` y `npx next build --webpack`. `npm run verificar:huellas` dice «cadena íntegra».
- [ ] **QA visible (verificador, navegador a la vista)**, con `qa.mjs visita /agenda/nueva`.
  - Como Ana en Madrid: el día de la «Fiesta local (inventada)» y los cinco días del «Cierre por obras (inventado)» no ofrecen huecos, y el día anterior y el siguiente sí.
  - Como Ana en Las Palmas: el sábado de la «Fiesta local (inventada)» de Las Palmas no ofrece huecos, y el sábado anterior y el siguiente sí. El jueves de la fiesta de Madrid no afecta a Las Palmas.
  - Capturas en `.claude/qa/visitas/T-056a/`.

## T-056b
- [ ] **Automático.** Pruebas de acción y componente en verde:
  - el técnico y el profesional reciben `notFound` en `/ajustes/festivos`;
  - el alta de un día sin consulta duplicado da un mensaje claro;
  - el aviso del alta nombra el día sin consulta.
- [ ] **Automático.** En verde: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npx next build --webpack` y `npm run test:rls`.
- [ ] **QA visible (verificador, navegador a la vista).** Capturas a 1280 y 360 px en `.claude/qa/visitas/T-056b/`, con `qa.mjs visita /ajustes/festivos /ajustes/horario /agenda/nueva`.
  - **Como administrador:** da de alta un festivo local en Las Palmas.
  - **Como Ana:**
    - el alta en ese día avisa nombrándolo y «Agendar igualmente» crea la cita;
    - registra unas vacaciones de tres días, y en el alta esos días no ofrecen huecos.
  - **Como técnico:** no ve «Festivos» en Ajustes.
  - Sin errores de consola, sin desplazamiento horizontal a 360 px y con el foco visible.

# Notas para el agente

- Se parte de la versión de T-055a de `agenda_bloques_profesional`, `alta_bloqueo_disponibilidad` y `agenda_horario_del_dia`, no de las anteriores.
- **Un cierre de centro devuelve `'festivo'` en `alta_bloqueo_disponibilidad`.** Así no cambian los enums de propuesta ni de desviación de la serie (diseño D3).
- Tabla nueva: `alter default privileges` ya revoca. Aun así, revoke y grant explícitos, y se comprueba con `\dp public.dias_sin_consulta`.
- Las fechas de la siembra que dependen de hoy se calculan con `current_date` e `isodow`, como el festivo de T-028.

# Preguntas abiertas al propietario (con recomendación)

1. **¿Los festivos se dan de alta por centro, también los nacionales?** *Recomendación: sí, por centro.* Un nacional se da de alta en cada centro (son dos filas). Es más simple y deja quitar uno en un centro concreto si un año se traslada.
2. **¿Las vacaciones valen para todos los centros por defecto?** *Recomendación: sí, con la opción de limitarlas a uno.* Las vacaciones son de la persona, no del centro.
3. **¿Quién da de alta los festivos y los cierres?** *Recomendación: solo el administrador.* Afectan a todos los profesionales del centro. El profesional ve la lista y el técnico solo la de sus centros.
4. **¿Un cierre de centro puede contarse como «festivo» en las propuestas de serie?** *Recomendación: sí.* La sesión de serie que cae en un cierre se propone con alternativa, igual que en un festivo. Distinguirlos obliga a cambiar los enums de la serie, y el resultado práctico es el mismo.
5. **Los festivos locales y el calendario laboral de cada centro.** No es una pregunta, es el recordatorio del punto 3 del plan. Hasta que lleguen, el festivo local y el cierre sembrados son inventados.

# Lo que no entra, y por qué

- **Importar festivos de un calendario oficial (BOE o boletines autonómicos) o de un .ics.** Son pocas filas al año y las da de alta el administrador. El importador de agenda es otra pieza del plan.
- **Festivos recurrentes («todos los 1 de enero»).** Se da de alta cada año. Una regla de recurrencia no cubre los que se trasladan (Semana Santa, festivos movidos a lunes).
- **Avisar de las citas ya dadas cuando se crea un festivo o un cierre encima.** Es útil, pero es otra pieza: un aviso de bandeja. Se anota en `state.md` como candidato.
- **Cambiar la serie para distinguir el cierre del festivo** (pregunta 4).
- **Retirar `disponibilidad.tipo = 'festivo'`**: lo usan los bancos 16, 17, 21, 23 y 29. Queda como legado; la interfaz ya no lo crea.
