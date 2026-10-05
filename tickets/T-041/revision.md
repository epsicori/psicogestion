**Sin hallazgos ALTA.** Gate de la ronda 2: 0 ALTA · 0 MEDIA · 6 BAJA. A2-H1 es el mismo hallazgo que B2-H4 y cuenta una vez.

# T-041 · Revisión combinada — ronda 2

> Ronda 1: 0 ALTA · 2 MEDIA · 11 BAJA ([revision.ronda1.md](revision.ronda1.md)).

| Revisor | ALTA | MEDIA | BAJA | Informe |
|---|---|---|---|---|
| A (base de datos, RLS y seguridad) | 0 | 0 | 2 (una = B2-H4) | [revision-a.md](revision-a.md) |
| B (aplicación e interfaz) | 0 | 0 | 5 | [revision-b.md](revision-b.md) |

## Cierre de la ronda 1

**Parte A.** A-H1..A-H5 quedan cerrados. Los ocho mutantes que sobrevivían mueren ahora contra el banco entero:

| Mutante | Dónde muere |
|---|---|
| M3 | 28.F6 de baja |
| M4 | 28.F11 |
| M5 | 28.F13 |
| M8 | 28.F12 |
| M6 y M11 | 28.G4b |
| M7 | 28.E3 (id) |
| M12 (cierre sin la fecha de hoy) | 28.E9 |

- El arreglo de A-H2 (`new.hasta = current_date` en el disparador) no rompe a ningún escritor: todos los que cierran filas usan `current_date`.
- `carga.ts` lee `directorio_perfiles`. Esa vista no expone a ningún compañero más de lo que ya ve cualquier perfil activo.

**Parte B.** El criterio 8 y B-H1..B-H8 quedan cerrados. Cada arreglo mata su mutante, y B-H1 está medido en Chromium. Hay dos excepciones:

- la rama visible de B-H3 y el productor de `avisoPendiente` de B-H7 siguen sin prueba (B2-H1);
- B-H8 no llegó a `formulario-invitar.tsx` (B2-H5).

Las dos decisiones que tomó el implementador ya tienen dueño en el diseño:

- no dar las altas si falla `registrar_invitacion`: P4, paso 3 «sin cambios»;
- leer `centros` antes de `inviteUserByEmail`: D9.
  - La lectura va por la sesión, no con la clave de servicio.
  - Si falla, la cuenta no se crea.
  - Queda una ventana de milisegundos sin candado hasta el disparador de GoTrue. Se acepta.

## Hallazgos

- **B2-H1 · BAJA** — `app/(app)/ajustes/acciones.ts:61`: la rama `registroConAltasPendientes` y `avisoPendiente: true` no tienen prueba. Los dos mutantes sobreviven, 159/159.
  - *Escenario*: `registrar_invitacion` falla con [Madrid, Canarias] → con la rama anulada, el mensaje vuelve a omitir Canarias y no hay ninguna prueba roja.
- **B2-H2 · BAJA** — `app/(app)/ajustes/acciones.ts:63`: la rama de registro con altas pendientes no lleva `avisoPendiente`, así que B-H7 quedó arreglado a medias.
  - *Escenario*: «… Tampoco se dio el alta en Canarias…» sale con el estilo del éxito → se lee como un éxito y el alta no se da.
- **B2-H3 · BAJA** — `app/(app)/ajustes/centros/gestion-altas.tsx:101`: el `catch` dice «No se pudo guardar» cuando no se sabe si se guardó, y no revalida la lista.
  - *Escenario*: la retirada se confirma pero la respuesta se pierde → «No se pudo guardar», con Sur aún en la lista → el reintento da P0002 «puede que otra persona la haya retirado ya».
- **B2-H4 = A2-H1 · BAJA** — `lib/cuentas/invitar.ts:73`: un error al leer `centros` sale como «Un centro elegido ya no está abierto». La rama del error no tiene prueba.
  - *Escenario*: un fallo transitorio de lectura → el administrador recarga, ve todos los centros abiertos y busca un cierre que no existe.
  - El fallo es seguro: la cuenta no se crea.
- **B2-H5 · BAJA** — `app/(app)/ajustes/invitar/formulario-invitar.tsx:98`: la transición de invitar sigue sin `try/catch`.
  - *Escenario*: el correo sale, falla Canarias y la respuesta se pierde → límite de error de la ruta → no se sabe que la invitación salió ni que falta Canarias, y el reintento dice «No se pudo enviar la invitación».
- **A2-H2 · BAJA** — `scripts/rls/README.md:51`: la línea del banco 28 no recoge E3 (id), E9, F6 de baja, F11-F13 ni G4b. Su lista de mutantes medidos sigue con los cuatro de la ronda 1.
  - *Escenario*: un ticket posterior toca el disparador o el `where` de `retirar_alta_centro` → mira en el README qué mutantes repetir → no repite ni el de la fecha ni el del ciclo.
