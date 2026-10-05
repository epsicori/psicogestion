---
id: T-043
titulo: Aviso de hueco raro al agendar
modelo: opus
riesgo: alto
fase: 1
prioridad: media
depende_de: [T-028, T-028a]
estado: pendiente
territorio:                           # cerrado por tickets/T-043/diseno.md §6
  - supabase/migrations/20261012120000_hueco_raro.sql     # cola de un solo dueño: después de T-041 (20261010120000) y de la reserva de T-021 (20261011120000)
  - scripts/rls/29-hueco-raro.sql
  - scripts/rls/21-alta-de-cita.sql   # SOLO la aserción A de la forma de agenda_bloques_profesional (líneas 149-152)
  - scripts/rls/README.md
  - lib/supabase/tipos-bd.ts          # solo regenerado con `npm run tipos`
  - lib/citas/alta.ts
  - lib/citas/alta.test.ts
  - lib/i18n/es.ts
  - app/(app)/agenda/nueva/estado-alta.ts
  - app/(app)/agenda/nueva/estado-alta.test.ts
  - app/(app)/agenda/nueva/alternativas-hueco.ts
  - app/(app)/agenda/nueva/alternativas-hueco.test.ts
  - app/(app)/agenda/nueva/aviso-hueco-raro.tsx
  - app/(app)/agenda/nueva/aviso-hueco-raro.test.tsx
  - app/(app)/agenda/nueva/formulario-alta.tsx
  - app/(app)/agenda/nueva/formulario-alta.test.tsx
  - app/(app)/agenda/nueva/acciones.test.ts          # solo `huecosRaros: {}` en las vistas de prueba
  - app/(app)/agenda/nueva/contenido-alta.test.tsx   # ídem
  - docs/interfaz.md                  # la línea 466 deja de decir «va aparte»
---

# Contexto

T-028 dejó fuera, a propósito, uno de sus criterios (`tickets/T-028-alta-de-cita.md:173-175`):

> Aviso no bloqueante cuando la cita deja un hueco raro en la agenda del profesional —menos que una
> sesión y más que el descanso—, con alternativas y un **«Agendar igualmente» que siempre existe**.
> La preferencia del profesional informa; no bloquea.

`docs/interfaz.md:466` lo confirma: «El aviso de "hueco raro" **no** es de este ticket: va aparte».

La pantalla no puede calcularlo con lo que ya recibe. `agenda_bloques_profesional` emite tramos
`libre` y `ocupado` y salta al final del bloqueo, así que el tramo que sigue a un libre no dice si la
cita siguiente empieza justo al acabar el descanso (hueco 0) o veinte minutos después. Además, el
técnico no ve ni el descanso del profesional ni sus citas en otros centros. El dato sale de la base,
de la misma función que ya dibuja los huecos: se le añade una columna (`tickets/T-043/diseno.md` §2, D1).

El diseño completo, con las decisiones y las preguntas abiertas al propietario, está en
`tickets/T-043/diseno.md`. **Las preguntas P1 a P7 de ese diseño se responden antes de implementar.**
Si el propietario no las cambia, se implementa la recomendación de cada una.

# Tareas

1. **Migración `20261012120000_hueco_raro.sql`**. Recrea `agenda_bloques_profesional` con la misma
   firma de entrada y una sexta columna de salida, `hueco_raro_minutos integer`. El cuerpo se copia
   tal cual y solo se añade el cálculo para los tramos `libre` (diseño §1.1).
2. **Banco `scripts/rls/29-hueco-raro.sql`**, con las secciones A a J del diseño §1.2. También se
   enmienda la aserción A de `21-alta-de-cita.sql` y se añade la fila del README.
3. **`npx supabase db reset` + `npm run tipos`**.
4. **`leerBloques`** devuelve además `huecosRaros: Record<clave, minutos>`. `VistaAlta` lo lleva
   (diseño §1.3).
5. **`alternativasSinHueco`**, función pura con su prueba (diseño §1.4).
6. **`AvisoHuecoRaro`** y su integración en `formulario-alta.tsx`: interceptar Guardar, el foco,
   «Agendar igualmente» y las alternativas (diseño §1.5 y §1.6). Las claves de texto van en
   `agenda.alta.huecoRaro.*`.
7. `docs/interfaz.md:466`: el aviso deja de estar «aparte». Se describe en dos líneas qué enseña y
   cuándo aparece.

# Criterios de aceptación (verificables)

- [ ] **CA1 · Base.** `npx supabase db reset` aplica la migración sin errores, y `npm run lint:migraciones`
      sale con 0 hallazgos. Comprobar además que la forma de salida de
      `pg_get_function_result('public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure)`
      termina en `estado text, hueco_raro_minutos integer`, con una sola función de ese nombre. Siguen:
      `security definer`, `search_path=''`, `execute` para `authenticated` y nada para `anon` ni `public`.
