---
id: T-051
titulo: La siembra completa trae bonos en los tres estados (vigente, agotado, caducado)
modelo: sonnet
riesgo: bajo            # solo datos de desarrollo; sin migración, sin RLS, sin acción nueva
fase: 2
prioridad: media        # sin esto, la QA visible de T-027 y siguientes necesita SQL a mano
depende_de: [T-027]     # la pantalla que pinta los estados; las tablas son de T-021
estado: pendiente
delegable: no           # pasa por el disparador fn_bono_de_la_cita y por la cuenta del pendiente
territorio:
  - supabase/seed-completo.sql
  - docs/bitacora/T-051.md
  - docs/state.md
---

# Contexto

Hallazgo de la QA visible de T-027 (16-10-2026, `docs/state.md` «QA visible»). Los criterios 5 y
6 de T-027 piden ver un bono **agotado** y uno **caducado** en `/facturacion/bonos`. La interfaz no
puede fabricar ninguno de los dos:
- **agotado** exige citas realizadas con el bono, y no hay control de «marcar realizada»;
- **caducado** exige una caducidad pasada, y el formulario no la admite.

Para la QA se crearon con SQL a mano (`b0270000-…a1` y `b0270000-…c1`), y desaparecen con el
siguiente `db reset`. El propietario quiere que cada verificador haga la QA visible solo, sin
criterios manuales, así que esos datos tienen que venir de la siembra.

El estado no se guarda: lo deriva `leerBono` (`app/(app)/facturacion/bonos/estado.ts`) a partir
de `bonos_consumo` y del día de hoy en la zona de la organización. Agotado prevalece sobre
caducado. Un bono vigente avisa con `pocas` (2 sesiones o menos) o con `caduca` (30 días o menos).

## Tareas

- [ ] Una sección nueva en `supabase/seed-completo.sql`, **8.quater · T-051 · Bonos**, detrás de
      la 8.ter y antes de la 9 (la baja). Siembra los cuatro bonos de las Notas.
- [ ] Al cerrar: quitar de `docs/state.md` la propuesta «bonos de los tres estados en
      `seed-completo.sql`» del hallazgo «QA visible», y escribir `docs/bitacora/T-051.md`.

## Criterios de aceptación (verificables)

- [ ] **Automático**: tras `npx supabase db reset` y `npm run seed` (contenedor
      `supabase_db_Psicogestion`; comprobar la línea `Contenedor:`), esta consulta da exactamente
      las cuatro filas de las Notas:
      ```sql
      select b.id, p.nombre, c.sesiones_totales, c.sesiones_consumidas, c.caducidad
        from public.bonos_consumo c join public.bonos b on b.id = c.bono_id
        join public.pacientes p on p.id = b.paciente_id
       where b.id::text like 'e0510001-%' order by b.id;
      ```
- [ ] **Automático, idempotencia**: un segundo `npm run seed` seguido no cambia ni el número de
      filas de `bonos`, ni el de citas con `bono_id`, ni la salida de la consulta anterior. Se pegan
      las dos salidas.
- [ ] **Automático**: `npm run verificar:huellas` dice «cadena íntegra», y
      `npm run test:rls`, `npm run test:facturacion` y `npm test` siguen verdes sobre la base
      resembrada.
- [ ] **Automático**: `git diff --stat main -- supabase/migrations/ scripts/rls/` está vacío.
- [ ] **QA visible (verificador, navegador a la vista)**, con `qa.mjs visita /facturacion/bonos`
      como administrador y como `ana@psicogestion.test`:
      - Carmen sale **Caducado** con su fecha;
      - Lucía sale **Agotado** con 2 de 2;
      - Hugo sale **vigente** sin aviso;
      - Sofía sale **vigente** con el aviso de caducidad.

      No hay ningún control que cambie el estado. 0 errores de consola. Capturas a 1280 px y a
      360 px en `.claude/qa/visitas/T-051/`.
- [ ] **QA visible**: en `/facturacion`, «Por paciente» sigue pintándose sin desbordar a 360 px
      con los importes nuevos de Lucía y Carmen. Si `facturacion.spec:41` ya fallaba antes (está
      anotado en T-046), se dice, con la salida de `main` sin el ticket.

