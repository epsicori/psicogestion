Sin hallazgos ALTA.

# T-047 · Revisión de corrección · ronda 1

- Rama `T-047-agenda-anual`, HEAD `47abe5f553bb0b6455cbd078af59d5d51c0de520`.
- Base: `main` local `91b4df3` (= merge-base; `origin/main` va 878 commits por detrás y no sirve de base).
- Alcance revisado: `git diff main...HEAD` (34 ficheros). Todos dentro del `territorio:` del diseño §6.
- Rebase por cherry-pick: comprobado que no se pierde nada de `main`. `scripts/rls/README.md` solo
  añade la fila 34, la línea del `\gset` (`34:42 → +9`, punto 10.2; está de verdad en la línea 42) y
  la fila de franjas.

## Lista «Qué revisar» del diseño (§5), punto por punto

- Migración `20261017120000_agenda_densidad_anual.sql`: `security invoker`, `stable`, `search_path=''`;
  guardas 22023 en el orden extremos → rango invertido → zona → más de un año, cada una con su propio
  fragmento; pertenencia `inicio ∈ [desde, hasta)` en las dos ramas; filtro de rol en la rama `citas`;
  `estado <> 'cancelada'` solo en la densidad (la lista conserva las canceladas, como pide el diseño);
  filtro de centro correcto; `count(*)::integer`; `revoke`/`grant` con la firma completa en las dos
  funciones; sin índice nuevo. **Correcto.** La cota del año acepta cualquier ventana de un año local
  (no solo una que empiece el 1 de enero), así que el máximo son unas 367 filas: muy por debajo de
  `max_rows`. No es hallazgo.
- Banco `scripts/rls/34-agenda-anual.sql`: bloques A–G según el diseño; el oráculo llama a
  `agenda_citas_rango` con el rol de la sesión; negativas con gemela; zona nula, `Etc/UTC` y `posix/`;
  termina con `reset_sesion`; ningún `delete`/`update` sobre `citas`. La desviación de C34PREV
  (`no_asistida`) está documentada y es correcta: cuenta igual en la densidad.
- `lib/agenda/anio.ts` y `vista-anio.ts`: rejilla de lunes a domingo; 29 de febrero; años con 53 semanas
  ISO; 31 de diciembre y 1 de enero locales; destino del teclado acotado al año. Correcto, y con
  pruebas unitarias que fallarían ante un desplazamiento de un día.
- `parametros.ts` (`vista=anio`): se conservan centro y profesional, y un valor desconocido cae en el
  valor por defecto. Correcto.
- Teclado en rejilla: un solo `tabindex=0`, `aria-current=date` solo en hoy, Ctrl/Alt no se interceptan.
  Correcto (ver H4 y H5 sobre lo que no cubren las pruebas).

## MEDIA

### H1 · `app/(app)/agenda/page.tsx:94` · contrato
Si falla la lista de profesionales, `BloqueAnio` la sustituye en silencio por una lista vacía, en contra
de la decisión D20 del diseño (`tickets/T-047/diseno.md:592`: «Error en la lista: `AvisoDeError`, igual
que la densidad. Degradar a una lista vacía ocultaría el selector con un filtro activo en la URL»).
- Escenario: un administrador abre `/agenda?vista=anio&profesional=<uuid X>` y
  `agenda_profesionales_anuales` devuelve un error (por ejemplo, un tiempo de espera agotado).
  `leerDensidadAnual` sí funciona, así que el año se pinta **filtrado por X**. Pero con
  `profesionales = []` se cumple `profesionales.length < 2` en `barra-agenda.tsx:66` y el selector de
  profesional desaparece. El usuario ve un año con menos citas de las reales, sin ninguna indicación
  del filtro y sin forma de quitarlo desde la interfaz. Es justo el caso que D20 quería evitar.
- Además, `page.test.tsx` no prueba que falle la lista: solo el fallo de la densidad (línea 153). Por
  eso la desviación pasa sin que ninguna prueba se ponga roja.

