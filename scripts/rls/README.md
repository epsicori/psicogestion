# Banco de pruebas de RLS

`npm run test:rls` — ejecuta este banco contra la base local (`npx supabase db reset`
antes, si se quiere partir de cero). Sale con código 0 si todo pasa, distinto de cero si
alguna aserción falla, y la salida nombra el rol y la tabla de la que se trataba.

## Cómo funciona

`scripts/test-rls.mjs` localiza el contenedor de la base con `docker ps` (nunca de
memoria: si el proyecto cambia de nombre, `supabase_db_<nombre>` cambia con él), concatena
en el host todos los `scripts/rls/*.sql` en orden alfabético —el contenedor no tiene el
árbol del repositorio montado, así que un `\i` dentro de él no encontraría los ficheros— y
manda el resultado por `stdin` a `psql -v ON_ERROR_STOP=1`, envuelto en un único
`begin ... rollback`: todos los módulos comparten una sola conexión (y por tanto un solo
`pg_temp`) y ninguno deja rastro en la base.

Cada aserción rota es un `raise exception` (`pg_temp.assert` / `pg_temp.assert_lanza`,
definidos en `00-ayudantes.sql`), y con `ON_ERROR_STOP=1` eso basta para que `psql` —y por
tanto el proceso de Node— salga con código distinto de cero. Nadie tiene que leer la salida
para saber si el banco pasó.

Antes de localizar el contenedor, `test:rls` pasa `scripts/rls/fechas-fijas.mjs` (punto 10): si
falla, el banco no llega a la base ni a `docker`.

## Los módulos