## Notas para el agente

**Los cuatro bonos.** Identificadores literales `e0510001-0000-4000-8000-00000000000N`. Todos
llevan `creado_por = k_adm` (el administrador da de alta los bonos, como en T-027).

| N | Paciente | Sesiones | Importe | Caducidad | Citas con el bono | Estado que se espera |
|---|---|---|---|---|---|---|
| 1 | Lucía (`d0080001-…001`) | 2 | 90,00 | null | las dos realizadas **más antiguas** de 8.bis (`e0280004-…005` y `…006`) | agotado, 2 de 2 |
| 2 | Carmen (`k_p_carmen`) | 5 | 200,00 | `(k_fecha_base + interval '30 days')::date` = 2026-10-01 | ninguna | caducado |
| 3 | Hugo (`k_p_hugo`) | 10 | 400,00 | null | ninguna | vigente, sin aviso |
| 4 | Sofía (`k_p_sofia`) | 8 | 320,00 | `current_date + 20` | ninguna | vigente, aviso `caduca` |

- **`creado_en`**: `k_fecha_base` en los cuatro. Nada de `now()` suelto: la cabecera del fichero
  lo prohíbe.
- **La caducidad de Sofía** es la única fecha relativa al día de la siembra. Es la misma excepción
  que ya hacen la 8 y la 8.bis con `current_date`: con una fecha fija, el aviso `caduca` dejaría de
  salir al mes. El comentario de la sección lo dice.
- **Inserción**: `insert … on conflict (id) do nothing`. `bonos` es de solo adición: los
  disparadores `impedir_modificacion_bonos` rechazan cualquier `update`.
- **Las citas de Lucía.** Se asignan con
  `update public.citas set bono_id = … where id in (…) and bono_id is null`:
  - **por qué así**: `fn_bono_de_la_cita` (versión de `20261011130000_economico_ronda_3.sql`)
    admite poner el bono **una vez**, de nulo a un bono, en una cita realizada o pasada; cambiarlo
    o quitarlo lanza 42501;
  - **idempotencia**: la guarda `bono_id is null` es lo que la da. Un segundo `seed` no toca nada;
  - **el bono es del mismo paciente** que la cita, así que no salta el 23514;
  - **el orden importa**: el `update` va después del de 8.bis, que pasa las citas a `realizada`.
    `bonos_consumo` solo cuenta las realizadas.
- **Por qué las dos más antiguas**: deja en Lucía cuatro realizadas sin bono, que siguen devengando
  a la tarifa y siguen siendo elegibles para un borrador (T-046).
- **El pendiente cambia, y está bien**: los cuatro importes entran en `pendiente_por_paciente`
  (`20261013120000_cobros_y_pendiente.sql:125`), y las dos citas con bono dejan de devengar a la
  tarifa.
  - Hay que comprobar que ninguna prueba fija un importe sembrado: `rg -n "Márquez|Ruiz|Nieto|Vidal" accesibilidad scripts/rls`.
  - Si alguna lo fija, se para y se anota en `docs/state.md`; no se toca la prueba (está fuera
    del territorio).
- **Comentario de la sección**, en el tono del resto del fichero: qué caso raro cubre cada bono y
  por qué no se puede fabricar desde la interfaz.

## Preguntas abiertas al propietario (con recomendación)

Ninguna. El reparto de los cuatro bonos es una elección de datos de prueba, no de producto.

## Lo que no entra, y por qué

- **Un bono con prórroga** (fila en `bonos_caducidades`): ninguna pantalla la pinta todavía.
- **Un bono con sesiones excedidas** (más realizadas que totales): `leerBono` lo calcula, pero
  ningún criterio de T-027 lo enseña. Cuando una pantalla lo pinte, se siembra en su ticket.
- **El aviso `pocas`**: lo cubre el agotado, que pasa por 2 y 1 sesiones restantes en las
  unitarias de `estado.test.ts`. Sembrar un quinto bono solo para eso no lo pide ningún criterio.
- **Quitar los bonos `b0270000-…` creados a mano**: desaparecen solos con el `db reset` del
  primer criterio.
