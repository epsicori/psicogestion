---
id: T-013a
titulo: Registrar un acceso a la historia, desde la base
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-006]
bloquea: [T-013]
estado: hecho
territorio:
  - supabase/migrations/**
  - scripts/rls/09-accesos.sql
  - lib/supabase/tipos-bd.ts
  - lib/cuentas/accesos.ts
  - lib/cuentas/accesos.test.ts
---

# Contexto

El ADR-037 dice que las aperturas repetidas dentro de la ventana del desbloqueo son **un
solo acceso con contador de vistas**, y la base ya lo tiene escrito como un hecho:

```sql
create unique index accesos_historia_ventana_idx
  on public.accesos_historia (desbloqueo_id, paciente_id, pestana)
  nulls not distinct
  where desbloqueo_id is not null;
```

El comentario de ese índice prescribe el algoritmo — «la Server Action hace
`insert ... on conflict do nothing` y, si no insertó, registra una vista» — y ahí está el
problema: **ninguna función expuesta devuelve el id del desbloqueo vigente**, y sin ese id
el índice no aplica.

- `desbloqueo_vigente()` devuelve `timestamptz`: el reloj, no la fila.
- `desbloquear_historia(pin)` devuelve `desbloqueado, motivo, caduca_en, bloqueado_hasta`
  (comprobado en `20260830090000`, que es la que la redefine, no la original).
- `desbloqueo_propio_vigente(uuid)` toma el id como **entrada**.
- `select` sobre `desbloqueos_historia` se le **revocó** a `authenticated` en
  `20260822160000:742`, y por una razón que sigue vigente: quien lee esa tabla está a un
  paso de fabricarse un desbloqueo por PostgREST sin teclear el PIN.

Así que exponer el id sería deshacer una decisión de seguridad deliberada, y registrar con
`desbloqueo_id` nulo —que la política `accesos_historia_alta` permite— **desactivaría en
silencio** el índice único: no fallaría nada, simplemente cada apertura sería un acceso
nuevo y el registro que el art. 18 obliga a enseñar quedaría ilegible, que es justo lo que
el ADR-037 quería evitar.

La salida es que el id no salga nunca: el algoritmo entero se mete en la base, detrás de
una función, y la pantalla solo dice *a qué paciente y a qué pestaña* entra.

**Por qué es un ticket aparte y no parte de T-013**: define una función `security definer`
que escribe en una tabla de solo adición. Eso es `riesgo: alto`, y T-013 es `sonnet`.
Meterlo dentro lo enrutaría por la revisión equivocada.

# Alcance

Una función y su prueba. **Ninguna pantalla** — eso es T-013.

## Qué hay que escribir

- [x] `public.registrar_acceso_historia(p_paciente_id, p_pestana, p_agente, p_ip)`,
      `security definer` con `search_path = ''`, que:
      - **Rehace la autorización, no la hereda.** `security definer` se salta la RLS (estas
        tablas no llevan `force row level security`), así que la función comprueba
        explícitamente lo mismo que exige `accesos_historia_alta`: hay sesión, y el llamante
        es administrador o profesional asignado. Sin esto, la función sería un agujero con
        forma de ayuda.
      - **Exige desbloqueo vigente.** La política permite `desbloqueo_id is null` porque hay
        accesos que no salen del candado (exportación, informe, emergencia). Esta función es
        solo para `tipo = 'apertura'`, y una apertura sin desbloqueo no existe: si no lo hay,
        levanta `42501` y no escribe nada.
      - Resuelve el id del desbloqueo vigente **dentro**, y no lo devuelve.
      - `insert ... on conflict ... do nothing`; si no insertó, busca el acceso de esa
        ventana e inserta la vista.
      - Devuelve `acceso_id`, `vistas` y `apertura` (cierto solo la primera vez). El
        contador sale de contar, no de una columna.
- [x] `lib/cuentas/accesos.ts`: el envoltorio tipado, al lado de `candado.ts`. Traduce el
      error a un resultado, como hace `desbloquearHistoria`; no lanza.
- [x] Regenerar `lib/supabase/tipos-bd.ts`.

## Trampas verificadas antes de escribir

- El `on conflict` sobre un índice **parcial** necesita repetir su predicado:
  `on conflict (desbloqueo_id, paciente_id, pestana) where desbloqueo_id is not null`. Sin
  el `where`, Postgres no infiere el índice y la sentencia falla en ejecución.
- `pestana` es nulable y el índice lleva `nulls not distinct`; la búsqueda del acceso ya
  existente tiene que usar `is not distinct from`, no `=`, o no encuentra la fila que el
  `on conflict` acaba de rechazar.
- `accesos_historia_vistas.acceso_id` **no tiene clave ajena** y no puede tenerla (el
  cerrojo de solo adición lo impide). Aquí no se añade.
- La tabla es de solo adición: la función solo inserta. `npm run lint:migraciones` lo
  comprueba.

## Criterios de aceptación (verificables)

- [x] **Automático** (`test:rls`) — con desbloqueo vigente, dos llamadas seguidas con el
      mismo paciente y la misma pestaña dejan **una** fila en `accesos_historia` y **una**
      en `accesos_historia_vistas`; `accesos_historia_resumen.vistas` da 2.
- [x] **Automático** — dos pestañas distintas dentro del mismo desbloqueo son **dos**
      accesos: la ventana agrupa por pestaña, no por paciente.
- [x] **Automático** — **gemela negativa**: sin desbloqueo vigente la función levanta
      `42501` y `accesos_historia` no crece. Es la mitad que hace que el candado signifique
      algo.
- [x] **Automático** — un profesional no asignado al paciente recibe `42501`, aunque tenga
      desbloqueo propio vigente. El desbloqueo abre *mi* historia, no *cualquier* historia.
- [x] **Automático** — el técnico administrativo recibe `42501`.
- [x] **Automático** — tras revocar o caducar el desbloqueo, la siguiente llamada abre un
      acceso **nuevo**, no una vista del anterior.
- [x] **Automático** — `npm run lint:migraciones`, `npm run lint` y `npm run build`
      limpios, y `npm test` verde.

## Estado de entrega

Cerrado el 15-09-2026. Los siete criterios son automáticos y los siete corren en cada
`npm run test:rls`; no hay ninguno manual, que es lo que se pretendía al separarlo de
T-013: una pieza de base de datos no debería necesitar un navegador para creerse.

| Criterio | Dónde se comprueba |
|---|---|
| 1 · una apertura, una vista, `resumen.vistas` = 2 | `scripts/rls/09-accesos.sql` (4 aserciones) |
| 2 · dos pestañas, dos accesos | ídem, 2 aserciones |
| 3 · gemela negativa sin desbloqueo | ídem, 2 aserciones (levanta y **no escribe**) |
| 4 · profesional no asignado, con desbloqueo propio | ídem, 2 aserciones (en los dos sentidos) |
| 5 · técnico administrativo | ídem, 1 aserción |
| 6 · ventana nueva, acceso nuevo | ídem, 7 aserciones: **revocada y caducada por separado** |
| 7 · comandos limpios | ver abajo |

`test:rls` **380 aserciones** (eran 360) · `lint:migraciones` 12 limpias · `lint` limpio ·
`npm test` **438 pruebas en 46 ficheros** · `build` limpio.

El criterio 6 acabó con el doble de aserciones de las previstas porque la ventana se cierra
por **dos** cláusulas distintas de la misma consulta —`revocado_en is null` y `caduca_en >
now()`— y probar solo el botón de bloquear habría dejado sin probar justo la mitad que
cierra sola una historia olvidada en una mesa compartida.

**Lo que este ticket NO tiene**: verificación ni revisión independientes. Lo implementó y
lo comprobó el mismo agente, por decisión del usuario («hazlo tú»). Las aserciones son
reales y están en el árbol; lo que falta es el segundo par de ojos que el enrutado por
riesgo pide para un `opus`.