| Fichero | Qué prueba |
|---|---|
| `00-ayudantes.sql` | `assert`, `assert_lanza`, `contar()`, `como()` / `reset_sesion()` |
| `01-fijacion.sql` | Los datos propios del banco (independientes del seed de T-008) |
| `02-matriz-roles.sql` | Tabla × rol: la matriz de `docs/architecture.md` §Roles. T-032/ADR-060: el técnico de su centro SÍ lee `pacientes_identificacion` (ya no es la RLS el candado, es no tener la clave); T-032/ADR-061: `pacientes_salud_basica` (ADM y profesional asignado sí, el técnico nunca, en ningún centro) |
| `03-candado.sql` | ADR-026 — desbloqueo, `bloquear_historia`, ventana caducada |
| `04-baja.sql` | ADR-032 — el profesional de baja no lee, su autoría sigue registrada |
| `05-vinculo.sql` | ADR-031 — un solo salto de fusión, siempre |
| `06-centro.sql` | ADR-033/051 — el técnico acotado, el profesional no, retención nunca nula |
| `07-capacidad.sql` | ADR-028 — capacidad de consentimiento en tres fechas, sin bandera. T-032: el contacto de emergencia (`alcance = 'solo_contacto'`) no sale de `capacidad_consentimiento()` aunque esté presente en la tabla, y no puede ser firmante de un consentimiento (23514, `fn_firmante_no_es_solo_contacto`), con su gemela de patria potestad |
| `08-identificacion.sql` | ADR-029 — el índice único rechaza el alta doble. T-032/ADR-060: el técnico no da de alta ni modifica identificación (42501); `clave_de_cifrado()` rechaza a `authenticated` y la lee `service_role`; fila solo-domicilio, fila vacía (23514) y `fecha_nacimiento` nula en `alta_paciente()` (23514); y el rastro de `leer_identificacion()` en `auditoria` (`LECTURA_IDENTIFICACION`, deduplicado en la ventana de quince minutos) |
| `09-accesos.sql` | ADR-037 — listar no es acceso, abrir sí, dos aperturas cuentan una |
| `10-solo-adicion.sql` | Invariante 2 — `update`/`delete`/`truncate` fallan en las tres capas |
| `11-cobertura.sql` | Toda política de `pg_policies` tiene una entrada declarada, y viceversa |
| `12-resto-de-tablas.sql` | `evaluaciones`, `evaluacion_archivos`, `informes`, `consentimiento_firmantes`, `preferencias_usuario`, `perfiles`, `perfiles_centros`, `politicas_retencion` — las tablas que la matriz y las baterías no ejercían bajo ningún rol |
| `13-cuentas.sql` | T-006a — invitación, baja, TOTP y códigos de recuperación; las dos guardas ALTA del segundo factor reciente |
| `14-cadena-huellas.sql` | T-005 — sellado, encadenado, los tres pares del vector congelado con pgcrypto, las negativas de `fn_sellar_version_nota()`, la manipulación con los cerrojos levantados (una intermedia, y el criterio «no reserializa» en sus dos sentidos) y ADR-031 (fusionar no altera ninguna huella), y el cotejo sobre–fila del verificador (T-012b, sección F). T-012c — el sobre de la era 4 (17 claves, `nota_id` incluido) sella la cabecera: negativas 6.11-6.16 con el fragmento exacto del mensaje (todas 23514, así que el código solo no distingue) y un mutante por comprobación (C, sobre `pg_get_functiondef()` guardado con `\gset`, nunca una copia a mano); C.perm — el paso 0 del disparador (quién puede firmar: el mismo 42501 para nota ajena, sobre incoherente, nota inexistente, conjunta y ventana caducada) y la primera firma de un `authenticated` del banco; F.12-F.19 — cada campo de la cabecera y de la fila alterado por debajo con el verificador mutado, y `fecha_sesion` en una zona lejana a UTC. T-036 — sección G: las comprobaciones 6.17-6.24 (borrador vivo, cotejo R2-H1 en NFC, `abierta_en`, ±1 minuto, margen y `redactada_en_sesion` con cita) con un mutante por cada una, y la exención de `postgres` (P1). Regla general: toda firma `authenticated` nueva del banco se construye como la aplicación (borrador vivo, `abierta_en` leído de la cabecera, sobre fechado con el reloj de la base). La carrera real vive en `scripts/t005-concurrencia.sql` (`npm run test:huellas`) |
| `15-agenda.sql` | T-010 — los cinco estados y su orden (contrato con T-020), ISODOW documentado, la zona de la serie, el rango bloqueante con su descanso y su restricción de exclusión por nombre, el congelado frente al cambio de ajuste, esta_en_curso(), el recorte de nota_operativa en la auditoría, la alerta de nota sin firmar y la vista del técnico |
| `16-series.sql` | T-011a — materialización de series (misma hora local, dos `inicio` UTC a los dos lados del cambio de marzo), las dos anomalías horarias deterministas (hueco de marzo, solape de octubre, ancladas a `now()`), festivos y choques de horario propuestos en vez de materializados encima, el disparador de cita pasada (`fn_proteger_cita_pasada`, byte a byte), la marca de origen (una cita desviada no la sobrescribe la serie), el outbox de `centros.zona_horaria` sin mover ninguna cita, y la RLS de `propuestas_cita`/`eventos_salientes` (esta última sin ninguna política). §L: los dos hallazgos de la revisión con Opus — el tipo de terapia que se perdía al confirmar una propuesta, y las dos ediciones de serie en la misma transacción que resolvían contra el mismo evento. §M (T-011b), criterios 4-13 y 16-18 del contrato, en los bloques M.1-M.15 (14 y 15 no tienen bloque) — la ancla acota «esta y las siguientes» (H8); la ancla que cambia de día o salta de semana arrastra al resto dentro de SU semana; la duración de la regla nueva (H9); la hora local a los dos lados del cambio de hora y la anomalía horaria al confirmar en el hueco y el solape; las guardas de la ancla (pasada, en curso, desviada, cancelada) y las de confirmación (desviada, cancelada o empezada entre medias, otra regla, frescura, horario pasado, sin evento, sin horario, otra zona); el cambio de zona con una cita de serie desviada; `UPDATE` e `INSERT` directos sobre `series_cita` retirados (42501) con el camino del dueño intacto; firmas y permisos; la previsualización (recorte mensual, solo lectura, misma fuente que la edición) y el ordinal mensual fijo (ADR-069) |
| `17-vinculo-agenda.sql` | T-029 — ADR-055: el profesional solo agenda para pacientes suyos, y las dos capas por separado (la política cubre el INSERT directo; el disparador cubre las funciones agenda_*, que son security definer y RLS no mira). Con el técnico y el administrador sin acotar, que es la decisión |
| `18-agenda-rango.sql` | T-014 — `agenda_citas_rango()` y `cita_en_curso()`: el técnico recibe solo su centro, con tipo, nota y `nota_pendiente` a NULL y `en_curso` calculado de verdad (R1-R3); el profesional, solo lo suyo con tipo y nota (R4); el administrador, sin duplicados del `union all` (R5); los bordes exactos del intervalo semiabierto y la cancelada (R6); `esta_en_curso()` igual que antes para el dueño (R7); la guarda del rango, 22023 (R8); invoker y sin `anon` (R9). Profesional y paciente propios (PRO18, P18) sin descanso, para poder poner contiguas las dos citas del borde |
| `19-nota-en-episodio.sql` | T-034 — ADR-071: nota sin episodio 23502; episodio_para_nota() abre individual a nombre del llamante (auditado), reutiliza el único abierto, EP001 con varios, elección explícita validada (otro paciente, otro profesional, cerrado); D2: un episodio de otro profesional no se reutiliza aunque es_profesional_del_episodio() sea cierta; D3: centro de la cita o parámetro validado con centros_actuales(); D4: coherencia paciente-episodio y autor-episodio en la base, y las puertas de episodio y participante congeladas con notas. D5 (ADR-072): coprofesional opcional, profesional sanitario distinto del autor con alta en el centro del episodio, congelado al firmar y sin acceso; D6: ninguna nota nueva ni movida en un episodio cerrado (23514). Tras las revisiones (19.48-19.55): for share en el disparador (catálogo), salida anti-oráculo (42501 de la RLS), orden de guardas frente a un episodio ajeno, la otra columna de cada puerta, abierto_en en zonas lejanas a UTC, la cita del llamante y el alta cerrada del coprofesional. T-035 (ADR-073), 19.56-19.63: coterapia simétrica ADM ↔ PRO1 en el mismo centro; el técnico sigue fuera, el administrador sin alta en el centro también y el coprofesional de baja también (con su gemela activa); el centro del episodio se congela con notas (valor → otro, valor → nulo y nulo → valor; como `authenticated` y como `postgres`), con su gemela sin notas y el *no-op* que pasa; la lista cerrada de roles (catálogo) y la alarma del enum para el ADR-065 |
| `20-nota-borrador.sql` | T-012 (corte A) — el borrador: la base fija `borrador_abierta_en` y el testigo (lo que mande el cliente se ignora en insert y update; el testigo no se mueve sin cambio de contenido), el check todo-o-nada y firmar vacía las cuatro columnas; un borrador por cita y autor (23505); márgenes de sesión 0-120 (23514); y D2: firmar resuelve la alerta `nota_sin_firmar` de SU cita (no la de otro paciente, otro profesional ni sin cita; la v2 no mueve `resuelta_en`), con dos mutantes de disparador apagado en el banco (MUT1, MUT2) y, anotados al final, los cuatro de función e índice verificados a mano (resolver sin `estado = 'abierta'`, reabrir con la `abierta_en` del cliente, salida temprana para `authenticated`, índice reducido a `(cita_id)`); B6-B7 repiten el borrador al reabrir y como `authenticated` |
| `21-alta-de-cita.sql` | T-028a — la base del alta (ADR-074): firmas y permisos de las cuatro funciones públicas y de las seis internas, `plan_alta_serie`, `alta_descanso`, `alta_bloqueo_disponibilidad`, `alta_hueco_ocupado`, `alta_exigir_profesional` y `alta_resolver_tipo` (ninguna ejecutable por authenticated ni anon), y el `for share` del tipo (A); los bloques cuentan el descanso (B) y saltan al final del bloqueo (C); límites y parámetros, centro ajeno y la decisión D (profesional que no es sanitario ni administrador activo: 22023 en bloques, previsualización y alta) (D); previsualizar no escribe y coincide con crear (E); hora local, anomalías, festivo con y sin alternativa (F); excluir fechas consume ordinal (G); primera sesión estricta: 23P01 y festivo 22023 (H); sala y nota (I); `agenda_crear_cita` (J); tipo y duración (K); el técnico agenda por las funciones y H16 (L); H23 con C18TEC, con gemelas de rol (M); H24 (N); las pruebas de la revisión (O): D10 sin otra sesión libre en la semana (R1-H2), la alternativa no cae en una fecha excluida (R1-H1), el 23P01 de la carrera en la primera sesión estricta con un disparador temporal (R1-H3), profesional `suspendido` además de `baja` (R1-H4) y cero ocurrencias con su propio mensaje (R1-H7). Anclas en el año + 3. Mutantes medidos a mano: M1 a M5, los dos de la decisión D y los de cada hallazgo de la revisión (quitar D10, quitar las excluidas del plan, quitar la rama estricta, `<> 'baja'` por `= 'activo'`, quitar `for share`, quitar el `order by` del bloqueo, el mensaje de cero ocurrencias y el `grant` a cada ayudante nuevo) |
| `22-avisos.sql` | T-015 — avisos: `referencia_en` = `citas.fin` y el nivel 1/2/3 de la vista `alertas_documentacion_nivel` con umbrales por centro que heredan de la organización (C4); el escalado al nivel 3 una sola vez, sin paciente en el cuerpo, al designado o a todos los administradores activos si no hay o está de baja (C5); notificaciones solo propias y cortadas por baja (C6), solo `leida_en`, de null a `now()` y para siempre (C7); el recuento de la cabecera cuenta solo lo propio aunque la RLS deje ver más (C8); el técnico solo lee `consentimiento_pendiente` (E1); nadie cierra a mano una `nota_sin_firmar` (E2/E8); identidad e instante congelados, `anulada_en` incluida (E3); el insert no elige el instante y authenticated no inserta (E4); permisos y el cron cada 15 min (E5); resolver: quién, auditoría, `resuelta_en = now()` y sin reabrir (E6/E7); una cita que deja de ser `realizada` anula su alerta abierta, por cualquier salida (no_asistida, cancelada, confirmada, programada), solo la base, nadie anula ni reabre a mano, con su alerta nueva si vuelve a realizada y sin tocar una ya resuelta (E9-E13); el escalado copia el origen de la alerta (E14). 19 entradas de mutantes (29 mutantes) anotadas al final, más los dos equivalentes descartados |
| `23-cita-en-episodio.sql` | T-039 — la cita en su episodio y la asistencia (ADR-075): columnas y privilegios por columna (A), coherencia de cita y serie con 23514 (V, S), el paciente y el profesional de una cita con episodio o de una serie no se cambian (D, H), los congelados de episodio y participante con citas (K), la cita pasada (P), la nota va en el episodio de la cita y el paso 5b de `episodio_para_nota` (Y), el relleno idempotente (R), las altas con modalidad y episodio y la herencia de la serie (M, X), cambiar asistencia y episodio (E), lo que ve y no ve el técnico (L), la cadena de huellas intacta (J) y el cable trampa 23.Z (Z): su rojo es la señal esperada cuando T-034 SQL-H2 revalide el cierre de episodios con citas posteriores, no una regresión |
| `26-economico.sql` | T-021 — el esquema económico (ADR-053: la app prepara, no expide): solo adición en tres capas sobre `borradores_factura_versiones` y `cobros`, y la cabecera sin `update` (A); la cadena de un borrador de tres versiones verifica con `verificar_cadena_borrador()` y cada alteración por debajo da su motivo exacto: total, sobre, huella, génesis, hueco y era (B); un cobro sin factura entra, importe 0 no y negativo sí (C); `bonos_consumo` cuenta las citas realizadas (3, cancelar una = 2) sin tocar la fila del bono (D); bonos por rol en la tabla y en la vista (E); el técnico: cobros sí, tarifas, versiones y estado no, con gemelas del administrador, y la forma y `reloptions` de las dos vistas (F); el profesional: su borrador sí, el ajeno no (G); auditoría al insertar en las seis tablas con el recorte del NIF y del sobre (H); pasos 0, 1 y 1.bis del sellado (I); una negativa 23514 por comprobación del paso 6, cada una con su fragmento (J); bono de otro paciente, tarifas por vigencia derivada y altas por rol (K); privilegios, `execute` del verificador y catálogo (L). Ronda 2: `bonos_caducidades` y `tarifas_paciente_vigencias` (solo añadir), congelación de `citas.bono_id`, rol en positivo (M), validación de la cabecera (N) y del centro de la versión (J41). Ronda 3: primer bono de una cita terminada (K19a-K23), cotas del sellado (J28c-J28g, J43-J48), el profesional lee mientras tiene asignado al paciente (O) y el catálogo del disparador hermano (L10r3). Ronda 4: la clase de invisibles tramo a tramo con sus vecinos (J28h, J28i) y la tolerancia por línea general de la banda (J49-J53). Fijación en `01` (BORR1, COB1; ronda 2: TIPO21, TAR21, BONO21 y CAD21) y ayudantes `sobre_borrador` y `linea_borrador` en `00`. Mutantes en `tickets/T-021/mutantes.json`. Desde T-023, C4 lleva `motivo` (`cobros_devolucion_motivo_ck`) |
| `27-exportaciones.sql` | T-040 (corte B) — la copia de una nota clínica: quién exporta (autora y asignada sin motivo; la administración solo con motivo; ni el técnico, ni el coprofesional del episodio, ni el que no es nada) y el candado después de autorizar (C); las dos proyecciones y la forma exacta de la respuesta frente a `lib/exportaciones/formato.ts` (D); el rastro en `accesos_historia`, `exportaciones` y `auditoria`, y lo entregado = lo registrado (E, CB8); los avisos al titular y a la autora, con el detalle sin paciente ni referencia (F); orden y huellas (G); `registrar_fichero_exportado`: una vez, solo el dueño y en 15 minutos (H); solo adición en tres capas (B); columnas, enums y checks (A); privilegios (I); `notas_para_copia` (J); y CB2-CB6: la guarda de solo lectura antes del rol, los nulos, sin oráculo de existencia, la referencia fuera de los errores y la forma de las funciones leída del catálogo (K). Ids con prefijo `40400000-`, recuentos por diferencia y candados cerrados al final (H25). Mutantes en `tickets/T-040/mutantes.json` |
| `28-altas-de-centro.sql` | T-041 — altas de centro para quien atiende, por la misma RPC que la aplicación (`dar_alta_centro`, `retirar_alta_centro`): el administrador con alta en el centro del episodio es coprofesional y sin alta da 23514 «no tiene alta en el centro del episodio» (A); el profesional invitado con un centro, allí sí y en otro no, y tras retirarle el alta tampoco en una nota nueva (B); profesional, técnico y perfil suspendido con JWT vivo reciben 42501 y la tabla no cambia, con la gemela del administrador (C); el alta no da a ADM ninguna versión ajena (mismo recuento que antes, 0 del paciente de PRO1 con la nota de coterapia firmada), con las gemelas de PRO1 y de su propia paciente (D); el disparador `perfiles_centros_solo_cierre` (reabrir, cambiar centro, perfil, desde o creado_en: 42501; la marca de principal sí; también para postgres; sin `delete`; la auditoría del cierre con actor ADM) (E); destino técnico 22023, perfil o centro inexistente o nulo 23503, centro cerrado y perfil suspendido 23514, idempotencia, P0002 y el principal: la primera alta lo es, la segunda no y retirarlo no promociona otro (F); la alarma ADR-065 sobre las columnas de `perfiles`, la lista cerrada y el `is distinct from` leídos del catálogo, firmas y permisos (G). Mutantes medidos a mano: `<>` por `is distinct from` (rojo en C6), `= 'tecnico_administrativo'` por la lista cerrada (G2), sin la comprobación de fila cerrada (E1) y sin `centro_id` en el cotejo (E2) |
| `29-hueco-raro.sql` | T-043 — el hueco raro de `agenda_bloques_profesional` (sexta columna `hueco_raro_minutos`): forma de salida, una sola función, `security definer`, `search_path` vacío y grants sin `public` ni `anon` (A); línea base sin citas (B0); con dos citas candidatas manda la menor, 40 (B1); adyacente `g = d` da null (C); borde inferior 11 (D); borde superior 69 sí y 70 no (E1, E2); descanso 0 (F); el técnico de CA ve el valor calculado con una cita de PRO1 en CB, con TEC2 y PRO2 recibiendo 42501 y las gemelas de ADM y del propio profesional (G); una ausencia parcial en medio da null (H); el fin de la franja da null (I); una cita cancelada no cuenta (J). Cada aserción compara el array completo `hora/estado/hueco` del día, así que fija también que los tramos no se movieron. Robustez (K1-K12): la cita de otro profesional no cuenta (K1); el tramo mide hacia delante y no mira citas anteriores (K2); la adyacente manda y da null (K3); una cita justo en el fin de la franja no cuenta (K4); una ausencia de otro día (K5), de otro centro (K6) o de otro profesional (K7) no corta el hueco; una ausencia dentro del descanso no lo corta, pero sí una que lo solapa (K8); los segundos redondean hacia arriba, 41 y no 40 (K9); una cita confirmada cuenta como una programada (K10); un festivo parcial corta el hueco (K11); una ausencia abierta, con `hasta` nulo, también, y se borra al acabar con una aserción de recuento (K12). Anclas en el año + 10 (primer lunes de febrero), cada sección en su lunes. Mutantes medidos en `begin … rollback` con la migración dentro (contenedor fijado por nombre): M1 a M9 (`<=` en el borde superior, `>=` en el inferior, sin descanso en `v_tras`, sin cota de franja, `max` en vez de `min`, sin la ausencia, sin el filtro de estado, minutos desde `v_tras`, hueco también en ocupados) y N1 a N13 (`>` en la adyacente, ventana desde el inicio de la franja, sin filtro de profesional, `<=` en el fin de la franja, ausencia sin fechas, sin centro o sin perfil, `floor`/`round`/`trunc`/sin redondeo, sin poner a null al empezar el tramo, rango de la ausencia desde `v_tras`, estado solo `programada`, tipo solo `ausencia`, `hasta` sin el caso nulo), cada uno en su sección. Sobrevive, declarado: quitar `'realizada'` del filtro de estado del hueco (haría falta una cita realizada en el futuro) |
| `30-cobros.sql` | T-023 — cobros, parciales y pendiente (`pendiente_paciente`, vista definer con barrera): catálogo de la vista (`reloptions`, ocho columnas exactas, sin `tipo_terapia_id` ni `cita_id`, solo SELECT para `authenticated`), `cobros.motivo` y su check validado, el grant de `motivo`, el disparador `validar_cobro` y `cobros` en `tablas_solo_adicion` (A); los 100 € de P30A: cita a las 00:30 de Madrid a la tarifa del paciente, dos parciales, el tercero `cobrado`, el cuarto `cobrado_de_mas` y dos devoluciones con motivo, seis filas (B); qué se devenga en P30C: tarifa base, sin tipo y sin `tarifa_base` cuentan 0 y suman en `citas_sin_tarifa`, el bono una vez y no su cita, dos tarifas del mismo día con la de mayor `orden`, y ni cancelada, ni no asistida, ni programada, ni confirmada (C); quién ve qué con gemelas, sin perfil, `anon` 42501 y D9: la vista y `cobros` dan los mismos pacientes por rol (D); update, delete y truncate 42501 con gemela de lectura, devolución sin motivo o en blanco 23514, fecha futura 23514 para TEC1 y exenta para postgres, la vista sin escritura (E). Fijación propia (prefijo `30300000-`). Ronda 2: fusión en un salto (F), funciones de lectura (G), zona del centro (E10) y filtro de partidas (A5). Mutantes M1-M17 al final del fichero y en `tickets/T-023/mutantes.json` |
| `31-proveedor-facturacion.sql` | T-026a — el programa de facturación sin red: catálogo (columnas exactas, ninguna de estado, pago, pdf ni huella en el espejo, definer con `search_path` vacío, matriz de `execute`, orden de los disparadores) (A); solo adición en las tres tablas, incluido `postgres` (B); espejo idempotente que nunca se actualiza, discrepancia deduplicada y cursor (C); envíos y los tres rechazos de `validar_envio_borrador` (D); anotaciones y su vocabulario cerrado (E); lectura por rol con gemelas (F) y la vista del técnico (G); cobros con espejo (H); encolar sin oráculo de existencia (I); congelación posterior al envío (J); la cadena de estados de un borrador (K); el Vault (L); la auditoría sin la clave (M); el reclamo, la concesión, el retroceso, el intento 8 (con el segundo aviso tras reabrir a mano) y los descartados (N); el fallido ambiguo en la vista (K); la versión descartada que cierra un borrado sin aprobar (J); y que el espejo lo lee el profesional asignado y no el autor del borrador (O, BORRF). Fijación en `01` (BORRA, BORRB) y ayudante `sql_version_simple` en `00`. Ids con prefijo `a0260001-` |
| `35-bonos.sql` | T-027 — bonos de sesiones, sin migración: el recorrido de la aplicación sobre lo que dejó T-021. El administrador da de alta un bono de 5, vincula cinco citas (`update citas set bono_id`) y marca tres `realizada` por `agenda_actualizar_cita()`: saldo 2 en `bonos_consumo`, la vista sin columna de saldo, la fila de `bonos` intacta (mismo `ctid`) y `update`/`delete` sobre ella 42501 (A); las programadas y las canceladas (`agenda_cancelar_cita` y `agenda_actualizar_cita`) no mueven el saldo, la gemela realizada sí (saldo 1), bono de otro paciente 23514, desvincular una programada sí y una realizada 42501 (B); el técnico ve el bono y el saldo de su centro y nada del otro, no lee `citas` y su `update` de `bono_id` no alcanza ninguna fila, con su gemelo de CB (C); el profesional: cero bonos ajenos en tabla, vista y citas, y su `update` sobre la cita de otro no toca nada, con la gemela sobre la suya (D). Fijación propia (prefijo `35350000-`) |

