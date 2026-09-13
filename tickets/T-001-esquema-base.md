---
id: T-001
titulo: Esquema base — organización, centros, perfiles, paciente e historia
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-000]
estado: hecho
---

# Contexto

T-000 dejó tres tablas de juguete (`perfiles`, `pacientes`, `auditoria`) para fijar los
patrones. Este ticket levanta **el esquema que no se puede añadir después**: todo aquello
cuya ausencia obligaría a migrar datos clínicos ya sellados.

La lista no la inventa este ticket. Sale entera de la tabla de reparto de `PLAN.md`
(columna «T-001 esquema») y de los ADR que la generaron: **026** (candado), **027**
(anotaciones reservadas), **028** (menores), **029** (DNI), **030** (pareja y familia),
**031** (duplicados), **032** y su enmienda (baja del profesional, titularidad), **033**
(centros y retención), **034** (zona horaria), **035** (contenido canónico), **036**
(borrador), **037** (accesos).

Referencias: `docs/architecture.md` §Dominios de datos, §Los cuatro invariantes,
§Separación por sensibilidad, §Candado, §Registro de accesos, §Retención, §Personas
alrededor del paciente, §Reserva de anotaciones subjetivas.

**Frontera del ticket, explícita.** Entra el dominio **Organización**, el **Paciente
identificativo** y el **Paciente clínico**. **No entra** Agenda, Económico, Firmas ni
Mensajería: son fase 1 y añadirlos luego no cuesta migración porque no cuelga nada de
ellos todavía. Dos excepciones, y por qué: `alertas_documentacion` **sí entra**, porque de
ella se alimentan la bandeja y las métricas sin abrir el candado (choque 11 de
`interfaz.md`); y `zona_horaria` en organización y centro **también**, porque después
obligaría a migrar `citas`, `series_cita` y `disponibilidad` a la vez (ADR-034).

De `citas` y `series_cita` **no se escribe ni una columna aquí**: lo que el ADR-034 deja
para su ticket se queda en su ticket.

## Tareas

- [x] **Organización y centros.** `organizacion` con restricción de fila única, NIF, y
      `zona_horaria` validada contra `pg_timezone_names`, `Europe/Madrid` por defecto.
      `centros` con `zona_horaria` **anulable**: nulo significa heredar, nunca «sin zona».
      → migración §2; validación por disparador `fn_validar_zona_horaria` + `es_zona_iana`.
- [x] **`politicas_retencion` colgando del centro** (ADR-033), con la fila de la
      organización como valor por defecto heredable y mínimos legales por debajo de los
      cuales no se puede bajar. Función de resolución que **jamás devuelve nulo** para un
      centro sin política propia.
      → migración §3 (fila semilla + veto de borrado) y `retencion_efectiva()` en §14.
- [x] **`perfiles` ampliada**: `estado` (`activo`, `suspendido`, `baja`) con fecha,
      `centro_id` **obligatorio solo para `tecnico_administrativo`** (restricción de la
      base, no de la aplicación), y restricción que **impide dar de baja al último
      administrador activo** (ADR-032).
      → migración §4; `check perfiles_tecnico_exige_centro` + `constraint trigger`
      `impedir_baja_ultimo_administrador` (§15).
- [x] **`preferencias_usuario`**, una fila por perfil. → migración §5.
- [x] **Candado (ADR-026)**: `pines_historia` (hash bcrypt, contador de fallos, instante
      de bloqueo) **sin `select` para ningún rol**, y `desbloqueos_historia` (perfil,
      concesión, caducidad, revocación) como **estado operativo mutable**, no de solo
      adición. → migración §6; cero grants en §17.
- [x] **`pacientes` ampliada**: `titularidad` (`organizacion` por defecto, `profesional`),
      `fusionado_en` con su disparador anti-cadena (ADR-031) y las columnas de traspaso de
      la enmienda del ADR-032.
      → migración §7; `fn_normalizar_fusion_paciente` + `fn_repuntar_fusionados`.
