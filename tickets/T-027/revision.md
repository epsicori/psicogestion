Sin hallazgos ALTA. Ronda 1 sobre ca6c1962b42c0edfeb9889a4c35764fe0131dd67: 0 ALTA, 2 MEDIA, 4 BAJA.

# T-027 · Revisión, ronda 1 (revisor único, riesgo medio)

Base: `main` (c86b7bb, merge-base). Diff `git diff main...HEAD`: 8 commits, 35 ficheros, ninguno en
`supabase/**`.

## Qué medí

- Vitest completo en el worktree: 228 ficheros, 3079 pruebas en verde. Lo de bonos, agenda y ficha
  (23 ficheros, 386 pruebas), también en verde.
- Banco RLS 35 (`scripts/rls/35-bonos.sql`) dentro de `begin … rollback` contra
  `supabase_db_Psicogestion`: todas las 35.* OK hasta 35.D6b.
- Mutante: `bonos_consumo` contando también `programada`. Lo caza el banco: falla 35.A2b y la
  transacción aborta ahí. El comentario de la línea 23 cita «35.A2, B1, B2, B3»; es una inexactitud de
  redacción y no la cuento como hallazgo.
- Territorio (§6): todo dentro, salvo `app/(app)/agenda/calendario.test.tsx` (un `vi.mock` de
  `./acciones-bono` para que el panel de la cita no llame a una Server Function). La bitácora lo
  declara como desviación y no le pongo hallazgo.

## §5 «Qué revisar», punto por punto

- **Esquemas**: `'0'`, `'-1'`, `'1.5'`, `'1000'`, `''`, `'abc'`, `'1e2'` y `'00'` salen rechazados en
  sesiones. Para el importe: `'0'` y `'0,00'` dan `importeCero`, `'-5'` da `importeNegativo`. Caducidad:
  la de ayer da `caducidadPasada` y `'2026-02-30'` da `caducidadNoValida`. Correcto.
- **Estado y bordes** (3/2 sesiones, 30/31 días, hoy, agotado + caducado, 6 de 5): están cubiertos en
  `estado.test`.
- **`registrarBono`**: copia el patrón de `registrarCobro`. Hace lectura previa propia (`creado_por`),
  trata el 23505 `bonos_pkey` con relectura y, si la relectura falla, devuelve un fallo genérico.
  El importe pasa por `importeParaBd` y nunca toca `cobros`. Correcto.
- **`cargarContextoBonos`**: solo el administrador lee `?profesional` y `?paciente`, y los filtros
  estrechan la lista. Correcto.
- **`vincularBono`**: usa `.select('id')`, y 0 filas cuenta como fallo. `esEditable` reproduce el
  disparador `fn_bono_de_la_cita`: 42501 si el bono previo no es nulo y la cita está realizada o ya
  pasada; null → bono siempre se admite; cancelada no se edita. Correcto.
- **Sin migración**: correcto.

## MEDIA

### H1 · `app/(app)/agenda/bono-de-cita.tsx:74` — tras guardar, el control no vuelve a leer el bono de la cita (el diseño §4, riesgo 6, lo pide) y sigue ofreciendo cambios que la base ya prohíbe

`guardar()` solo hace `setGuardado(valor)`. No vuelve a llamar a `leerBonoDeCita`, así que `editable`,
las opciones y sus textos siguen siendo los de la apertura del panel.

Escenario: una cita de ayer, sin bono (editable, porque null → bono siempre se admite). Se elige
«Bono de 5 · quedan 4» y se pulsa Guardar → «Cita vinculada al bono». El selector sigue ofreciendo
«Sin bono» y el otro bono, con el botón Guardar. Con el vínculo ya hecho, `esEditable` da falso:
la cita está pasada y ya tiene bono. Si el usuario corrige su elección, recibe «No se ha podido
cambiar el bono de esta cita» sin ninguna explicación. Además, la opción vinculada sigue diciendo
«quedan 4» y sin «(vinculado)».

Lo que empeora el caso: en una cita pasada o realizada, el primer vínculo es definitivo (el disparador
da 42501 y los bonos solo admiten adiciones), y nada lo avisa antes de Guardar. Una equivocación de
bono no tiene salida en la interfaz. Basta con volver a leer después del éxito para que el control
pase a solo lectura; el aviso previo lo decide el propietario.