## Cómo se añade una prueba

Un ticket futuro que añade o modifica una política de RLS amplía este banco, no escribe un
guion suelto:

1. **Copia el bloque de al lado.** La matriz (`02-matriz-roles.sql`) y las baterías
   temáticas (`03` a `10`) son bloques explícitos por tabla y rol —no hay bucle genérico
   que recorra el esquema—, así que añadir un caso es copiar el bloque más parecido y
   cambiar la tabla, la columna o el rol. Sigue la convención: `pg_temp.como(:ROL)` para
   entrar en la sesión, una o más `pg_temp.assert(...)`, `pg_temp.reset_sesion()` para
   salir.
2. **Toda aserción negativa lleva su gemela positiva** sobre la misma fila con el rol que
   sí debe verla. Un «cero filas» sin esa gemela no distingue una política correcta de una
   que deniega todo, o de una tabla vacía.
3. **Añade el nombre de la política nueva al array de `11-cobertura.sql`.** Si no lo haces,
   el módulo de cobertura falla y dice cuál falta. Si la política desaparece más adelante
   (comentada o borrada) y el nombre se queda en el array sin que nadie lo quite, también
   falla — con el nombre, en el otro sentido.
4. **Si hace falta un dato nuevo en la fijación** (un paciente, un episodio, un perfil),
   añádelo a `01-fijacion.sql` con un UUID que siga el patrón de los ya existentes
   (`xNNNNNNN-0000-4000-8000-…`, con el prefijo de letra según el tipo de entidad) — nunca
   un UUID aleatorio, para que un guion que falla se pueda repetir señalando la misma fila.