### H2 · `scripts/rls/34-agenda-anual.sql:17` · prueba
No existe ningún registro de los mutantes M1–M12: `tickets/T-047/mutantes.json` no está en la rama, aunque
lo citan la cabecera del banco (línea 17), la fila 34 de `scripts/rls/README.md` y el diseño (§2 línea 246
y la lista de cierre de la línea 676, que exige medirlos todos y guardarlos ahí).
- Escenario: si se aplica M1 (quitar el filtro de rol de la rama `citas`) o M9 (pasar la función a
  `security definer`), nada demuestra qué aserción del banco 34 se pone roja. El banco podría estar en
  verde por el motivo equivocado, por ejemplo con un oráculo que herede el mismo defecto que la
  función, y la rama lo daría por probado. Además, dos ficheros comprobados en el repositorio apuntan
  a una evidencia que no existe.

## BAJA

### H3 · `lib/supabase/tipos-bd.ts:4053` · contrato
Las dos entradas nuevas (`agenda_densidad_anual` en la línea 4053 y `agenda_profesionales_anuales` en la
4107) están escritas a mano. Lo admite la bitácora (`docs/bitacora/T-047.md:23`), pero el contrato
(`tickets/T-047-vista-anual-agenda.md:15`), el diseño (línea 277) y `.claude/rules/supabase.md` dicen:
«se genera, nunca se edita, y CI lo compara».
- Escenario: CI aplica las migraciones y ejecuta `supabase gen types`. Si el generador produce otro orden
  de claves u otra nulabilidad (por ejemplo, `recuento: number | null`), la comparación de CI falla, o el
  código se compila contra un tipo que no es el de la base. El contenido parece coherente con la firma
  (los parámetros con `default null` salen como opcionales), pero no pude regenerarlo para compararlo:
  la base compartida estaba en pleno `db reset` del verificador y `gen types` falló. Antes de fusionar
  hay que pasar `db reset` + `npm run tipos` y comprobar que el `diff` sale vacío.

### H4 · `app/(app)/agenda/calendario-anio.test.tsx:180` · prueba
La prueba «en el tope del año el foco no se mueve» solo comprueba que el 31 de diciembre conserva el
foco del DOM. No comprueba que siga siendo el único día con `tabindex=0`.
- Escenario: un mutante del componente pone `fechaFoco` en `2027-01-01`, un día que no está en la
  rejilla. `refs.get` devuelve `undefined`, el foco se queda donde estaba y la prueba sigue en verde.
  Pero ningún día queda con `tabindex=0`: al salir con Tab y volver a la rejilla, ya no se puede
  entrar por teclado. Hoy solo lo protege la prueba unitaria de `destinoEnAnio` (`lib/agenda/anio.test.ts`),
  no la del componente.

### H5 · `app/(app)/agenda/calendario-anio.test.tsx:164` · prueba
La prueba se llama «la flecha abajo salta una semana, también hacia otro mes», pero solo comprueba
del 10 al 17 de marzo, dentro de la misma cuadrícula. El salto de foco entre dos `role=grid` distintos
(del mapa de refs de un mes al de otro) no tiene prueba unitaria.
- Escenario: una regresión que registre las refs por mes (un `Map` por cuadrícula en lugar de uno por
  año) haría que la flecha abajo desde el 28 de marzo no llevara a ningún sitio. Esta prueba seguiría
  en verde. Solo la detectaría el Playwright de `accesibilidad/agenda-anual.spec.ts`, que no corre con
  `npm test`.

## Considerado y descartado
- Cabeceras de los días con `agenda.anio.inicialesSemana` en lugar de `format(…, 'EEEEE')`: la
  desviación está justificada (con el locale `es`, `EEEEE` da «M» tanto para martes como para miércoles).
- `?fecha=0050-…`: TZDate convierte el año 50 en 1950, igual que la vista mensual. No es algo nuevo del
  ticket.
- Mayúsculas+flecha no se excluye: mueve el foco igual que la flecha sola. Inocuo.
- `FiltrosAgenda` usa `vista.fechaFoco` y no el día que tiene el foco en ese momento: es lo mismo que en
  el mes y lo que fija el diseño.
