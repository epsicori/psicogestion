No hay ningún hallazgo ALTA en la mitad TypeScript e interfaz. Por esta mitad, el gate de la etapa pasa.

# T-032: revisión 2 de 2, tercera ronda (aplicación, `lib/cifrado`, formulario, ficha, primitivas y sus pruebas)

- **Diff revisado:** `git diff main...0494226`, rama `worktree-agent-a2fbeaf1f1cdd100e`.
  - Alcance: `app/**`, `components/**`, `lib/cifrado/**`, `lib/i18n/es.ts`, `lib/supabase/tipos-bd.ts` y `docs/**`.
  - Para contrastar la lectura con la tabla he mirado también la definición de `pacientes_salud_basica` y de `es_profesional_asignado`, pero la parte SQL es del otro revisor.
  - Desde la ronda anterior (`e306a30`), mi mitad solo cambia en `datos.ts`, `panel-datos.test.tsx`, `panel-diferido.test.tsx` y `tipos-bd.ts`.
- **Recuento:** 0 ALTA · 1 MEDIA · 2 BAJA.
- **Pruebas ejecutadas en el worktree:** `npx vitest run "app/(app)/pacientes" components/ui/seleccion.test.tsx components/ui/area-texto.test.tsx lib/cifrado` da 13 ficheros y 135/135 en verde.
- **Gate de territorio:** `node ~/.claude/pipeline/territorio.mjs T-032`, lanzado desde el worktree, se ejecuta y termina con exit 0: los 45 ficheros quedan dentro.
- **Contrato:** `git diff main 0494226 -- tickets/` no enseña ninguna diferencia en el contrato de T-032 ni en su diseño. El commit `1fee7b3` trae el contrato enmendado desde `main`, sin cambiar nada: no es una rama que se edite su propio gate.

## Estado de los hallazgos de la ronda anterior

| # | Estado | Comprobación |
|---|---|---|
| H1 (ALTA) | **Cerrado** | `docs/state.md:73-74` vuelve a tener el hallazgo de `centro_id`. `state.md` tiene 79 líneas y describe la segunda vuelta. `git merge-tree` con `main` sale sin conflicto, así que el merge no puede volver a borrarlo. |
| H2 | **Cerrado** | `territorio:` ya incluye los cuatro ficheros (enmienda de `main`) y la herramienta da exit 0 desde el worktree. |
| H3 | **Cerrado (ADR-063)** | `datos.ts:398-431` hace dos cosas antes de consultar: deja fuera al técnico por rol y pregunta `es_profesional_asignado`, la misma función que usa la política `pacientes_salud_basica_lectura`. A un administrador que no es el asignado no se le pinta el bloque, ni siquiera como «sin alergias». En `docs/architecture.md:153`, la fila «Alergias y medicación» dice «Solo los suyos». |
| H4 | **Cerrado** | `panel-diferido.test.tsx:84-107` lee `page.tsx` sin los comentarios de línea. Exige `datos={<PanelDiferido cargar={cargarPanelDatos} />}` y un solo `<PanelDatos`, colocado detrás del `'use server'` de la Server Function y antes de `datos={`. Si alguien vuelve a `datos={<Suspense><PanelDatos …/>}`, fallan las dos. |
| H5 | **Cerrado** | `panel-datos.test.tsx` usa los `cargarIdentificacion` y `cargarSaludBasica` reales y solo sustituye la sesión, el rol y `descifrarIdentificacion`. El caso del criterio 15 hace que `descifrarIdentificacion` rechace, y la prueba exige «No se puede mostrar» y que nunca aparezca «Sin documento registrado». Si el `catch` de `datos.ts:380` devolviera `sin-datos`, la prueba se pondría roja. |

## MEDIA

### H1. La tabla de criterios de la bitácora no se actualizó en esta vuelta: da una cifra caducada y cita como evidencia una prueba que no demuestra el criterio (regla 3)