5. **Nunca dependas del reloj de verdad.** Si la prueba necesita una ventana caducada
   (como el candado del PIN), se manipula la fecha directamente en la fila, como hace
   `03-candado.sql`; nunca se espera con `pg_sleep`. Tampoco escribas una fecha futura literal:
   ancla relativa (punto 10) o, si no es agenda, `-- fecha-fija: motivo`.
6. **Si al probar aparece una política que falta o está mal**, no se arregla aquí: se
   anota en `docs/state.md` y el arreglo va al ticket que la creó. Este banco prueba, no
   parchea.
7. **El estado se filtra entre módulos, a propósito y en orden alfabético de fichero.**
   Todo el banco corre en UNA transacción (`scripts/test-rls.mjs` envuelve la
   concatenación en `begin … rollback`), así que lo que un módulo cambia —`04-baja.sql`
   pone a `PROBAJA` en baja y reasigna `PBAJA` a `PRO1`; `06-centro.sql` añade centros a
   `TEC1` y `PRO1`— sigue así para los módulos que corren después, y nada lo deshace.
   Un módulo nuevo que se inserte ALFABÉTICAMENTE ANTES de uno existente (por ejemplo
   `05a-…`) puede heredar un estado que el diseño original no prevé. Si eso pasa, la
   salida por defecto es añadir el módulo AL FINAL (el siguiente número, `16-…`), no
   intercalarlo; si de verdad tiene que ir en medio, hay que releer los módulos
   posteriores para confirmar que ninguno asume el estado anterior.
