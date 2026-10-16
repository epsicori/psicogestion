---
id: T-055
titulo: Disponibilidad por centro. Franjas semanales por profesional y centro, con vigencia; el alta avisa fuera de horario y deja agendar
modelo: opus
riesgo: alto            # esquema, RLS y funciones de alta (T-055a); T-055b es interfaz, riesgo medio
fase: 2
prioridad: alta         # etapa 2 de docs/plan-puesta-en-marcha.md: pieza del primer día
depende_de: [T-053]     # solo por el orden de migraciones: la de T-053 es 20261018120000
estado: pendiente
delegable: parcial      # solo en T-055b: textos de i18n y la tabla de pintura (diseño §7)
partido_en: [T-055a, T-055b]   # propuesta del arquitecto; ver «Partición»
territorio:
  # T-055a
  - supabase/migrations/20261019120000_disponibilidad_por_centro.sql
  - supabase/seed-completo.sql                  # dos franjas inventadas en Las Palmas
  - scripts/rls/37-disponibilidad-por-centro.sql
  - scripts/rls/README.md                       # fila del módulo 37 y su ancla Y+15
  - scripts/rls/23-cita-en-episodio.sql         # la firma de agenda_crear_cita pasa de 11 a 12 argumentos
  - lib/supabase/tipos-bd.ts                    # se regenera (firma nueva de agenda_crear_cita y la función nueva)
  - lib/agenda/aviso-horario.ts                 # la función pura del aviso
  - lib/agenda/aviso-horario.test.ts
  - tickets/T-055/mutantes.json
  - tickets/T-055/mutantes/
  # T-055b
  - lib/citas/horario.ts                        # lector de agenda_horario_del_dia, con Zod
  - lib/citas/horario.test.ts
  - lib/citas/franjas.ts                        # Server-side de la pantalla de franjas
  - lib/citas/franjas.test.ts
  - lib/citas/alta.ts
  - lib/citas/esquemas.ts
  - lib/citas/esquemas.test.ts
  - lib/citas/errores.ts
  - lib/citas/errores.test.ts
  - app/(app)/agenda/nueva/                      # «Otra hora» y el aviso de horario
  - app/(app)/agenda/dialogo-reprogramar.tsx     # solo si P3 = sí
  - app/(app)/agenda/acciones.ts                 # solo si P3 = sí
  - app/(app)/ajustes/page.tsx                   # el enlace a «Horario»
  - app/(app)/ajustes/horario/
  - lib/i18n/es.ts
  # los dos
  - docs/architecture.md                        # fila «Disponibilidad» de la matriz
  - docs/interfaz.md                            # «Otra hora», aviso y Ajustes › Horario (T-055b)
  - docs/bitacora/T-055a.md
  - docs/bitacora/T-055b.md
  - docs/state.md
---

# Contexto

En la entrevista del 16-10-2026 (`docs/plan-puesta-en-marcha.md`, tabla del principio) el propietario decidió:

- La disponibilidad **varía por centro**: días y franjas distintos en cada uno, con vigencia.
- **Fuera de horario la app avisa y deja agendar.** Las sugerencias de hueco nunca proponen esos momentos.

La tabla `disponibilidad` ya existe desde T-010 (`supabase/migrations/20260906120000_agenda_esquema.sql:343`). Cuatro cosas no cuadran con la decisión:

1. **Una franja puede no tener centro ni `desde`.** `agenda_bloques_profesional` acepta franjas con `centro_id` nulo, que valen en todos los centros. Una franja con `desde` nulo nunca se usa, pero sí se puede guardar.
2. **No hay nada que impida dos franjas solapadas** del mismo profesional en el mismo centro y el mismo día.
3. **La lectura está abierta a los tres roles**, `motivo` de las ausencias incluido. Cualquier perfil escribe sus propias filas, también el técnico. La zona de cada fila la elige quien escribe y puede no ser la del centro. `creado_por` lo pone el llamante.
4. **El alta solo deja elegir horas que están dentro de una franja.** El formulario (`app/(app)/agenda/nueva/formulario-alta.tsx`) ofrece únicamente los huecos de `agenda_bloques_profesional`. Hoy no hay forma de dar una cita fuera de horario, y `agenda_crear_cita` rechaza con 22023 un día con festivo o ausencia del profesional. «Avisa y deja agendar» no existe.

Este ticket corrige el esquema y la lectura (T-055a) y pone en el alta la vía «otra hora», con un aviso y la confirmación explícita (T-055b). Los festivos de centro y los cierres son T-056, que reutiliza el mismo aviso.

**Datos inventados.** El propietario aún no ha entregado el horario de sus centros (punto 3 de lo que bloquea en el plan). La siembra añade franjas **inventadas** y lo dice en un comentario. Cuando llegue el horario real, se da de alta desde la pantalla de T-055b; no hace falta otro ticket.

