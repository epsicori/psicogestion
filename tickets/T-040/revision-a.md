Sin hallazgos ALTA. T-040 corte B, revisor A (base de datos): 0 ALTA, 2 MEDIA, 1 BAJA.

Revisado: `git diff main...worktree-agent-a9325d705ce4db36b` en la migración `20261009180000_exportaciones.sql`, `scripts/rls/27-exportaciones.sql`, `11-cobertura.sql`, `README.md`, `scripts/lint-migraciones.ts`, `scripts/t040-oraculo.mjs`, `tickets/T-040/oraculo-postgrest.json`, `tickets/T-040/mutantes.json` y `lib/supabase/tipos-bd.ts`. Lo he cotejado con el contrato, con §1.1, §5 y las decisiones del propietario (P3), y con B0 del diseño. No he leído `evidencia.json`.

## Lista «Qué atacar», punto por punto

1. **Pasos 0–4 sin tablas clínicas; sin oráculo de existencia.** Se cumple. Los pasos 0 a 4 solo llaman a `auth.uid()`, `current_setting` y `rol_actual()` (que lee `perfiles`). La primera lectura clínica es la del paso 5, y todo fallo de autorización posterior es uniforme. En el banco, K12 a K15 comparan la nota existente con `E_RND` y piden el texto exacto. El mutante «quitar `and n.paciente_id = p_paciente_id` del paso 5» lo he medido en `begin … rollback` y sale **rojo en K15**, por el motivo correcto.
2. **Una sola lectura de `notas_clinicas_versiones`.** Se cumple. Está en el paso 8 (migración:268-357). `v_versiones` sale de la carga con `with ordinality`, y el `jsonb_agg` lleva `order by v.numero_version`.
3. **La referencia y el motivo fuera de los errores.** Se cumple. Ningún `raise` lleva `%`, y el único `format()` es el del detalle del aviso, que lleva el nombre de quien pide, la fecha y la etiqueta del motivo, pero no la referencia. K17 a K21 lo comprueban en tres fallos posteriores al paso 3, y K16 en el paso 6.
4. **Retorno jsonb escalar, sin `exception when`, y S6.** La función cumple R1 y R2: `returns jsonb`, sin `exception when` y sin `return` de fallo. **S6 no prueba lo que dice probar.** Lo detallo en H1.
5. **Grants.** Se cumple. Las tres funciones públicas revocan a `public, anon` y conceden a `authenticated`. `etiqueta_motivo_exportacion` revoca además a `authenticated`. Las dos tablas revocan `all` a los cuatro roles, y `update, delete` a `postgres`.
6. **Regla 6.** Se cumple, sin ALTA. Hay tres capas: el revoke, los disparadores `fn_impedir_modificacion` de fila y de sentencia en update, delete y truncate, y las filas en `tablas_solo_adicion`. `TABLAS_SOLO_ADICION` está al día en el lint. El `on conflict (exportacion_id) do nothing` solo necesita INSERT: no hay `do update`, y el disparador de update no se activa nunca.
7. **Aviso al titular y al autor (P3).** Se cumple. Los destinatarios son el titular, el titular del superviviente si el paciente está fusionado y el autor, con `distinct`, solo activos y sin quien pide. F1, F4 y F5 lo cubren.
8. **Mutantes.** MB8 está probado con un bloqueador real (CB7: `en_espera` 1, 23505 propio). **MB4 no es equivalente** (H2). He medido tres variantes en `begin … rollback` (00 + 27 + una sonda propia):
   - la línea base sale verde;
   - MB4, tal como está construido, sale verde (sobrevive);
   - el mutante sin el cotejo del paciente sale rojo en K15.

## MEDIA

### H1. El S6 del oráculo sale verde sin ejecutar la función, y el canal que R1 quería cerrar existe con otra forma
`scripts/t040-oraculo.mjs:252` (forma pedida por `tickets/T-040/diseno.md:1060`).

**Descripción.** S6 filtra por `?exportacion_id=eq.<uuid>`, pero en una RPC escalar esa columna no existe. PostgREST responde 400 con el código 42703 (`column exportar_nota.exportacion_id does not exist`) al analizar la consulta, **antes de llamar a la función**. El Δ 0 que registra `oraculo-postgrest.json` no prueba nada sobre las escrituras.

En PostgREST, la columna de una RPC escalar se llama `pgrst_scalar`, y los filtros sobre ella **sí se aplican**. Lo he medido en la base local:
- Sobre `historia_desbloqueada`, `?pgrst_scalar=eq.true` con `Accept` de objeto da 200 `null`, no 406. `limit=0` y `offset=1` dan también 200 `null`.
- Sobre `exportar_nota` como ADM, con `peticion_paciente`, `?pgrst_scalar->versiones->0->>cuerpo=like.*MARCA-CUERPO*&offset=5` y `Prefer: count=exact`, la respuesta es 416 PGRST103: «there are only **1** rows». Con `like.*NO-ESTA-EN-LA-NOTA*` la respuesta dice «only **0** rows».
- En los dos casos la transacción **confirma**: exportaciones/accesos/avisos pasan de 6/6/6 a 7/7/8, y luego a 8/8/10.

Conclusiones:
- La premisa de R1 («un escalar no admite filtros») es falsa.
- Hoy el resultado es seguro: no hay rollback, solo queda rastro sin entrega, y el que llama ya estaba autorizado.
- Lo que nos protege es que PostgREST responde 200 `null` o 416 y no 406. Ninguna prueba fija ese comportamiento.
- El invariante del diseño («sin contenido, Δ = 0») daría **rojo** con la forma correcta de S6, aunque la falla vaya en la dirección segura.