- [x] **`pacientes_identificacion`** (invariante 3): `dni_cifrado` (AES-256-GCM, nonce
      aleatorio) y `dni_indice` (HMAC-SHA-256) con **índice único**, más domicilio
      cifrado. Ninguna columna en claro (ADR-029). → migración §7.
- [x] **`representantes_paciente`** con tipo, alcance y **vigencia desde/hasta
      obligatoria**, más `capacidad_consentimiento(paciente, fecha)` que **calcula** quién
      consiente (ADR-028). Prohibida cualquier bandera `es_menor`.
      → migración §7 y §14. `vigente_desde not null`, `vigente_hasta` nulable: punto
      abierto (c) del diseño, aprobado.
- [x] **`consentimientos`** con **N firmantes** y la casilla «menor oído» con fecha.
      → migración §7: `consentimientos` + tabla hija `consentimiento_firmantes`.
- [x] **Episodios**: `episodios_asistenciales` con `modalidad_relacional`
      (`individual`, `pareja`, `familiar`, `grupo`) y fecha de cierre —que es la que
      arranca el reloj de retención—, `episodio_participantes` con alta y baja,
      `diagnosticos` (CIE-10-ES + columna paralela DSM-5-TR, decisión 7) y
      `valoraciones_riesgo`. → migración §8.
- [x] **Notas**: `notas_clinicas` como **cabecera mutable** con el borrador
      (`borrador_contenido`, `borrador_actualizado_en`, autor) y bloqueo optimista
      (ADR-036); `notas_clinicas_versiones` de **solo adición** con `cuerpo`,
      `anotaciones_reservadas` (ADR-027), `contenido_canonico`, `huella`,
      `huella_anterior`, `algoritmo_version`, `esquema_version`, `motivo_cambio` y
      `alcance` (`individual` | `conjunta`, ADR-030). → migración §9. `cuerpo` y
      `contenido_canonico` son **`text`**, verificado en `tipos-bd.ts`.
- [x] **`evaluaciones`, `evaluacion_archivos`, `informes`.** → migración §10.
- [x] **`accesos_historia`** con **tipo** (apertura, exportación, informe, emergencia),
      pestaña y **contador de vistas** (ADR-037). → migración §11: el contador se calcula
      en la vista `accesos_historia_resumen` sobre `accesos_historia_vistas`, porque un
      contador mutable rompería el criterio 11.
- [x] **`alertas_documentacion`**, que es lo que la bandeja y las métricas leen **sin
      abrir el candado**. → migración §12.
- [x] RLS **activo en todas las tablas nuevas** desde esta migración, con `grant`
      explícitos y `alter default privileges ... revoke all`. Las políticas son T-002.
      → migración §16 y §17. `pg_tables where not rowsecurity` = 0; cero grants a `anon`
      y `service_role`; cero `delete`; saneadas también las secuencias.

## Criterios de aceptación (verificables)

- [x] **Automático** — `npx supabase db reset` aplica las migraciones sin error y
      `npm run tipos` regenera `lib/supabase/tipos-bd.ts`.
      → `Applying migration 20260822094547_esquema_base_organizacion_paciente_historia.sql`
      … `Finished supabase db reset on branch main.`, sin una sola línea `ERROR:`.
      `npm run tipos` deja el fichero en 1656 líneas, con `organizacion:` (877),
      `pines_historia:` (1109), `accesos_historia_resumen:` (1356) y
      `nivel_riesgo: "bajo" | "moderado" | "alto"` (1426); 1419 líneas de diferencia
      frente a la versión anterior al ticket.
- [x] **Automático** — `npm run lint` y `npm run build` limpios.
      → `eslint` sin salida. `build`: `✓ Compiled successfully in 8.1s`,
      `Finished TypeScript in 2.5s`, `✓ Generating static pages (7/7)`, rutas `/`,
      `/login`, `/pacientes`, `/prototipo`. **`tipos-bd.ts` NO ha necesitado
      `globalIgnores`.**