8. **Da de alta el dato bajo la sesión del rol que corresponde (`pg_temp.como(...)`), no
   como `postgres`.** Un insert como superusuario no ejerce la política `_alta` de esa
   tabla —ni su `with check`— aunque el dato quede fijado igual de bien; si además la
   comprobación es negativa, usa `pg_temp.assert_lanza` (o `assert_lanza_codigo` si el
   rechazo tiene que venir de una comprobación concreta, no de cualquier disparador que
   se dispare antes en la misma fila) EN SESIÓN, nunca fuera de ella.
9. **Si el dato nuevo incluye una versión de `notas_clinicas_versiones` (T-005),
   `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` y `numero_version` no se
   insertan a mano: los calcula el disparador `fn_sellar_version_nota()`.** Se inserta
   `contenido_canonico` con `pg_temp.sobre_prueba(...)` (00-ayudantes.sql), que construye
   el sobre canónico de once claves. **Cuidado con una trampa real**: el índice único
   *global* sobre `huella` (T-001) hace que dos sobres idénticos byte a byte —mismo
   cuerpo, mismo autor, mismo instante— choquen en el génesis aunque sean de pacientes
   distintos. Cuando dos fixtures comparten cuerpo y autor, varía `creada_en` entre ellas
   (basta un segundo de diferencia).