**Escenario.** Una versión de PostgREST que trate `objeto + 0 filas` igual en un escalar que en un `setof` respondería 406 y desharía el acceso, la exportación y el aviso. El que llama sabría si su filtro casaba con el cuerpo de la nota, y no quedaría rastro. S6 seguiría verde con su 42703, porque nunca llega a la función.

En la otra dirección, MB1 (`returns setof jsonb`) tampoco lo caza S6, porque la columna sigue sin existir: hoy solo lo mata K22.

**Qué haría falta.** Que S6 filtre por `pgrst_scalar`, por ejemplo `?pgrst_scalar->>exportacion_id=eq.<uuid aleatorio>` con `Accept` de objeto. Que su invariante sea solo «contenido ⇒ rastro»: Δ +1 sin contenido es la dirección permitida.

### H2. MB4 está declarado «equivalente» y no lo es: sobrevive al banco con un cambio observable en el orden de guardas
`tickets/T-040/mutantes.json:21`; guardas en `supabase/migrations/20261009180000_exportaciones.sql:221-235`; banco en `scripts/rls/27-exportaciones.sql:725-753`.

**Descripción.** MB4, tal como se construyó («paso 3 detrás del 5, delante del 6»), deja el orden 0, 1, 2, **4**, 5, **3**, 6. El paso 4 («Solo la administración pide copias con motivo», 42501) queda delante de las comprobaciones de parámetros del paso 3. `mutantes.json` lo descarta con «el select del paso 5 no escribe ni lanza; el orden observable no cambia. No se cuenta». El razonamiento solo mira el paso 5 y olvida que el 4 también cambia de sitio. En el banco no hay ninguna prueba de un no administrador con motivo y referencia ausente o corta: K13 usa siempre una referencia válida.

**Escenario medido** (`begin` + mutante + 00 + 27 + sonda + `rollback`):
- Llamada: SIN (profesional) llama `exportar_nota(P, <uuid>, 'traspaso_caso', null)`.
  - Con la migración: `22023 El motivo y la referencia van juntos.`
  - Con MB4: `42501 Solo la administración pide copias con motivo.`
- Llamada: la misma con la referencia `'x'`.
  - Con la migración: `22023 La referencia tiene que medir entre 3 y 200 caracteres.`
  - Con MB4: `42501 Solo la administración pide copias con motivo.`
- El banco 27 termina «completo» con el mutante.

El efecto inmediato no es una fuga: las dos ramas rechazan y no leen tablas. Pero la evidencia sellada afirma algo falso sobre el orden B0.3.1, que es la lección central del corte, y un mutante vivo queda fuera del recuento. Lo que falta es una aserción del tipo «PRO con motivo y sin referencia: 22023 «van juntos»» que fije el paso 3 antes del 4.

## BAJA

### H3. El diseño anota fuera de alcance al administrador coterapeuta sin dejar dónde se recoge
`supabase/migrations/20261009180000_exportaciones.sql:500-525` (`notas_para_copia`) frente a `exportar_nota`, paso 6.

**Descripción.** Con motivo, la RPC acepta cualquier nota existente del paciente. `notas_para_copia` excluye las que el administrador lee por el episodio conjunto, y sin motivo esas notas dan «Falta el motivo».

**Escenario.** ADM es titular de P2, participante del episodio conjunto de P. Lee N1 v2 por RLS, pero N1 no aparece en `notas_para_copia(P)`, y desde la vista conjunta no tiene descarga (C.1.7). La única forma de pedir la copia por motivo es llamar a la RPC a mano.

El diseño (`diseno.md:750-752`) lo da por «caso marginal y se anota», pero en el diff de mi parte no hay ninguna línea en `docs/state.md` ni un ticket que lo recoja. No he revisado `docs/`, que es la parte del revisor B. Si ya está anotado allí, este hallazgo se descarta.

## Comprobado y descartado

- La unión interna con `episodios_asistenciales` en el paso 8 no pierde notas: `notas_clinicas.episodio_id` es NOT NULL desde `20260929120000` y la base tiene 0 notas sin episodio.
- El tipo `exportacion_por_administracion` cabe en `notificaciones`: `tipo` es texto con un check de no vacío y no tiene enum.
- El oráculo de contenido por 416 o filtro de H1 solo está al alcance de quien ya puede exportar esa nota, y cada intento deja rastro completo. No es una fuga.
- El predicado de lectura conjunta de `notas_para_copia` es literal respecto a `notas_clinicas_lectura` (`20260822160000:1117-1130`).
- Los tipos de `tipos-bd.ts` cuadran con la migración (enums, firmas y `Returns: undefined` en `registrar_fichero_exportado`).
- `11-cobertura.sql` y `README.md` solo cambian comentarios y la fila del banco.

## Efecto lateral de esta revisión

Para medir H1 hice dos llamadas reales por HTTP. Quedaron confirmadas en la base local compartida, sobre la fijación del oráculo (paciente `974f04a1-…`, nota `71f3acad-…`, ADM `2a449af3-…`): 2 filas en `exportaciones`, 2 en `accesos_historia` y 4 en `notificaciones`, con la referencia `SONDA-REVISOR-A`. Las dos primeras tablas son de solo adición y no se pueden borrar: se van con el próximo `db reset`. Los mutantes se midieron todos dentro de `begin … rollback`, y `exportar_nota` sigue siendo la de la migración (`position('n.paciente_id = p_paciente_id' in prosrc) > 0`).
