# Plan de tickets

Objetivo de esta primera etapa: **llevar la agenda y las historias de la consulta propia
dentro del producto**, sobre la semana ocho. Todo lo demás espera.

Ejecución: `/fabrica T-XXX` por ticket, `/fabrica fase N` para encadenar.

## Leyenda

- **`opus`** — pasa por etapa de diseño con el arquitecto. Equivocarse obligaría a migrar
  datos o podría exponer información.
- **`sonnet`** — va sobre-especificado y salta el diseño.
- **Revisión con Opus** solo en tickets `opus` y en los que tocan RLS, dinero o datos
  clínicos.

---

## Tres carriles · quién ejecuta qué

Desde el **29-08-2026** el plan lo ejecutan **tres modelos a la vez**, y el reparto **no es
por dificultad: es por fichero**. El mapa completo —territorios, colas, protocolo de
integración— está en **`CARRILES.md`**. En una línea cada uno:

| Carril | Territorio | Qué lleva |
|---|---|---|
| **Claude** · la fábrica | `supabase/`, `lib/supabase/`, `scripts/*.sql`, `docs/` | T-002, T-004, T-003, T-005, T-006, T-008 — y **la revisión de los otros dos** |
| **MiniMax** · la interfaz | `components/`, `app/`, `lib/i18n/`, `lib/contraste/`, `.github/` | T-007 (en cuatro cortes), T-009 (en dos), T-013 |
| **Kimi** · funciones puras | `lib/identidad/`, `lib/fechas/`, `lib/agenda/` | T-017 **entregado**, luego T-018 a T-020 |

**La base de datos tiene un solo dueño**, y por eso **T-006 y T-008 caen en el carril de
Claude aunque sean `sonnet`**: dos carriles escribiendo migraciones las ordenan mal entre
sí. El modelo del ticket no cambia —siguen saltándose el diseño—; cambia quién lo ejecuta.

**T-007 y T-009 se parten en entregas** (`minimax/cortes/`) para que la parte que no toca la
base de datos no espere a T-002 ni a T-003. Los tickets **no** cambian y se cierran cuando
entran todos sus cortes.

---

## Paseo vertical

| ID | Título | Modelo | Depende | Estado |
|---|---|---|---|---|
| T-000 | Paseo vertical: login → paciente → lista | `opus` | — | **hecho** |

Atraviesa el stack entero con lo mínimo y **fija los patrones que luego se copian**:
sesión en Server Component, una política RLS real, un trigger de auditoría real.

## Fase 0 · Cimientos

Lo único que no se puede añadir después.

| ID | Título | Modelo | Depende | Estado |
|---|---|---|---|---|
| T-001 | Esquema base: organización, centros, perfiles, roles | `opus` | T-000 | **hecho** |
| T-002 | RLS: funciones auxiliares y políticas | `opus` | T-001 | pendiente |
| T-003 | Banco de pruebas de RLS por rol | `opus` | T-002 | pendiente |
| T-004 | Auditoría por triggers, de solo adición | `opus` | T-001 | pendiente |
| T-005 | Cadena de huellas SHA-256 y su verificador | `opus` | T-004 | pendiente |
| T-006 | Autenticación completa: invitación, MFA, sesiones | `sonnet` | T-002 | pendiente |
| T-007 | Shell de navegación y tokens de diseño | `sonnet` | T-002 | pendiente |
| T-008 | Seed determinista de los tres roles | `sonnet` | T-002 | pendiente |
| T-009 | Migraciones en CI y andamiaje de i18n | `sonnet` | T-003 | pendiente |

**Se puede paralelizar**: T-004 no depende de T-002, y T-006/T-007/T-008 son
independientes entre sí una vez cerrado T-002.

**Los ADR-026 a ADR-033 se reparten aquí, no se añaden después.** Todos nacieron de la
misma pregunta —qué cuesta aplazarlos— y la respuesta era «una migración de datos». Ninguno
de estos tickets está hecho todavía, así que ahora cuestan lo que ocupan:

| ADR | T-001 esquema | T-002 RLS | T-003 pruebas | T-006 auth |
|---|---|---|---|---|
| 026 · Candado con PIN | `pines_historia`, `desbloqueos_historia` | `historia_desbloqueada()` | sin desbloqueo, cero filas | alta del PIN en la invitación |
| 027 · Anotaciones reservadas | `cuerpo` + `anotaciones_reservadas` en la versión | — | las dos entran en la huella | — |
| 028 · Menores | `representantes_paciente`, `capacidad_consentimiento()` | acceso del representante | capacidad por fecha, no bandera | N firmantes |
| 029 · DNI | `dni_cifrado` + `dni_indice` único | — | índice único rechaza el alta doble | claves en Vault |
| 030 · Pareja y familia | `episodio_participantes`, `modalidad_relacional` | por participación | nota conjunta en dos historias | — |
| 031 · Duplicados | `fusionado_en` + disparador anti-cadena | resolver por el vínculo | un solo salto, siempre | — |
| 032 · Baja del profesional | `perfiles.estado` | `es_profesional_asignado()` en baja | el saliente no lee ni lo suyo | revocar sesión, MFA y PIN |
| 033 · Centros | `politicas_retencion.centro_id` | técnico acotado a su centro | herencia resuelve, no da nulo | `centro_id` obligatorio en el técnico |
| 034 · Zona horaria | `zona_horaria` en organización y centro, validada contra `pg_timezone_names` | — | herencia resuelve; solo nombres IANA | — |
| 035 · Canonicalización | contenido canónico + `algoritmo_version` en la versión | — | **T-005**: JCS y NFC con casos feos | — |
| 036 · Borrador | borrador en la cabecera mutable | borrador bajo candado y RLS | nada entra en versiones sin firma | — |
| 037 · Accesos | tipos y contador de vistas en `accesos_historia` | — | la lista no genera acceso | — |
| 038 · Correo | — | — | — | invitación por Supabase Auth; SMTP del cliente en Vault |
| 039 · TOTP | — | — | — | TOTP los tres roles; reponer TOTP sí, PIN no |

Y los cuatro de interfaz, que caen enteros en **T-007** (armazón y tokens), con la
verificación de accesibilidad en **T-009**:

| ADR | Qué hace T-007 |
|---|---|
| 040 · Todo a mano | Primitivas compartidas en `components/ui/` (diálogo, menú, pestañas, desplegable, emergente, casilla), cada una con su lista de comprobación y su prueba de teclado |
| 041 · WCAG 2.2 AA | Verificador en el pipeline (T-009) y validador de contraste en la personalización de color |
| 042 · Tema claro | Ningún color literal en componentes; sin conmutador de tema |
| 043 · Cache Components | `cacheComponents: true` en `next.config.ts` + saneamiento de lo que bloquee el prerenderizado |
| 044 · Todo desde 360 px | Primitivas responsivas y táctiles de origen, 44 px de objetivo; sin vista degradada |

**T-007 crece, y se sabe por qué.** Los ADR-040 y 044 se decidieron el 22-08 contra la
recomendación: sin librería de componentes, las primitivas accesibles las escribimos
nosotros, y nacen además táctiles. Es trabajo de una vez, pero es trabajo. El editor de notas
y el calendario semanal, en fase 1, **se diseñan dos veces** por el mismo motivo.

**T-005** (cadena de huellas) hereda del 027 que el cómputo abarca los dos cuerpos, y del
031 que fusionar jamás recalcula una huella.

**El ADR-034 vence en fase 1, no en fase 0**: lo que entra en T-001 es la columna de zona
en organización y centro. El resto —`hora_local` en la serie, instantánea de zona en la
cita, anomalías de marzo y octubre marcadas como desviación, y la tarea de citas afectadas
cuando cambia la zona— es el ticket **T-011 · Series de citas con desviaciones** (`opus`), y hay
que leerlo **antes** de **T-014 · Calendario**, que es donde se formatean las
horas con `@date-fns/tz`.

## Fase 1 · Núcleo clínico

El objetivo de la fase, entero, es **un recorrido**: llega la hora de la cita, el aviso
lleva a la sesión, se escribe la nota durante la sesión y se firma sellada. Todo lo que no
sirva a ese recorrido espera.