### H2 · `app/(app)/pacientes/[id]/page.tsx:151-158` (y `ficha-cliente.tsx:71`, fuera del diff) — en la ficha, cambiar de pestaña desmonta `RegistrarBono` y pierde la clave de envío que el texto «resultado desconocido» promete conservar

`FichaCliente` monta solo la pestaña activa (`{activa === 'facturacion' && facturacion}`). El
`useRef(new Map())` de claves de envío de `RegistrarBono` (registrar-bono.tsx:30) muere con ella. El
texto `bonos.resultadoDesconocido` dice «Envíalo otra vez con los mismos datos, aquí o al volver a abrir
esta ventana, sin salir de la página: si ya estaba registrado, no se duplica». Cambiar de pestaña no
cambia la URL, así que para el usuario no es «salir de la página».

Escenario: en la ficha, pestaña Facturación, se registra un bono de 5 sesiones por 150 €. La red corta
la respuesta, pero el insert sí llegó → «No sabemos si el bono se ha registrado…». El usuario mira la
pestaña Resumen, vuelve a Facturación y reenvía los mismos datos. El Map es nuevo y genera un uuid nuevo
→ entra un segundo bono. `bonos` es de solo adición, así que el duplicado no se puede retirar, y el
pendiente del paciente suma 300 € en lugar de 150 €.

En `/facturacion/bonos` no pasa (allí no hay pestañas). Hay dos arreglos posibles: subir las claves a
algo que sobreviva al cambio de pestaña, o restringir el texto a «sin cambiar de pestaña» y probarlo.

## BAJA

### H3 · `app/(app)/agenda/bono-de-cita.tsx:101` — `disabled={pendiente || valor === guardado}` tira el foco al pulsar Guardar

Al pulsar, el botón se deshabilita (`pendiente`) y el foco cae a `body`. Tras el éxito sigue
deshabilitado (`valor === guardado`). Escenario: un usuario de teclado en el panel anclado de la cita
pulsa Guardar → el foco sale del panel, y el siguiente Tab empieza desde el principio del documento o
del panel, no desde el bono. El mensaje sí se anuncia por `role="status"`.

### H4 · `lib/i18n/es.ts:1547` + `app/(app)/pacientes/[id]/panel-bonos.tsx:32-35` — `caducadoQueHacer` tiene el plural fijo

El texto es «…caducó el {fecha} con {n} sesiones sin usar», y `n` es `lectura.saldo`. Escenario: un
bono de 5 con 4 consumidas que caduca → «Este bono caducó el 01/10/2026 con 1 sesiones sin usar». Los
avisos de «quedan» sí tienen la forma `una`/`varias`.

### H5 · `app/(app)/agenda/acciones-bono.ts:144-149` — el texto de la opción dice «quedan {saldo}» sin descontar las citas ya vinculadas

`sePuedeElegir` decide con `comprometidas` (consumidas + vinculadas). El texto, en cambio, enseña
`lectura.saldo` (totales − consumidas). Escenario: un bono de 5 sin sesiones realizadas y con 4 citas
futuras ya vinculadas se ofrece como «Bono de 5 · quedan 5». Solo cabe una cita más: la quinta
vinculación entra y la sexta desaparece de la lista sin explicación.

### H6 · `app/(app)/facturacion/bonos/page.tsx:111-128` — un `?profesional`/`?paciente` válido que ya no está entre las opciones filtra en silencio y el selector pinta «Todos…»

Las opciones salen de los bonos visibles. `filtrarBonos` aplica el uuid de la URL aunque no esté entre
ellas. Escenario: el administrador guarda `/facturacion/bonos?profesional=X`. Se reasigna a otro
profesional el único paciente de X con bono, y X deja de ser el profesional del bono → la página pinta
el selector en «Todos los profesionales» y el vacío «No hay bonos», aunque la organización tiene bonos.
Si falla el directorio, el selector de profesional ni se pinta, pero el filtro de la URL se sigue
aplicando. Es el mismo patrón que T-023 B.

## Fuera de hallazgo

- Lo que el diseño manda anotar en `docs/state.md` («cita realizada con bono agotado no se cobra»; «no
  hay control de marcar realizada») está, por ahora, solo en `docs/bitacora/T-027.md`. El diseño dice
  «al cerrar», así que queda para el cierre del orquestador.
