**Sin hallazgos ALTA.** 3 MEDIA · 4 BAJA. Revisor 2 de 2 (banco 19, fijaciones, t005, siembra, tipos y arquitectura).

# T-034 · Revisión del banco y de las fijaciones

- Alcance: `git diff main...T-034-nota-en-episodio`, contrastado con `tickets/T-034/diseno.md` §1.6, §5 y la enmienda del ADR-072 (§E.3-E.7).
- Método: lectura, sin tocar la base (la usa otro agente). Cada negativa se juzgó preguntando si seguiría verde con su guarda quitada.
- No se leyeron `evidencia.json` ni el informe del verificador.
- Aceptados a propósito y no contados como hallazgo:
  - la 19.17 usa la elección explícita de EC;
  - el banco 19 fija sus propios PIN al empezar.

## Lo que está bien (comprobado prueba a prueba)

**Negativas discriminantes, con su gemela.** Cada una de estas pruebas se pondría roja si se quitara su guarda:

- 19.1: `NOT NULL`, como postgres.
- 19.2 y 19.4: apertura, idempotencia y auditoría única.
- 19.5: EP001.
- 19.7, 19.8 y 19.11: el mismo 42501 para otro paciente y para otro profesional.
- 19.10: discrimina D2 de verdad, porque PRO1 cumple `es_profesional_del_episodio(EJX)`.
- 19.12 y 19.13: participante activo frente a dado de baja.
- 19.18: rol antes que candado.
- 19.19 y 19.20: la cita manda; centro ajeno.
- 19.23-19.27: coherencia al insertar, al actualizar y como postgres.
- 19.28-19.30: puertas congeladas, con gemelas sobre la misma fila.
- 19.33: el `check` por nombre.
- 19.34: la FK por nombre.
- 19.35: TEC1 sí tiene alta en CA.
- 19.36: CC frente a CA; un disparador que mirase el centro del paciente o del autor pasaría.
- 19.37-19.39.
- 19.40: candado y gemela NPC en la misma sesión.
- 19.41: fragmento «no se puede reatribuir».
- 19.42-19.45:
  - la 19.44 cae si el paso 6 solo mira INSERT;
  - la 19.45 cae si el paso 6 no mira el cambio de `episodio_id`.
- 19.46 y 19.47: catálogo.

**Fijaciones, t005 y siembra:**

- **01:** `EPI2` es de PRO2 en CB.
- **04:** el episodio de PROBAJA se inserta como postgres antes de la sesión.
- **14:** los cuatro episodios son del autor de cada nota. Los ids son los del diseño.
- **t005:** `EPICONC` va sin centro (columna nulable) y se inserta como postgres.
- **Siembra:**
  - `k_epi_carmen` pertenece a Ana y está en Madrid.
  - `k_epi_ivan` pertenece a `k_baja` y está en `k_c_canarias`, que es el centro de `k_baja` (`seed-completo.sql:150,234`).
  - Los dos se abren antes de sus notas: −30 d frente a −16/−9/−2 d, y −45 d frente a −30 d.
  - Todo es idempotente con `on conflict (id)`.
- **Colisiones:** ningún UUID nuevo choca con otro módulo.
- **`tipos-bd.ts`:** tiene la forma de un fichero generado:
  - `episodio_id` es obligatorio en Insert;
  - `coprofesional_id` es nulable y trae sus dos relaciones FK;
  - `episodio_para_nota` lleva 4 argumentos, 3 de ellos opcionales.

## MEDIA

### H1 · El orden de guardas frente a un episodio AJENO no tiene ninguna prueba: ni el del disparador (autor → paciente → cerrado) ni el de la función (propiedad → cerrado)
`scripts/rls/19-nota-en-episodio.sql:287` (19.25) y `:210` (19.15)

El diseño lo pone en su lista de revisión (§5 «Cerrado da 22023 solo **después** de comprobar que es suyo» y §E.6 «el estado cerrado nunca se revela sobre un episodio ajeno»), pero ninguna prueba del banco lo comprueba:

- **La 19.25 no fija el orden.** Inserta `(PS, ES, PRO1)`, y `ES` **es** de PS: el paciente coincide, así que solo falla el autor.
- **La 19.15 tampoco.** Usa `EA0`, que es un episodio propio.
- **Ninguna prueba usa un episodio de PRO2 que tenga paciente distinto o esté cerrado.**

Escenario: se reordena el disparador, con la comprobación de paciente (paso 5) antes que la de autor (paso 4), o con la de cerrado antes que ambas.

- PRO1, que conoce el uuid de un episodio de PRO2, prueba `insert (PA, <ep>, PRO1)` y `insert (PS, <ep>, PRO1)`.
- Recibe «no son del mismo paciente» con uno y «episodio de otro profesional» con el otro. Así averigua **de qué paciente es el episodio de un compañero**, o si está cerrado.
- El banco sigue verde.
- Falta, por ejemplo:
  - un episodio cerrado de PRO2;
  - `insert (PA, ES, PRO1)`, que debe dar «episodio de otro profesional» y no «no son del mismo paciente»;
  - `episodio_para_nota(PS, <cerrado de PRO2>)`, que debe dar 42501 «no vale» y no 22023.

### H2 · La salida anti-oráculo del disparador (paso 2) no tiene ninguna prueba
`supabase/migrations/20260929120000_nota_siempre_en_episodio.sql:68`

Ninguna prueba del banco inserta una nota con `autor_id` distinto del usuario de la sesión.

- Todas las negativas en sesión usan `autor_id = auth.uid()`.
- Las de postgres (19.26, 19.38 y 19.43) entran por la rama «sin sesión».