# Partición (propuesta del arquitecto)

| Parte | Qué | Riesgo | Depende de |
|---|---|---|---|
| **T-055a** | Migración, RLS, funciones, banco 37, mutantes, función pura del aviso, siembra | alto | T-053 (orden de migraciones) |
| **T-055b** | «Otra hora» en el alta con el aviso, pantalla Ajustes › Horario y, si P3 = sí, el aviso en el diálogo de mover | medio | T-055a |

Si se aprueba, cada parte es un ticket: el orquestador copia este contrato a `T-055a-…md` y `T-055b-…md`, cada uno con sus tareas, criterios y territorio, sin tocar el diseño. T-055b puede ir en paralelo con T-056a: no comparten ficheros.

# Tareas

## T-055a
- [ ] Migración `20261019120000_disponibilidad_por_centro.sql` (diseño §1.A.1):
  - una franja exige centro y `desde`;
  - una exclusión impide dos franjas solapadas del mismo profesional, centro y día cuando sus vigencias se cruzan;
  - un disparador fija la zona del centro, `creado_por` y `creado_en`, congela `perfil_id`, `tipo` y `centro_id` y exige que el profesional pertenezca al centro de la franja;
  - la RLS nueva: el técnico no lee la tabla y no escribe; el profesional, solo lo suyo;
  - `agenda_bloques_profesional` solo usa franjas del centro pedido y de un profesional que sigue en ese centro, y lee las horas en la zona del centro;
  - `alta_bloqueo_disponibilidad` también lee en la zona del centro;
  - función nueva `agenda_horario_del_dia`;
  - `agenda_crear_cita` acepta `p_aceptar_aviso`.
- [ ] Función pura `lib/agenda/aviso-horario.ts` con sus pruebas, cambio de hora incluido.
- [ ] Banco `scripts/rls/37-disponibilidad-por-centro.sql`, su fila en el README y `tickets/T-055/mutantes.json`.
- [ ] Siembra: dos franjas inventadas de Ana en Las Palmas, una que acaba y otra que empieza.
- [ ] `npm run tipos`. Fila «Disponibilidad» en la matriz de `docs/architecture.md`. Bitácora y `state.md`.

## T-055b
- [ ] Alta: «Otra hora» (fecha y hora libres). `guardarAlta` calcula el aviso en servidor y, si lo hay, devuelve `aviso_horario`. El formulario pinta el aviso y «Agendar igualmente» reenvía con `aceptarAviso: true`.
- [ ] Ajustes › Horario: el profesional ve y gestiona sus franjas por centro (añadir, corregir una que no ha empezado, cerrar). El administrador, las de cualquiera, con selector. El técnico no la ve.
- [ ] Si P3 = sí: el diálogo de mover una cita pinta el aviso como texto, sin un paso más.
- [ ] `docs/interfaz.md`, bitácora y `state.md`.

# Criterios de aceptación (verificables)

## T-055a
- [ ] **Automático.** `npm run test:rls` sale con exit 0 sobre `npx supabase db reset`, con `max(version)` = `20261019120000`, y el banco 37 está dentro. Lo pega el verificador.
- [ ] **Automático, banco sobre la base sembrada.** `npm run seed` y después `npm run test:rls`: exit 0.
- [ ] **Automático, mutantes.** `tickets/T-055/mutantes.json` lleva al menos los doce del diseño §1.A.5, todos muertos, medidos en `begin … rollback` y con la aserción en la que cae cada uno.
- [ ] **Automático.** `npx vitest run lib/agenda/aviso-horario.test.ts` en verde, con estos casos:
  - el salto de marzo y el solape de octubre en `Europe/Madrid`;
  - el salto en `Atlantic/Canary`;
  - una cita que cruza la medianoche;
  - una franja exacta (borde que sí cabe);
  - una que se pasa un minuto.
- [ ] **Automático.** En verde: `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx tsc --noEmit` y `npx next build --webpack`. `npm run verificar:huellas` dice «cadena íntegra».
- [ ] **QA visible (verificador, navegador a la vista).** Hecha con `qa.mjs visita /agenda/nueva`.
  - Como Ana, en el alta en «Centro Las Palmas»: los sábados anteriores a hoy+14 ofrecen huecos de tarde y los posteriores, de mañana.
  - Como técnico de Madrid: el alta en Madrid sigue ofreciendo huecos.
  - Ninguno de los dos casos da errores de consola.
  - Capturas en `.claude/qa/visitas/T-055a/`.

## T-055b
- [ ] **Automático.** Pruebas de componente y de acción en verde:
  - «Otra hora» fuera de franja enseña el aviso con el foco en su encabezado, y «Agendar igualmente» guarda;
  - en un festivo del profesional, el aviso lo nombra y guardar crea la cita;
  - un recálculo de la semana no desmarca la hora elegida a mano;
  - el técnico no recibe el `motivo` de una ausencia en ningún resultado de acción.