- [ ] **CA2 · Valor.** `npm run test:rls` sale con código 0 y `29-hueco-raro` corre completo. Cubre
      las secciones B a J del diseño §1.2:
      - 40 con dos citas candidatas, y la menor manda;
      - adyacente da `null`;
      - 11 en el borde inferior;
      - 69 frente a `null` en el borde superior;
      - descanso 0;
      - el técnico ve el valor calculado con una cita de otro centro;
      - una ausencia parcial en medio da `null`;
      - el fin de la franja da `null`;
      - una cita cancelada no cuenta;
      - un tramo `ocupado` siempre da `null`.
      Los tramos y estados de cada caso son los que ya daba la función: el arreglo no mueve ningún hueco.
- [ ] **CA3 · Permisos intactos.** En el mismo banco:
      - el técnico de otro centro (TEC2 pidiendo CA) y un profesional ajeno (PRO2 pidiendo a PRO1)
        reciben 42501 «No autorizado para ver esta agenda.»;
      - sus gemelas pasan: TEC1 pidiendo CA y ADM.
- [ ] **CA4 · Mutantes.** Cada mutante M1 a M9 del diseño §3 hace caer `test:rls` en la aserción que
      el diseño nombra. La tabla va en la evidencia, con la línea del fallo.
- [ ] **CA5 · Unitarias.** `npm test` en verde, y además:
      - `alternativas-hueco.test.ts` cubre el orden con al menos dos candidatas y el caso sin el elegido;
      - `aviso-hueco-raro.test.tsx` cubre ARIA, que «Agendar igualmente» existe también sin
        alternativas, y que nunca aparece el atributo `disabled`;
      - `formulario-alta.test.tsx` cubre los siete casos del diseño §3, CA5. Entre ellos: Guardar con
        hueco raro no llama a `guardarAlta`; «Agendar igualmente» sí la llama, una vez y con los mismos
        datos; el foco va al aviso, al resumen o a Guardar, y nunca a `body`.
- [ ] **CA6 · No bloquea.** Ningún camino de servidor rechaza por el hueco: `guardarAlta` y
      `lib/citas/alta.ts` no leen `huecosRaros` (comprobar con `grep`). El botón Guardar y «Agendar
      igualmente» no llevan nunca `disabled`.
- [ ] **CA7 · Manual, en Chromium.** Con una cita a las 10:30 y un hueco libre a las 09:00, con tipo de
      50 minutos y descanso de 10:
      - como profesional y como técnico, Guardar enseña el aviso con «40 minutos» y el foco en el aviso;
      - Tab recorre las alternativas y llega a «Agendar igualmente»;
      - elegir una alternativa la marca en el calendario y lleva el foco a «Hueco elegido»;
      - «Agendar igualmente» crea la cita;
      - con un hueco sin rareza, Guardar crea la cita sin aviso;
      - a 360 px de ancho, el aviso no desborda.
- [ ] **CA8.** `npm run lint` sin errores, `npm run build` limpio, y `node ~/.claude/pipeline/territorio.mjs T-043`
      dentro del `territorio:`.

# Guion de comprobación manual

1. `npx supabase db reset && npm run seed`, y anotar `max(version)` (debe ser `20261012120000`) y el
   recuento de usuarios.
2. Como administrador, en `/agenda/nueva`, elegir un profesional con franja de mañana (09:00 en
   adelante) en un día futuro, con un tipo de 50 minutos. Crear una cita a las 10:30.
3. Volver a `/agenda/nueva` con el mismo profesional, tipo y día. Elegir las 09:00 y pulsar Guardar.
   El aviso aparece sobre los botones y el foco queda en él. Un lector de pantalla lee el título y
   el texto con «40 minutos».
4. Tab: alternativas, «Agendar igualmente», Cancelar, Guardar. Pulsar Guardar otra vez: no guarda y
   el foco vuelve al aviso.
5. Elegir la primera alternativa. El aviso desaparece, el calendario la marca como elegida y el foco
   está en la línea «Hueco elegido». Guardar crea la cita sin aviso.
6. Repetir el paso 3 y pulsar «Agendar igualmente». La cita queda creada y el diálogo se cierra con
   el anuncio de siempre.
7. Repetir los pasos 3 a 6 como técnico del centro.
8. Repetir el paso 3 a 360 px de ancho: nada sale de la caja.

# Notas para el agente

- **Lee `tickets/T-043/diseno.md` entero antes de empezar.** Las preguntas abiertas que el propietario
  haya respondido van anotadas al pie de este contrato. Si no hay respuesta, se implementan las
  recomendaciones.
- La migración **no reescribe** la función: copia el cuerpo de `20261005120000_base_del_alta_de_cita.sql:850-1009`
  y añade solo lo que dice el diseño §1.1. El revisor hará un `diff` entre los dos cuerpos.
- `sugerirHuecos` (ADR-049c) no se toca, y las tarjetas de sugerencia no se filtran por el hueco raro.
- El tipo generado declara `hueco_raro_minutos: number`, pero en ejecución puede venir `null` (diseño §0, H9).
- Antes de verificar, comprobar `max(version)`: un `db reset` desde `main` pierde la migración de esta
  rama, y la base es compartida con T-041 y T-021.