```
llega la hora de la cita
   └─ aviso «Sesión en curso · [paciente] · Notas»   (no modal, no roba el foco)
        └─ ficha de la cita  ─── botón Notas ───┐
   calendario: punto verde latente en curso     │
        └─ clic en la cita ──────────────────────┤
   ficha del paciente › Historia clínica         │
        └─ PIN ─────────────────────────────────┤
                                                 ▼
                                   editor de nota (borrador)
                                                 │  firmar
                                                 ▼
                              versión 1 sellada · entra en la cadena de huellas
                                     (guarda si se escribió DENTRO de la sesión)
                                                 │  si pasa la hora sin firmar
                                                 ▼
                                   alerta escalada  0 h · 24 h · 72 h → administrador
```

| ID | Título | Modelo | Depende | Estado |
|---|---|---|---|---|
| T-010 | Dominio Agenda: esquema, auditoría y RLS | `opus` | T-004 | pendiente |
| T-011 | Series de citas con desviaciones | `opus` | T-010 | pendiente |
| T-012 | Nota clínica: borrador, firma y versión sellada | `opus` | T-005, T-007, T-013 | pendiente |
| T-013 | Ficha del paciente, pestañas y pantalla de bloqueo | `sonnet` | T-006, T-007 | pendiente |
| T-014 | Calendario: vista semanal y ficha de cita | `opus` | T-011, T-007 | pendiente |
| T-015 | Avisos: sesión en curso, notificaciones y escalado | `sonnet` | T-010, T-014 | pendiente |
| T-028 | Alta de cita: sugerencias, serie y conflicto | `sonnet` | T-011, T-013, T-014 | pendiente |

```
T-010 ─── T-011 ─── T-014 ─┬─ T-015
   │                        └─ T-028
   └──────── T-013 ─── T-012
```

**T-028 se añadió el 02-09-2026**, al descubrir que **el formulario que crea una cita no
tenía ticket**: T-011 escribe las Server Actions, T-014 dibuja el calendario y el panel de
la cita que ya existe, y nadie dibujaba el alta. Es también el único sitio donde se decide
una serie completa.

**Revisión con Opus en los seis primeros, sin excepción**: tocan RLS, datos clínicos o las
dos cosas. **T-028 solo la necesita si acaba escribiendo una consulta propia sobre `citas`**
en vez de leer la vista de agenda de T-010. T-013 y T-010 son independientes entre sí y se pueden llevar en paralelo.

**Los ADR-045 a 048 se cierran antes de empezar**, y uno de ellos vence antes incluso de
que termine la fase 0: el ADR-046 mete cuatro campos en el sobre canónico, así que **T-005
no se puede escribir sin haberlo leído**. Los otros tres —estados de cita, aviso no modal
y consentimientos fuera del candado— cuestan una migración o un rediseño si se dejan para
después.

### Se redactan al llegar, no ahora

Siguen en el plan de la fase y **no** se especifican todavía: importador de Excel y CSV,
pacientes con filtros y previsualización guardable, episodios y valoraciones de riesgo,
calendario mensual y anual, disponibilidad y festivos, y el registro de accesos a historia
como pantalla consultable. Los últimos se escribirían sin saber lo aprendido en los
primeros.

## Carril paralelo · trabajo sin base de datos (T-016 a T-020)

> **Desde el 29-08 este carril es uno de tres**, y es el que lleva **Kimi**. Lo que sigue
> describiéndolo entero vale igual; lo único nuevo es que ya no está solo y que su
> territorio quedó fijado por escrito en `CARRILES.md`.


Cinco tickets que **no tocan `supabase/`, ni RLS, ni ninguna pantalla**, y por eso pueden
llevarse **fuera de la fábrica y en paralelo** con la fase 0 sin colisionar con T-002,
T-003 ni T-004. Todos son `sonnet` sobre-especificado: no pasan por la etapa de diseño y
**no necesitan revisión con Opus**, porque ninguno toca RLS, dinero ni datos clínicos.

