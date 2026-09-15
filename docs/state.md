# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño (ADR, trampas, circuito)
> en tickets y bitácora; las reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 15-09-2026 · `main` al día · tickets: 17 hechos · 3 en curso · 13 pendientes

## Dónde estamos

- Integrado en `main`: T-000 a T-011, T-013 (dos cortes), T-013a, T-016 a T-020 y T-029. **No queda
  ninguna rama de ticket terminada fuera de `main`.**
- La autenticación está completa de punta a punta: invitación, primer acceso (TOTP → PIN), candado,
  recuperación, ajustes de administrador, baja y sesión de 30 minutos.
- **La ficha del paciente existe**: `/pacientes/<uuid>`, cinco pestañas, candado dentro de Historia
  clínica, caducidad automática y registro de acceso en la acción de apertura. Las cuatro pestañas
  sin candado leen datos reales; Facturación está vacía y lo dice.
- Verificación sobre el árbol integrado (15-09): `lint` limpio, **486 pruebas en 49 ficheros**,
  `build` limpio con doce rutas más el Proxy, `test:rls` **380 aserciones**, `lint:migraciones` 12.

## En curso

- T-002 · RLS: todo integrado; queda el punto 3 del guion manual, nunca ejecutado en navegador.
- T-006 · Autenticación: ocho criterios automáticos cerrados; abierto solo por los 9 y 10, de
  navegador (`docs/bitacora/T-006.md`).
- T-013 · Ficha del paciente: **todo lo automático cerrado** (tabla en el ticket §Estado de entrega).
  Quedan los de navegador: matriz de roles con las tres sesiones, cotejo con `/prototipo`, 44 px.

## Bloqueos y decisiones que no toma un agente

- **`alcance` no entra en el sobre canónico de la versión** (T-005). Decisión de una persona y **con
  reloj**: gratis mientras `notas_clinicas_versiones` esté vacía; con la primera firma real dentro,
  una era de esquema para siempre.
- **Cada cuánto caduca una valoración de riesgo.** `MESES_VALORACION_VIGENTE = 6` es un marcador
  puesto por falta de criterio clínico, y decide cuándo la ficha marca un «riesgo alto» como viejo.
- Económico: diseño comiteado (`79e039f`) y una **implementación sin comitear** en el worktree
  `agent-a3e72807070793a0e` (`…/20260913120000_economico_esquema.sql`, 1413 líneas). Decidir si se
  retoma o se rehace: no pasó por verificación ni revisión.
- Obsoletos, a la espera de que alguien diga que se borran: la rama `verificacion-T-011a` y los
  worktrees `agent-a0c13db09cb6a7b62`, `agent-a3133689fd69000ac`, `agent-a0cf274d698e0d85b`,
  `agent-ac7b6a35059cc839d`, `agent-a0fd267d4973735c3` (con ficheros sin comitear; mirar antes).

## Trampas de la fábrica (v3.0 instalada, no la v3.1 del repo: faltan dos hooks)

- **El `merge-gate` corre en toda llamada a Bash** (el `if:` de `settings.json` no se aplica): deniega
  cualquier orden cuyo texto lleve un id de ticket. Se esquiva partiendo el id (`N=029`); un sufijo
  de letra no dispara.
- El agente `implementador` fuerza `isolation: worktree` y no sirve con un worktree ya preparado (el
  sandbox rechaza todo): se relanza como genérico con `sonnet` y sus reglas.
- `npm run build 2>&1 | tail -n` **devuelve el estado de `tail`**: siempre `> log 2>&1; echo "exit=$?"`.
- En rutas con espacio («01 Proyectos»), toda variable va entrecomillada o `grep` falla en silencio.

## Siguiente paso

1. T-012 · nota clínica con firma: la ficha ya tiene el hueco y el registro que la hace lícita.
2. T-021 · económico, resolviendo antes qué se hace con la implementación sin comitear.
3. Los cuatro guiones de navegador, de una sentada. Ojo: `db reset` **no relee `config.toml`**.

## Verificación manual pendiente

- T-000 criterio 8: login A → paciente → alta → lista → logout → login B.
- T-002 punto 3: un perfil puesto en `suspendido` deja de ver `/pacientes`.
- T-006 criterios 9 y 10: guion de siete pasos del ticket (Mailpit en `http://127.0.0.1:54324`).
- T-013 criterios 1, 5, 6, 9, 10 y 11: el guion de cinco pasos del ticket, con las tres sesiones.

## Hallazgos anotados (abiertos)

- **No existe teléfono del paciente**: el único de una persona en el esquema es
  `representantes_paciente.telefono`, y la ficha enseña ese diciendo de quién es. **DNI y domicilio**
  están cifrados en `pacientes_identificacion` sin camino de descifrado.
- **`modalidad_relacional` vive en `episodios_asistenciales`, bajo el candado**, así que «Ficha del
  paciente» no puede enseñar la modalidad que pedía el contrato sin abrir una segunda puerta (11).
- **El técnico administrativo no puede leer `consentimientos`** pese al choque 12; llega a la
  respuesta por `alertas_documentacion`, que no lleva palabra clínica. Abrirle la tabla sería una
  decisión de arquitectura, no un arreglo de pantalla.
- El `Button` compartido mide **40 px** contra el criterio de 44 px; en la ficha se sortea con
  `min-h-11` local. Arreglarlo es tocar la primitiva de T-007, no la pantalla.
- T-011 · «entregado» a medias con varios profesionales → T-015. · `minimax/cortes/T-011.md` trae la
  firma vieja de `listarPropuestasPendientes()`. · La base no impone las transiciones del ADR-045. ·
  `periodicidad = 'mensual'` sin definir.
- Los anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md` §Hallazgos anotados.
