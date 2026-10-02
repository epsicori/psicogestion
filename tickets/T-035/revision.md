Sin hallazgos de severidad ALTA (total de los dos revisores: 0 ALTA, 1 MEDIA, 2 BAJA).
Sin hallazgos de severidad ALTA (revisor 1: 0 ALTA, 0 MEDIA, 2 BAJA).

# T-035 · Revisión, revisor 1 de 2 (migración y base)

Diff: `git diff main...worktree-agent-a78655777943c5e6c` (HEAD 410046e). Leídos: contrato, `diseno.md`
(con las decisiones del propietario P-1 y P-2), `CLAUDE.md` y reglas. No se han leído la evidencia ni
el informe del verificador. Sin base de datos: todo sale de leer el código. `npm run lint:migraciones`
en el worktree: «22 migración(es) limpias».

## §5 «Qué revisar», punto por punto

**5.1 La re-emisión es la misma función salvo lo declarado.** Se extrajo el bloque de
`fn_exigir_episodio_coherente_en_nota()` de `20260929120000…sql` (main) y de la migración nueva, y se
hizo `diff`. Solo cambian: la declaración `v_estado public.estado_perfil`, el `select f.rol, f.estado
into v_rol, v_estado`, 7b (lista cerrada) y 7b' (activo). Pasos 1-6, 7a, 7c y el `for share` del paso 3
y del 5, idénticos. `fn_congelar_episodio_con_notas()` solo cambia el texto del mensaje. Las dos llevan
`language plpgsql`, `security definer` y `set search_path = ''`, y se re-emiten los dos `revoke … from
public, anon, authenticated`. El disparador `exigir_episodio_coherente_en_nota` no se re-emite;
`congelar_cabecera_sellada` no se toca. Ningún `comment on trigger` se pierde con el `drop trigger`
(no había ninguno). Correcto.

**5.2 Columnas y puertas.** El `update of` y el `when` cubren `paciente_id`, `profesional_id` y
`centro_id` con `is distinct from` (los dos sentidos del nulo). No hay otro disparador `before update`
en `episodios_asistenciales` que reescriba `centro_id` por debajo del `update of` (solo el de
auditoría). La política `episodios_modificacion` no mira el centro, así que el 42501 de 19.60a/b solo
puede venir del disparador, y además se exige el fragmento. Ningún código de `lib/`, `app/` ni la
siembra escribe en la tabla. La función es `security definer`: el `exists` ve las notas aunque la RLS
del llamante no las mostrara. Correcto.

**5.3 Mutantes.** Repasados M1-M11 contra el banco nuevo: cada uno pone roja la prueba que el diseño
dice, por el motivo exacto (19.58 y 19.57b en C35E, donde TEC1 tiene alta, aíslan el rol; 19.59 usa a
ADM, que pasa 7b y 7b'; 19.57c usa a PROBAJA, profesional sanitario con alta vigente, y aísla el
estado). 19.57 «por update» no es vacía: 19.57b demuestra en la misma sesión que la RLS deja a ADM
actualizar la fila, así que el paso a `null` se aplicó y el `= PRO1` siguiente revalida. El hueco que
queda es H1.

**5.4 Concurrencia.** Sin cerrojos nuevos. El `for share` del paso 3 choca con el `for no key update`
del cambio de centro (no es columna de clave), y el `exists` de la congelación toma instantánea nueva
en READ COMMITTED. La lectura de `perfiles.estado` en 7b' va sin candado; una baja concurrente es
serializable como «la nota antes que la baja», que ya es lo aceptado en T-034 para el alta. Sin
hallazgo.

**5.5 Mensajes.** Los fragmentos viejos (`tiene notas`, `tiene que ser un profesional sanitario`,
`profesional sanitario`) siguen dentro de los mensajes nuevos. Ningún otro módulo del banco (14,
t005) referencia las dos funciones; el módulo 14 usa a PRO2 (activo) como coprofesional.

**5.6 Estado del banco.** Fijación propia (centros, altas con `principal = false`, PIN de ADM,
PROBAJA de baja con el mismo `update` que el 04), con controles que se afirman, no se suponen.

**Coherencia `lib/notas/coprofesional.ts` ↔ base.** El selector de `servidor.ts` filtra `rol in
ROLES_COPROFESIONAL`, `estado = 'activo'`, alta vigente en el centro del episodio, excluye al autor y
exige `episodio.centroId`. Es la misma regla que 7b, 7b', 7c y el check de tabla. La constante entra
en el mismo commit que la migración (d9c5b55), como decidió el propietario.

## Hallazgos

### BAJA

**H1 · `supabase/migrations/20261004120000_centro_congelado_y_coprofesional.sql:133-134`. La
condición de «activo» es una lista cerrada (`is distinct from 'activo'`), pero su mensaje y su prueba
la tratan como si fuera binaria. `estado_perfil` tiene tres valores (`activo`, `suspendido`, `baja`).**
- Primer escenario: un perfil con `estado = 'suspendido'` se pone como coprofesional. La base lo
  rechaza (bien), pero con el texto «El coprofesional está de baja», que es falso, y ese texto es lo
  que queda en el log del servidor.
- Segundo escenario, el que importa: alguien «alinea» el código con el mensaje y escribe `if v_estado
  = 'baja'::public.estado_perfil`. Es una lista negativa, justo lo que D5/D6 prohíben para el rol. El
  banco sigue verde, porque 19.57c solo prueba `baja`, y un perfil suspendido entra como coprofesional
  y queda sellado en la cadena al firmar.
