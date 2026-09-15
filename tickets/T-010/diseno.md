## Diseño aprobado · 06-09-2026

### 0 · Hechos verificados contra el esquema (no supuestos)

| Hecho | Consecuencia |
|---|---|
| **No existe ningún enum de IVA ni de régimen fiscal.** Los trece enums de `public` son los de T-001 y ninguno lo es | El ticket dice «reutilizar el de T-001 si existe; si no, crearlo aquí». Se crea `regimen_iva` aquí, mínimo |
| **`btree_gist` está disponible pero NO instalada.** Las extensiones viven en el esquema `extensions` (`pgcrypto`, `uuid-ossp`, `pg_net`) | `create extension btree_gist with schema extensions`, e invocación cualificada por `search_path = ''` |
| **`alertas_documentacion` tiene política de `SELECT` y de `UPDATE`, y ninguna de `INSERT`** | Confirmado: la escribe este ticket, como decía T-002 |
| **`fn_auditar()` se cuelga con argumentos**: `EXECUTE FUNCTION fn_auditar('id', 'borrador_contenido')` — la clave primero, las columnas recortadas después | Las cuatro tablas nuevas siguen ese patrón exacto |
| **El modelo de vista acotada es `pacientes_indicador_riesgo`**: `security_invoker=false, security_barrier=true`, filtrando con `rol_actual() = 'tecnico_administrativo'` y `centro_id in (select centros_actuales())` | La vista de agenda del técnico se calca de ahí |
| **`es_zona_iana(text)` y `centros_actuales()` existen** | No se reescriben |
| **El orden de `estado_cita` YA ESTÁ FIJADO por T-020**, en otro carril: `lib/agenda/estados-cita.ts` congela `programada, confirmada, realizada, cancelada, no_asistida` y lo comenta como «contrato con T-010» | El enum se declara **en ese orden exacto**. Cambiarlo rompe un contrato que otro carril cerró antes |

### 1 · Lo que se crea

**Enums**: `estado_cita` (cinco, en el orden de T-020), `periodicidad_serie`
(`semanal`/`quincenal`/`mensual`), `motivo_desviacion_cita`
(`reprogramada`/`anomalia_horaria`/`festivo`/`ausencia`), `tipo_disponibilidad`
(`franja`/`ausencia`/`festivo`) y `regimen_iva` (`exento_sanitario`/`general`).

**`regimen_iva` con dos valores y sin el tipo dentro del nombre**: lo sanitario está exento
(art. 20.1.3.º LIVA) y lo pericial no. El 21 % no entra en el nombre del valor porque los
tipos los cambia una ley y un enum no se migra por eso; el porcentaje es dato de facturación
(T-021), no de esquema.

**Tablas**: `tipos_terapia`, `series_cita`, `citas`, `disponibilidad`.
**Columnas nuevas en `perfiles`**: `descanso_activo` (por defecto **cierto**) y
`descanso_minutos` (`check between 5 and 20`, por defecto **10**).

### 2 · La serie lleva hora local; la cita, instante (ADR-034)

`series_cita` guarda `dia_semana smallint`, **`hora_local time`** y **`zona_horaria text`**
validada con `es_zona_iana()`. **Ni un `timestamptz` en la serie**: una serie creada en
enero se correría una hora en julio.

`dia_semana` lleva su `comment on column` diciendo **`isodow`, 1 = lunes**. Postgres tiene
dos convenciones y `extract(dow)` empieza en domingo; equivocarla es un fallo que aparece un
domingo, seis meses después, en una sola cita.

`citas` guarda `inicio` y `fin` **`timestamptz`**, y `zona_horaria` como **instantánea del
centro al materializar**: qué zona regía cuando se acordó, que no es necesariamente la que
rige hoy.

### 3 · El descanso vive dentro del rango, no en la aplicación

`rango_bloqueante tstzrange` = `[inicio, fin + descanso)`, calculado por
`fn_calcular_rango_bloqueante()` en `before insert or update of profesional_id, inicio, fin`.

- **Solo por detrás.** Con 50 de sesión y 10 de descanso, 10:00–10:50 y 11:00–11:50 son
  válidas. Aplicarlo por los dos lados exigiría veinte minutos entre sesiones; la simetría
  sale gratis porque toda cita lleva el suyo.
- **Queda congelado.** El disparador solo recalcula si cambian `profesional_id`, `inicio` o
  `fin` —es decir, si la cita se mueve, que es un acuerdo nuevo—. Cambiar
  `perfiles.descanso_minutos` **no toca ni una fila** de `citas`: mover lo ya acordado con
  un paciente porque el profesional cambió un ajuste es exactamente lo que no debe pasar.