- [x] **Automático** — un segundo `insert` en `organizacion` **falla**.
      → `ERROR: duplicate key value violates unique constraint
      "organizacion_fila_unica_key" · DETAIL: Key (fila_unica)=(t) already exists.`
- [x] **Automático** — `insert` de un centro con `zona_horaria = 'CEST'` o `'+02:00'`
      **falla**; con `'Atlantic/Canary'` pasa.
      → los dos primeros: `ERROR: Zona horaria no válida: … (ADR-034)` (22023).
      `'Atlantic/Canary'` inserta. **Además, y como exige el ADR-034 aunque el ticket no
      lo pidiera: `'CET'` y `'Etc/GMT+2'` también fallan, pese a estar los dos en
      `pg_timezone_names`** (comprobado en el mismo guion). Zona nula pasa y
      `zona_horaria_centro()` la resuelve a `Europe/Madrid`.
- [x] **Automático** — un centro **sin** `politicas_retencion` propia resuelve a la de la
      organización; la función de resolución **nunca devuelve nulo**.
      → `25 | 5 | organizacion` para el centro sin política, para un uuid inexistente y
      para `null`; `filas = 1, con_nulos = 0`. Con política propia: `30 | 10 | centro`.
      La fila de la organización **no se puede borrar**: `ERROR: La política de retención
      de la organización no se puede borrar (ADR-033)`.
- [x] **Automático** — bajar la retención por debajo del mínimo legal del centro **falla**.
      → `ERROR: new row for relation "politicas_retencion" violates check constraint
      "politicas_retencion_check"`. Bajar a 5 con mínimo 5 pasa (`UPDATE 1`).
- [x] **Automático** — `insert` de un `tecnico_administrativo` **sin `centro_id` falla**;
      con `centro_id` pasa. Un `profesional_sanitario` sin `centro_id` pasa.
      → `ERROR: … violates check constraint "perfiles_tecnico_exige_centro"`; los dos
      controles insertan (`INSERT 0 1`).
- [x] **Automático** — poner en `baja` al **último** administrador activo **falla**; con
      dos administradores activos pasa.
      → `ERROR: La instancia no puede quedarse sin ningún administrador activo (ADR-032)`.
      Con dos admins: `UPDATE 1` y uno queda `baja` y otro `activo`. **Cambiar el `rol`
      del último también falla** (mismo error) y **el relevo en dos sentencias dentro de
      una transacción pasa** con `set constraints all deferred`.
      *Matiz honesto*: el `delete` del último administrador también falla, pero con
      `42501` de la comprobación referencial contra `notas_clinicas_versiones`, no con el
      disparador — ver «Hallazgos» al final y `docs/state.md`.
- [x] **Automático** — dos `pacientes_identificacion` con el mismo `dni_indice` violan el
      índice único.
      → `ERROR: duplicate key value violates unique constraint
      "pacientes_identificacion_dni_indice_unico_idx"`.
- [x] **Automático** — `capacidad_consentimiento` devuelve el representante para una fecha
      en que el paciente tiene 15 años y el propio paciente para otra en que tiene 16, **con
      la misma fila**. Ninguna columna booleana de minoría de edad existe en
      `information_schema.columns`.
      → con **una sola** fila de representante (`filas_representante = 1`,
      `sin_caducidad = t`): a `2026-01-01` → `representante | … | 15 | t`; a `2026-07-01`
      → `paciente | | 16 | f`; a `2021-06-16` → `representante | … | 11 | f`.
      Recuento de columnas `boolean` con nombre de minoría de edad: **0**. El control
      confirma que `consentimientos.menor_oido_en` existe y es `date`.