- El diseño fija la lista cerrada del rol con una prueba de catálogo (19.62) por ese mismo motivo. La
  del estado no tiene prueba ni de comportamiento (un coprofesional `suspendido`) ni de catálogo.
- Hoy ninguna función pone `suspendido`, así que llegar a ese estado exige SQL directo. Por eso es
  BAJA.

**H2 · `docs/architecture.md:390`. La frase «la lista de roles es cerrada y el director
administrativo no entra» afirma una garantía sin condiciones, y la base solo la da si el ADR-065
guarda al director administrativo como un valor nuevo del enum.**
- Escenario: el ticket del ADR-065 lo guarda como marca en el perfil, con `rol = 'administrador'`. La
  alarma 19.63 no salta. Quien lea la arquitectura entiende que la base ya lo deja fuera, y no toca 7b.
  Un director administrativo entra entonces como coprofesional de notas clínicas.
- El comentario de 7b en la migración sí dice la condición («si ADR-065 se guarda como marca en el
  perfil… su ticket añade la condición en este paso»). La arquitectura, que es la que manda sobre
  «quién ve qué», no la dice.
- El riesgo 3 del diseño pide anotarlo en `state.md` §Hallazgos al cerrar. Esta línea de la
  arquitectura lo contradice mientras tanto.

---

## Revisor 2 de 2 (alcance y consecuencias): 0 ALTA, 1 MEDIA nueva

Diff `git diff main...worktree-agent-a78655777943c5e6c` (HEAD 410046e). Leídos: contrato, diseño §5,
CLAUDE.md y el código de `app/` y `lib/` que toca coprofesionales y centros.

**Coincidencias con el revisor 1.** Llegué por separado a H1 (`suspendido` y el mensaje «está de baja»)
y a H2 (la frase de `architecture.md` sin la condición del ADR-065). No los duplico. A H2 le daría MEDIA
y no BAJA: `architecture.md` manda sobre quién ve qué, y hoy ninguna prueba avisa si el ADR-065 se guarda
como marca (19.62 y 19.63 siguen verdes). Lo decide el orquestador.

**Lo que se comprobó y está bien**
- Territorio: los seis ficheros del diff están en el `territorio:` del contrato (ampliado por el propietario
  con `lib/notas/coprofesional*.ts`). `lib/supabase/tipos-bd.ts` sin cambios. Ninguna política creada ni alterada.
- `ROLES_COPROFESIONAL` cambia en el mismo commit que la migración (d9c5b55), como mandó el propietario.
- `architecture.md` es fiel a la migración en roles, «activo», alta vigente y congelación de `centro_id`; no
  quedan copias de la regla vieja en `docs/` ni en `.claude/rules/`.
- Acceso: nadie gana lectura. Ninguna política ni función lee `coprofesional_id`, y el administrador solo
  gana «poder ser nombrado». Nadie pierde una capacidad de la aplicación: ninguna ruta de `app/` ni de `lib/`
  escribe en `episodios_asistenciales`.
- Código de la aplicación: `servidor.ts` filtra los candidatos con `ROLES_COPROFESIONAL`, `estado = 'activo'`
  y alta vigente (`directorio_perfiles` enseña administradores a cualquier perfil activo). `fijarCoprofesional`
  traduce el 23514 por código, así que los mensajes nuevos no le afectan. Las ramas del corte B de T-012 que
  no se han integrado no tocan `coprofesional.ts` ni usan la lista literal.

### MEDIA

**B-H1** · `scripts/rls/19-nota-en-episodio.sql:791` · La coterapia simétrica solo existe en el banco: el administrador no tiene filas en perfiles_centros en ninguna instalación que la aplicación pueda crear, así que 7c lo rechaza y el selector no lo ofrece; el objetivo del ADR-073.2 no llega al producto.
Escenario: Siembra de demo (seed.sql: «el administrador NO lleva centro») o administrador invitado desde /ajustes/invitar (el formulario limpia centroId para todo rol que no sea técnico, y ninguna ruta de app/ escribe perfiles_centros). Ana abre una nota en un episodio de Madrid: candidatosCoprofesional no trae a Álvaro (lib/notas/servidor.ts lee perfiles_centros con hasta is null); forzado con fijarCoprofesional → 23514 «no tiene alta en el centro del episodio» → coprofesional_invalido. En sentido contrario, Álvaro (episodio abierto por su cita en Madrid) sí puede nombrar a Ana. La asimetría que el ADR-073 acepta «hasta que T-035 se integre» sigue igual tras integrarlo; 19.56 y 19.57 pasan porque el banco inserta (ADM, C35E) como postgres. No es de seguridad: decide el propietario (dar altas de centro al director sanitario por la interfaz o la siembra, o que 7c lo trate de otro modo) y se anota en docs/state.md §Hallazgos.

**Nota sin hallazgo (anterior a T-035, para state.md).** Por la misma vía que B-H1, un profesional invitado
desde la aplicación tampoco tiene `perfiles_centros` y no puede ser coprofesional de nadie (T-034). Y
`episodio_para_nota` reutiliza el único episodio abierto sin mirar el centro de la cita: Ana, que está en
Madrid y en Canarias, atiende en Canarias con un coterapeuta que solo tiene alta allí, y no le aparece en
el selector. Desde T-035 el centro ya no se puede corregir en la base; desde la aplicación nunca se pudo.