10. **Fechas: ninguna que caduque, ninguna que choque.** El banco corre con `now()` real y cada
   guarda del reloj (`fn_proteger_cita_pasada`: una cita cuyo fin ya pasó no se mueve) convierte
   un literal futuro de hoy en un fallo de mañana. `scripts/rls/fechas-fijas.mjs` lo vigila
   (`test:rls` lo ejecuta primero; también `node scripts/rls/fechas-fijas.mjs`, con `--hoy
   AAAA-MM-DD` para probarlo): marca todo literal `AAAA-MM-DD` que sea hoy o futuro (fecha de
   Europe/Madrid) y no lleve `fecha-fija:` seguido de un motivo en su línea o en la anterior.
   Tres reglas, con sus comprobaciones:
   1. **Banda corta.** Un ancla al día de agenda (`now() ± interval`, `current_date ± k`) solo
      con |k| ≤ 30. Comprobación:
      `grep -nE "current_date *\+ *[0-9]{2,}|now\(\) *\+ *interval '([3-9][0-9]|[0-9]{3,}) days" scripts/rls/*.sql`
      debe devolver exactamente: la línea del ayudante `instante15` de `15-agenda.sql` (l.26,
      `current_date + 14`); `16-series.sql` l.702 (comentario desfasado, nombra el
      `current_date + 300` que el 17 ya no usa), l.1257 y l.1271-1275 (C7, D+40..D+68, y las citas
      de su propia serie S7); y `18-agenda-rango.sql` l.377 (comentario).
   2. **Año propio.** Cada ancla al año usa un desplazamiento distinto, declarado aquí.
      Comprobación:
      `grep -noE "extract\(year from (now\(\)|current_date)\)(::int)? *\+ *[0-9]+" scripts/rls/*.sql`
      debe coincidir con la tabla, módulo por módulo (16:50 → +1, 17:26 → +7, 19:97 → +8,
      21:37 → +3, 23:194 y 23:198 ×2 → +4, 26:191 → +6, 29:34 → +10, 30:40 → +11, 35:45 → +13).

      | Módulo | Profesional/centro | Franja |
      |---|---|---|
      | 15 | PRO1/CA (y PRO2/CB en `now()`) | martes entre D+14 y D+20, y los dos días siguientes |
      | 16 | PRO1/CA, PRO2 | D−10..D+68 (puntual) · `domingo_marzo(Y+1) − 21` .. ~febrero Y+4 |
      | 17 | PRO1/CA | primer lunes de junio de Y+7 |
      | 18 | PRO18 propio | `now()` ± 1 día |
      | 19 | PRO1/CA, PRO2/CB | primer lunes de enero de Y+8 y el siguiente |
      | 20, 22 | PRO1/CA | pasado (D−45..D−1) |
      | 21 | PRO1/CA, PRO2/CB | primer lunes de mayo de Y+3 .. +350 (abril de Y+4) |
      | 23 | PRO1/CA | D−40..D+11 · primer lunes de mayo de Y+4 .. +42 |
      | 26 | PRO1/CA, PRO2/CB | primer lunes de junio de Y+6 y los dos días siguientes |
      | 29 (T-043) | PRO1/CA | primer lunes de febrero de Y+10 .. +154 |
      | 30 (T-023) | PRO1/CA, PRO2/CB | primer lunes de marzo de Y+11 .. −10 a +5 |
      | 31 (T-026a) | PRO1/CA, PRO2/CB | ninguna (sin agenda; cobros en `current_date − 1`) |
      | 35 (T-027) | PRO1/CA, PRO2/CB | primer lunes de enero de Y+13 .. +6 |

      (`Y` = `extract(year from now())`, `D` = `current_date`.) Un módulo nuevo elige un
      desplazamiento libre, lo añade a la tabla y da sufijo de módulo a sus variables psql
      (`anio_NN`, `lunes_NN`: son globales a todo el banco). Plantilla de un ancla anual, el
      primer lunes de junio de Y+6:
      ```sql
      select (extract(year from now())::int + 6) as anio_NN \gset
      select (make_date(:anio_NN, 6, 1) + ((8 - extract(isodow from make_date(:anio_NN, 6, 1))::int) % 7))::text as lunes_NN \gset
      ```
      Los instantes se escriben en hora local (`(:'lunes_NN'::date + time '10:00') at time zone
      'Europe/Madrid'`), nunca con un desplazamiento `+02` escrito a mano.
   3. **Literal futuro de agenda: prohibido.** `-- fecha-fija: motivo` es para lo que ninguna
      guarda compara con el reloj (caducidades de bono, `creada_en` como `postgres`, una
      tarifa que cae por permiso antes de mirar la fecha). **No vale para** `citas`,
      `series_cita`, `propuestas_cita` ni `disponibilidad`, ni para una llamada a `agenda_*`:
      esas se anclan (regla 2). El motivo no lleva `%`, `$`, `'` ni `:` seguido de letra,
      porque la anotación puede caer dentro de un `format($f$ … $f$)`.
   Solape conocido y fuera de regla: 16 (hasta ~febrero de Y+4) y 21 (mayo de Y+3 a abril de Y+4)
   comparten calendario (`lunes_21 + 259`); coinciden en 2026-2028 y en verde, y dejan de coincidir
   en 2029-2031.