- **Dónde:** `docs/bitacora/T-032.md:66-67`, `:76` y `:77`, contrastados con `lib/cifrado/aes-gcm.test.ts:45-52`.
- **Qué pasa:**
  - **Criterio 5.** Contrato: «la bitácora anota el número». La tabla dice «sube de las 380 de `main` a **406**», y el criterio 4 remite a esas «406». El pie de la misma bitácora (`:180`) y `state.md:20` dicen 428. Hay dos cifras en el mismo documento, y la que figura como evidencia es de una vuelta anterior.
  - **Criterio 14.** Solo se cita `lib/cifrado/aes-gcm.test.ts`. Su prueba `'12345678z, 12345678-Z y " 12345678 Z " dan el mismo índice tras normalizar'` (`:45`) calcula `indice(CLAVE_A, '12345678Z')` dos veces sobre la misma cadena: compara un HMAC consigo mismo, y su propio comentario lo reconoce. La prueba que sí demuestra las tres formas es `identificacion.test.ts:28`, y la bitácora no la nombra.
  - **Criterio 15.** Habla aún de «prueba de componente de `estado: 'no-legible'`». Desde esta vuelta la prueba ya no parte de ese estado simulado: hace fallar el descifrado real a través de `datos.ts`.
- **Escenario de fallo:**
  1. Alguien quita `normalizarNif` de `cifrarIdentificacion` (`identificacion.ts:204`).
  2. Quien audite el criterio 14 abre el fichero que cita la bitácora: `aes-gcm.test.ts` sigue verde porque no pasa por la normalización.
  3. Solo `identificacion.test.ts:28` se pone rojo, y la evidencia del criterio no lo menciona.
  4. Por su lado, quien lea el criterio 5 anota 406 como total del banco cuando el real es 428.
- **Arreglo esperado (no lo hago):**
  - rehacer las filas 4, 5, 14 y 15 con la salida de esta vuelta;
  - citar `identificacion.test.ts:28` en el criterio 14;
  - renombrar la prueba de `aes-gcm.test.ts:45` a lo que comprueba (el HMAC es determinista) o quitarla.

## BAJA

### H2. «Lo vigente es la última fila» borra de la ficha el campo que la fila nueva no trae

> Es el mismo problema que SQL-H1 del otro revisor (MEDIA en su mitad), visto desde el lector. En `revision.json` figura como TS-H2 y se cierra junto con SQL-H1.

- **Dónde:** `app/(app)/pacientes/[id]/datos.ts:414-430` (lee la última fila entera) y `panel-datos.tsx:133-136` (pinta `null` como «Sin alergias registradas»).
- **Qué pasa:** la tabla admite filas con un solo campo, porque `fila_no_vacia` exige al menos uno de los dos, no los dos. `grant insert` y la política `pacientes_salud_basica_alta` dejan insertar hoy al profesional asignado por PostgREST. El lector toma los dos campos de la última fila, así que una fila que solo trae medicación borra de la ficha una alergia que figura en una fila anterior. ADR-063 dice que «vaciar» no tiene forma todavía, pero no decide si cada fila es una foto completa o un cambio parcial. Tampoco lo dice el comentario de `cargarSaludBasica`.
- **Escenario de fallo:**
  1. Un paciente se da de alta con `alergias = 'Penicilina'`.
  2. Después, su profesional asignado inserta `{paciente_id, medicacion_actual: 'Sertralina 50 mg'}` por PostgREST. Lo mismo haría la futura pantalla de edición si interpreta «cada cambio es una fila nueva» como «solo lo que cambió».
  3. La ficha pinta «Alergias: Sin alergias registradas» para un paciente alérgico a la penicilina.
- **Decisión (del propietario o del ticket de edición, no del implementador):** hay dos salidas:
  - fijar que cada fila es una foto completa, con un comentario en la tabla o en el ADR y el `insert` de la edición copiando los dos campos;
  - o leer la última fila no nula de cada campo, lo que choca con el futuro «vaciar».

  Hoy el único escritor de la aplicación es `alta_paciente`, así que no ocurre desde la interfaz.

### H3. El error de `desdeBytea` lleva el criptograma entero, y `cargarIdentificacion` lo escribe en el log del servidor