Escenario: se borra el `if … autor_id is distinct from auth.uid() then return new`.

- PRO1 inserta `(PS, ES, autor PRO2, coprofesional TEC1)`.
- El disparador *definer* corre antes que el WITH CHECK de la RLS y responde 23514 «tiene que ser un profesional sanitario». Con otro episodio respondería «episodio cerrado», en vez del 42501 de la RLS.
- PRO1 averigua el estado de un episodio ajeno y el rol o las altas de un perfil en un centro ajeno. El banco sigue verde.
- Falta la negativa que espera **42501 de la RLS** con la fila construida para que el disparador, si corriera, diera 23514.

### H3 · Las dos puertas congeladas se prueban por una sola columna cada una
`scripts/rls/19-nota-en-episodio.sql:320` (19.28) y `:337` (19.29)

- **Episodio:** el disparador vigila `paciente_id` **y** `profesional_id` (`…sql:210-213`), pero la 19.28 solo prueba `paciente_id`.
- **Participante:** vigila `episodio_id` **y** `paciente_id` (`…sql:223-224`), pero la 19.29 solo prueba `paciente_id`.

Escenario: el disparador pasa a `before update of paciente_id` y su `when` pierde el `or new.profesional_id …`. Entonces:

- Como postgres (siembra, importador u operador), `update episodios_asistenciales set profesional_id = PRO2 where id = vA` pasa.
- La nota de PRO1 queda en un episodio de PRO2 y rompe D2 en la base, sin que ninguna prueba se ponga roja.
- Lo mismo ocurre con `update episodio_participantes set episodio_id = <otro> where … PJ2`.
- La tabla §1.6 del diseño ya omitía estos dos casos; la implementación la copió.

## BAJA

### H4 · El alta vigente del coprofesional (`hasta is null`) y la guarda de «dado de baja después» no tienen prueba
`supabase/migrations/20260929120000_nota_siempre_en_episodio.sql:132`

§E.6 pide alta **vigente**, pero todas las negativas de centro (19.36-19.38) usan perfiles **sin fila** en el centro; ninguna usa una fila con `hasta` puesto.

Escenario: se quita `and pc.hasta is null`.

- Un profesional que dejó CA (`perfiles_centros (X, CA, hasta = ayer)`) se acepta como coprofesional de una nota nueva en un episodio de CA.
- El banco sigue verde.

Tampoco hay prueba de que, si el coprofesional pierde el alta, un `update` que no toca ni el coprofesional ni el episodio (por ejemplo, de `paciente_id` a un participante) siga pasando. Esa rama del paso 7 queda sin ejercer.

### H5 · La fecha «en la zona del centro» de la 19.2 no discrimina durante la mayor parte del día
`scripts/rls/19-nota-en-episodio.sql:128`

- `CC` se crea con la zona por defecto, `Europe/Madrid` (`20260822094547…sql:116`).
- La sesión del banco corre en UTC.

Escenario: se cambia el `abierto_en` de la función a `current_date`. La 19.2 sigue verde siempre que el banco corra entre las 00:00 y las 22:00 UTC (23:00 en invierno). Solo se pone roja dos horas al día; CI casi nunca lo verá.

Un centro de prueba con zona lejana a UTC (por ejemplo `Pacific/Kiritimati`, UTC+14) haría que la aserción discriminase casi todo el día.

### H6 · El filtro `c.profesional_id = v_uid` de la cita no tiene negativa
`supabase/migrations/20260929120000_nota_siempre_en_episodio.sql:348`

- La 19.22 solo prueba una cita de **otro paciente**.
- §5 pide exigir también que la cita sea del llamante («un administrador lee todas las citas: sin ese filtro, elegiría el centro con la cita de otro»).

Escenario: se quita el filtro.

- Un llamante que lee citas ajenas y es `es_profesional_asignado` del paciente pasa la cita de ese paciente con otro profesional en CB. Según `citas_lectura`, ese llamante es el administrador.
- Se abre un episodio en CB **sin pasar** por la validación de `centros_actuales()`, porque el centro de la cita no se revalida.
- El banco sigue verde.

Hoy, para un profesional, la RLS de `citas` lo tapa. Para un administrador asignado, no.

### H7 · A la viñeta de `architecture.md` le falta la regla del centro que pedía el diseño, y deja fuera el «mover»
`docs/architecture.md:357`

§1.7 pedía que la viñeta dijera «el centro sale de la cita o del centro activo que manda la aplicación (la cookie no es legible en SQL)». Esa frase no está ni en la viñeta ni en la línea de `episodio_para_nota` (`:262-264`). Además, la viñeta dice «Una nota nueva no cuelga de un episodio cerrado», pero la base impide también **moverla** a uno cerrado (19.44).

Escenario: quien implemente T-012 lee `architecture.md` (el destilado que manda) y llama a `episodio_para_nota(paciente)` sin `p_centro_id`.

- La primera nota de un paciente sin episodio abierto y sin cita muere con 22023 «Falta el centro del episodio».
- Además, ofrece mover borradores a episodios cerrados, y la base los rechaza.

## Fuera de hallazgos (para el cierre)

- La rama no toca `docs/state.md` ni `docs/bitacora/T-034.md`. El diseño las deja para el cierre; allí van también las anotaciones de `scripts/t001-esquema.sql` y `scripts/t002-rls.sql`, que siguen insertando notas sin episodio, y la del texto de `centros_actuales()`.
- La 19.31 no comprueba `fn_congelar_cabecera_sellada()`. La migración la reemite con `create or replace`, que conserva la ACL, y la vuelve a revocar (`:384`). No encontré un escenario de fallo concreto, así que no cuenta como hallazgo.