- [x] **Automático** — `update pacientes set fusionado_en = <ya fusionado>` **falla** o
      normaliza al superviviente final; no se crean cadenas de dos saltos.
      → normaliza. `A→B`; `C→A` queda como `C→B`; tras `B→D`, `A`, `B` y `C` apuntan a
      `D`. `cadenas_de_dos_saltos = 0`. Fusionarse consigo mismo: `ERROR: Ciclo de fusión
      detectado … (ADR-031)`.
- [x] **Automático** — `update` y `delete` sobre `notas_clinicas_versiones` y
      `accesos_historia` **fallan**; `update` sobre `notas_clinicas` (cabecera) y sobre
      `desbloqueos_historia` **pasa**.
      → sin privilegio: `ERROR: permission denied for table …` en las dos tablas y en
      `accesos_historia_vistas`. **Tras devolver `update, delete` a `postgres` a la
      fuerza**, con fila presente: `ERROR: La tabla … es de solo adición` en `update` y
      en `delete`. `TRUNCATE` como `postgres`: mismo error en las tres tablas. Mutables:
      `UPDATE 1` en `notas_clinicas` (y el disparador fija `borrador_actualizado_en`) y
      `UPDATE 1` en `desbloqueos_historia`.
- [x] **Automático** — `select` sobre `pines_historia` como `authenticated` **falla** con
      permiso denegado.
      → `ERROR: permission denied for table pines_historia`, igual como `anon` y como
      `service_role`. `role_table_grants` sobre esa tabla: solo `postgres`.
- [x] **Automático** — `select count(*) from pg_tables where schemaname = 'public' and not
      rowsecurity` devuelve **0**.
      → `tablas_sin_rls = 0`. Extras del mismo bloque: `concesiones_a_anon_o_service_role
      = 0`, `grants_de_delete = 0`, `concesiones_en_secuencias = 0`, las políticas RLS
      siguen siendo **solo las cuatro de T-000**, y `perfiles` tiene
      `relforcerowsecurity = f`.

## Guion de comprobación manual

1. `npx supabase db reset` y `npm run tipos`.
2. Abre Studio (`http://127.0.0.1:54323`) y comprueba con `\dp` que ninguna tabla nueva
   concede nada a `anon`, y que `pines_historia` no concede `select` a nadie.
3. `npm run dev` y entra en `/pacientes`: el paseo vertical de T-000 **sigue funcionando**
   sin tocar el código de la pantalla.

## Notas para el agente

- **Es una migración nueva hacia delante**, no una edición de la de T-000. Las columnas se
  añaden con `alter table`; nada destructivo en un solo paso.
- **`perfiles` nunca lleva `force row level security`** — es la regla que hace imposible
  la recursión de `rol_actual()` (T-000 §Diseño).
- Lo que se cifra se cifra **en la aplicación** con `node:crypto` y claves del Vault
  (ADR-029). La migración crea las columnas; **no** instala `pgsodium`.
- El `check` de zona horaria se apoya en `pg_timezone_names`; resuélvelo como disparador o
  como función, y deja escrito por qué esa forma y no la otra.
- Los `grant` explícitos son el riesgo número uno (T-000 §Riesgos): `auto_expose_new_tables`
  está sin definir y sin ellos todo falla con `permission denied` aunque la política sea
  perfecta.
- Las políticas RLS **no van aquí**. Aquí va `enable row level security` y nada más: una
  tabla con RLS activo y sin política deniega todo, que es el estado correcto hasta T-002.
- La cadena de huellas no se calcula en este ticket (es T-005). Aquí solo existen las
  columnas donde va a vivir.
- Si aparece una decisión no cerrada en `decisions.md`, **se para y se escala**. No se
  decide dentro del ticket.

---

## Anexos

- Diseño aprobado: `tickets/T-001/diseno.md` (490 líneas).
- Resultado, evidencia y revisiones: `tickets/T-001/revisiones.md` (143 líneas).