- **Agujero conocido y aceptado**: activar el descanso hoy no protege el hueco anterior a
  una cita ya reservada sin él. Es el precio de no tocar lo acordado y se nota el primer
  día. **No se arregla recalculando en cascada.**

**Restricción de exclusión `citas_sin_solape_profesional`**: `exclude using gist` sobre
`profesional_id` con `=` y `rango_bloqueante` con `&&`, **`where estado in
('programada','confirmada','realizada')`**. El nombre es explícito y estable **porque la
aplicación lo captura por nombre** (T-028) para responder «ese hueco acaba de ocuparse» con
sugerencias nuevas, en vez de con un error muerto. Cancelar libera el hueco sin borrar nada,
que es lo que hace la cláusula `where`.

### 4 · Quién ve qué

| Tabla | Administrador | Profesional | Técnico administrativo |
|---|---|---|---|
| `citas` | todas | `profesional_id = auth.uid()` | **ninguna por `select` directo** |
| `citas_agenda` (vista) | — | — | las de sus centros, **sin `tipo_terapia_id` ni `nota_operativa`** |
| `tipos_terapia`, `disponibilidad` | escribe | lee; escribe su propia disponibilidad | lee |

**El técnico no tiene política de `SELECT` sobre `citas`, y eso es el diseño, no un
olvido.** El choque 4 dice que no ve el tipo de terapia, y el invariante 3 que la fila se
**omite**, no se tacha ni se filtra en la consulta de la aplicación. Una política que le
diera la fila entera y confiara en que la pantalla no pinte dos columnas es justo lo que el
invariante prohíbe. Lee por `citas_agenda`, `security_barrier`, calcada de
`pacientes_indicador_riesgo`. Escribir sí: `insert` y `update` acotados por
`centro_id in (select centros_actuales())` —plural, ADR-051—, porque gestionar la agenda es
suyo.

### 5 · La alerta de nota sin firmar

Disparador `after update of estado on citas` que, cuando una cita pasa a `realizada` y su
`fin` ya quedó atrás sin versión firmada, inserta en `alertas_documentacion` una fila
`nota_sin_firmar` con `origen_tabla = 'citas'`.

**Dos cosas que hay que mirar antes de escribirlo**, y que no estaban en el ticket:

1. `alertas_documentacion.origen_tabla` tiene un `check` que hoy admite `notas_clinicas`,
   `consentimientos`, `informes` y `evaluaciones` — **no `citas`**. Hay que ampliarlo, y
   ampliar un `check` es una migración hacia delante: se cae y se recrea, sin ventana en la
   que la tabla quede sin restricción.
2. **La alerta no lleva ni una palabra clínica**: vive fuera del candado porque alimenta
   contadores. Solo identificadores y fechas.

### 6 · Auditoría, con recorte

`fn_auditar()` en las cuatro tablas nuevas. **`citas.nota_operativa` va recortada.** Por
definición es logística —sala, material, aviso de acceso— y no debería llevar nada clínico
(choque 3), pero el choque existe precisamente porque en el prototipo se usa para lo
contrario. La auditoría la lee el propio actor y no está bajo el candado del ADR-026: copiar
ahí un campo de texto libre que la gente usará mal es la misma lección que costó la revisión
de T-002. El resto de columnas son identificadores, instantes y estados, y sí entran.

### 7 · Orden de la migración

1. `create extension btree_gist with schema extensions`
2. Enums
3. `perfiles`: dos columnas nuevas con sus `check` y sus `comment on column`
4. `tipos_terapia` → `series_cita` → `citas` → `disponibilidad`
5. `fn_calcular_rango_bloqueante()` y su disparador; la restricción de exclusión **después**
   del disparador, o las filas entrarían sin rango
6. `esta_en_curso(uuid)`, `stable`
7. Ampliación del `check` de `origen_tabla`, disparador de alerta y política de `insert`
8. Vista `citas_agenda`
9. Políticas RLS
10. `revoke` y `grant` neutralizando los privilegios por defecto de Supabase

### 8 · Riesgos, por probabilidad

1. **Confundir `dow` con `isodow`.** Mitigado por el `comment on column` y por una aserción
   del banco que lo comprueba.
2. **Recursión de políticas** (`infinite recursion detected in policy`) si una política de
   `citas` consulta una tabla cuya política consulta `citas`. Salida: función
   `security definer`, como ya hizo T-002.
3. **La restricción de exclusión sin `where`** bloquearía también las canceladas y haría
   imposible reprogramar sobre un hueco liberado.
4. **`btree_gist` sin cualificar** con `search_path = ''`: falla al crear la restricción, no
   al usarla, así que se ve pronto.