| ID | Título | Depende | Desbloquea | Estado |
|---|---|---|---|---|
| T-016 | Banco de pruebas unitarias (Vitest) | — | T-007, T-009, y los cuatro de aquí | **hecho** |
| T-017 | Identificadores y contacto españoles | T-016 | T-006, T-013, facturación | pendiente |
| T-018 | Fechas, zona horaria y semana | T-016 | T-011, T-014 | pendiente |
| T-019 | Linter de migraciones (regla 6) | T-016 | T-009 | pendiente |
| T-020 | Estados de la cita, puros | T-016, T-018 | T-010, T-014 | pendiente |

**Por qué estos cinco y no otros.** Cada uno es una pieza que **dos tickets caros harían
por duplicado**, y ninguno contiene una decisión que cueste una migración si sale mal:

- **T-016 tapa un agujero que ya existe**: T-007 exige «prueba de teclado por primitiva,
  automatizada» y T-009 exige «su prueba» del validador de contraste, y **no hay corredor
  de pruebas en el proyecto**. Los dos se estrellarían contra lo mismo. Va primero: los
  otros cuatro entregan pruebas y necesitan dónde ponerlas.
- **T-017** existe por el ADR-029: si dos pantallas normalizan el DNI distinto, el índice
  único deja de detectar el alta doble. La normalización tiene que ser **una**.
- **T-018** le quita a T-011 y a T-014 —los dos `opus`— la aritmética de calendario, para
  que gasten su diseño en el modelo de la serie y en la pantalla, no en el cambio de hora
  de marzo. `@date-fns/tz` no está ni instalado.
- **T-019** convierte la regla 6 de la constitución en un comando. Lee texto, no levanta
  Docker, y por eso corre mientras T-002 sigue abierto sobre esos mismos ficheros.
- **T-020** escribe la tabla de transiciones del ADR-045 una vez, en vez de tres —Server
  Action, botón y disparador— que se desincronizan.

**Reglas del carril**, y las cinco valen para cualquiera que lo ejecute:

1. **Una rama por ticket**, `T-0XX-<slug>`, y un PR contra `main`. Nada se integra sin que
   `npm test`, `npm run lint` y `npm run build` estén verdes en el PR.
2. **Zona prohibida**: `supabase/`, `app/` (salvo lo que el ticket nombre), `app/prototipo/`,
   `docs/architecture.md`, `docs/decisions.md` y `diseño/`. Quien necesite tocar algo de
   ahí, **para y escala**: es señal de que el ticket estaba mal cortado.
3. **Dependencias nuevas solo las que el ticket nombra**, y ancladas de versión. El ADR-040
   prohíbe librerías de componentes; el resto se justifica o no entra.
4. **Nada de decisiones de dominio.** Lo que no esté cerrado en un ADR se anota en
   `docs/state.md` §Hallazgos anotados y se sigue (constitución, regla 2).
5. **Nada está hecho sin evidencia** (regla 3): cada criterio se cierra con la salida real
   del comando, pegada en el PR.

Si un ticket `opus` posterior decide otra cosa —T-010 sobre los estados, T-011 sobre las
desviaciones—, **manda el `opus`** y el módulo de aquí se reescribe. Eso cuesta un fichero,
que es justo el criterio por el que estos cinco son `sonnet`.

## Fuera de alcance ahora

Facturación y Verifactu, firmas, informes, recordatorios `wa.me`, plano de control
multi-instancia y despliegue a Vercel. Vuelven cuando la fase 1 esté en uso real.

## Aviso para fase 2 · la corrección de pruebas cruza una frontera

La fase 2 incluye «Evaluaciones con arrastrar y soltar» y «Validación y análisis de
archivos», e `interfaz.md` describe la sub-pestaña como «pruebas, **corrección** y
adjuntos». **Almacenar una puntuación es historia clínica; calcularla e interpretarla es
software como producto sanitario** (ADR-049).

Quien redacte ese ticket **se para y escala**. No es un «no»: es que la decisión tiene un
coste regulatorio —clasificación, documentación técnica, registro en AEMPS— que hay que
poner sobre la mesa antes de escribir la primera línea, no después de tener la pantalla
hecha.