- **Dónde:** `lib/cifrado/bytea.ts:24-27` mete `JSON.stringify(valor)` en el mensaje, y `app/(app)/pacientes/[id]/datos.ts:381` hace `console.error(..., errorDescifrado)`.
- **Qué pasa:** el diseño §5 («Trazas») pide que ningún `console.error` imprima el criptograma. Este camino sí lo imprime: el mensaje incluye el valor completo de `dni_cifrado`, que es la primera columna que se convierte.
- **Escenario de fallo:**
  1. PostgREST o supabase-js cambian la serialización de `bytea`, por ejemplo a base64 sin `\x`. Es justo el caso para el que existe ese error.
  2. Cada apertura de la pestaña «Ficha del paciente» escribe en el log el criptograma del DNI de ese paciente.
  3. El log suele estar menos protegido que la base. Si algún día se filtra la clave del Vault, esos DNI se pueden descifrar sin pasar por `leer_identificacion()` y sin dejar rastro en `auditoria`.
- **Arreglo esperado (no lo hago):** que el mensaje diga la longitud y los dos primeros caracteres, no el valor.

## Revisado y correcto en esta ronda

- **`cargarSaludBasica`:**
  - `order('registrado_en', { ascending: false }).limit(1).maybeSingle()` no puede empatar, porque `fn_salud_basica_autoria()` fija `registrado_en := clock_timestamp()` y no `now()`.
  - El índice `(paciente_id, registrado_en desc)` cubre la consulta.
  - Un error de `es_profesional_asignado` devuelve `null` (no se pinta el bloque) y nunca «sin alergias».
  - La fusión se resuelve igual en la función que usa la ficha y en la de la política (es la misma), así que la interfaz y la RLS no pueden discrepar.
- **Pruebas de salud básica en `panel-datos.test.tsx`:**
  - Criterio 7, administrador no asignado: exige que `consultasSaludBasica` siga vacía. Sin la línea `if (asignado !== true) return null`, se haría la consulta y la prueba se pondría roja.
  - La gemela del administrador asignado caería si volviera a quedar fuera el rol `administrador`.
  - La del técnico caería si se quitara el filtro por rol, porque exige que no se llame a `es_profesional_asignado`.
  - La de la última fila exige los tres eslabones: `eq`, `order desc` y `limit 1`.
- **`tipos-bd.ts`:** refleja `id`, `registrado_en` y `registrado_por`, y la FK a `pacientes` deja de ser uno a uno. Ningún código de `app/`, `lib/`, `scripts/` ni de los seeds usa todavía `actualizado_por` ni `actualizado_en` sobre esta tabla (lo he comprobado con grep).
- **`lib/cifrado` (primera vez en mi mitad):**
  - `descifrar` llama a `setAuthTag` antes de `final()`.
  - La base fija `octet_length` a 12 bytes para el nonce y 16 para la etiqueta, así que una etiqueta truncada no puede llegar desde `leer_identificacion()`.
  - `exigirVersion` lanza con su motivo antes de descifrar.
  - La clave solo se pide si hay algo que cifrar.
  - La memoria de claves no tiene respaldo: si falta una clave, lanza.
  - `git grep "console\." lib/cifrado/` sale vacío.
- **Diseño §5, puntos de esta mitad:**
  - El 23505 se traduce a «Ese documento ya está dado de alta», sin nombre ni ficha.
  - `acciones.ts` no reintenta.
  - `git grep pacientes_identificacion app/ lib/` solo encuentra comentarios y el fichero generado, ningún `.from(...)`.
  - `profesional_id` no viaja en la petición.
- **Sin cambios desde la ronda anterior y ya revisados entonces:** `acciones.ts`, `esquemas.ts`, `formulario-nuevo-paciente.tsx`, `panel-datos.tsx`, `panel-diferido.tsx`, `page.tsx` y las dos primitivas.
- **Pendiente y ya anotado, no es hallazgo:** el criterio 17 (navegador) sigue sin ejecutarse y figura en `state.md` §Verificación manual pendiente.