- [ ] **Automático.** `lib/citas/errores.test.ts` reconoce el fragmento «tiene festivo o ausencia» leyendo la migración de T-055a.
- [ ] **Automático.** En verde: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npx next build --webpack` y `npm run test:rls` (no cambia nada en la base).
- [ ] **QA visible (verificador, navegador a la vista).** Capturas a 1280 y 360 px en `.claude/qa/visitas/T-055b/`, con `qa.mjs visita /agenda/nueva /ajustes/horario`.
  - **Como Ana:**
    - una cita suelta a las 21:00 de un martes (fuera de franja) avisa, y «Agendar igualmente» la crea, que se ve en la agenda;
    - una cita el día de su «Festivo local» sembrado avisa nombrando el festivo, y guardar la crea;
    - en Ajustes › Horario se añade una franja y se cierra otra.
  - **Como técnico:** `/ajustes/horario` no aparece en Ajustes y la ruta responde «no encontrado».
  - Sin errores de consola, sin desplazamiento horizontal a 360 px y con el foco visible en cada paso.

# Notas para el agente

- **`agenda_crear_cita`, `agenda_bloques_profesional` y `alta_bloqueo_disponibilidad` se copian de su ÚLTIMA redefinición**: `20261007120000:1143`, `20261012120000_hueco_raro.sql` y `20261005120000:141`. Si T-053 u otra migración posterior a esas las redefine, se parte de esa. Se comprueba con `rg -n "function public.<nombre>" supabase/migrations`.
- **La franja no prohíbe.** `agenda_crear_cita` sigue sin exigir franja. El aviso de «fuera de franja» es solo de interfaz. Lo único que la base exige confirmar es el festivo o la ausencia (`p_aceptar_aviso`). Ver la decisión D2 del diseño.
- **Las series no cambian.** La primera sesión estricta en festivo sigue dando 22023 (decisión B del 02-10) mientras P2 no diga otra cosa.
- **Zona: la del centro, siempre** (ADR-034, `.claude/rules/citas-y-agenda.md`). La función pura recibe la zona como dato y no lee ni reloj ni navegador.
- Lee `.claude/rules/fechas.md` antes de las pruebas del cambio de hora: vocabulario `normal|inexistente|ambigua`, el solape de octubre resuelve a la primera.

# Preguntas abiertas al propietario (con recomendación)

1. **¿Quién edita las franjas?** *Recomendación: cada profesional las suyas y el administrador las de todos. El técnico no las edita y no ve el motivo de una ausencia: le basta con saber que ese hueco no está.* Hoy cualquier perfil, técnico incluido, escribe sus propias filas.
2. **¿La primera sesión de una serie en festivo también se deja agendar con aviso?** *Recomendación: no, la serie sigue como hoy.* La primera sesión en festivo se rechaza con un mensaje claro y las demás pasan a propuesta con alternativa. Para ese día queda la cita suelta, que sí avisa y deja. Cambiarlo obliga a rehacer las propuestas de serie (T-011), que ahora mismo funcionan.
3. **¿Mover una cita a fuera de horario o a un festivo también avisa?** *Recomendación: sí, como texto informativo dentro del diálogo de mover, sin paso de confirmación, en T-055b.* Hoy mover a un festivo no avisa de nada.
4. **¿Las alternativas de una sesión de serie bloqueada tienen que caer dentro de horario?** *Recomendación: no en este ticket.* Hoy la alternativa es la misma hora otro día de esa semana. No es una sugerencia de hueco del alta. Exigir franja cambia el comportamiento de T-011 y de sus pruebas. Si molesta en el uso real, se abre ticket aparte.
5. **El horario real de cada centro.** No es una pregunta, es el recordatorio del punto 3 del plan. Hasta que llegue, la siembra es inventada.

# Lo que no entra, y por qué

- **Festivos de centro, cierres y la pantalla de vacaciones**: son T-056.
- **El aviso en las series y la alternativa dentro de franja**: preguntas 2 y 4.
- **Borrar franjas.** No hay `DELETE`. Una franja que ya ha empezado se cierra poniendo `hasta`, y una que no ha empezado se corrige. Así se conserva qué horario valía cada día.
- **Franjas que cruzan la medianoche.** El check `hora_fin > hora_inicio` lo impide desde T-010 y nadie lo ha pedido.
- **Solape entre centros distintos.** Una franja de Madrid y otra de Las Palmas a la misma hora no se impiden. Las horas locales de dos zonas no se comparan, y la cita de un centro ya bloquea el mismo hueco en el otro (`agenda_bloques_profesional` cuenta las citas de cualquier centro).
- **La columna `disponibilidad.zona_horaria`** no se borra. Queda fijada a la del centro y las funciones dejan de leerla para las franjas: borrar una columna es destructivo y no hace falta.
