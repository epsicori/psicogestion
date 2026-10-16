Sin hallazgos ALTA. (T-046 · revisión de corrección · ronda 2 · commit 397b195 · delta desde 3ef2147 · base 0e4a587)

Revisor de corrección, ronda 2: comprobación de H1-H4 de la ronda 1 y revisión del delta `3ef2147..397b195`. Resultado: 0 ALTA, 0 MEDIA, 1 BAJA (nueva, H5). H1, H2, H3 y H4 están cerrados.

## Hallazgos de la ronda 1

### H1 · MEDIA · CERRADO · `lib/economico/borrador.ts` (`leerProfesionalDelBorrador`)
Un borrador que ya existe toma ahora el profesional de su cabecera en `guardar` (en el sobre y en `comprobarCitas`), `cargarEditor` (en `elegibilidadDeCitas`) y `cargarElegibles(deps, paciente, borradorId)`. Un profesional que no sea el administrador solo entra si la cabecera es suya y además sigue atendiendo al paciente, que es lo mismo que pide la política de alta de versiones. El alta nueva sigue usando el profesional asignado hoy. La prueba de BD «el administrador reasigna al paciente con un borrador vivo» fallaría sin el arreglo por tres caminos: `citaNoElegible` saldría `[true]`, `cargarElegibles(admin, P, B)` daría `[]` en vez de `[c2]`, y la corrección del administrador daría 23514, es decir `no_guardado` y no `ok`. Quitar la guarda de autoría para el profesional (`cabecera.profesional_id !== usuario`) también la pone en rojo: `cargarEditor(deps(bruno), P, B)` devolvería datos, no `null`. La aserción `corregir(bruno)` no lo detecta porque la base lo para con un 42501; la de `cargarEditor` sí. El banco 32 §R (R1-R7) fija el comportamiento de la base. El panel no hace falta tocarlo: el profesional anterior ya no ve al paciente (`pacientes_lectura_profesional_asignado`).

### H2 · MEDIA · CERRADO · `accesibilidad/borrador.spec.ts`
La E2E intercepta con `page.route` los documentos, las cargas RSC y los POST, guarda cada cuerpo y espera todas las lecturas con `Promise.all` antes de comprobar nada. Busca el DNI de la siembra (`87654321X`, `supabase/seed-completo.sql:281`) además del CIF. Tiene un control positivo: los cuerpos de la ficha sí traen el DNI, así que la búsqueda encuentra lo que busca. El modo paciente se ejercita en las dos versiones 1 y en las respuestas de descarte. Si una acción devolviera el DNI descifrado, el POST lo llevaría y la aserción se pondría en rojo.

### H3 · MEDIA · CERRADO, con un residuo nuevo (H5) · `editor-borrador.tsx`, `aviso-de-estado.tsx`
La región `role=status` del editor existe vacía desde el primer render. Tras descartar dice «Descartado» y recibe el foco: el efecto del padre corre después del de devolución del diálogo. En la ruta de corrección, la página revalidada pone la vista de solo lectura en lugar del editor, y su `AvisoDeEstado` recoge el foco gracias a la marca de módulo. Si se vuelve al código anterior, las unitarias se ponen en rojo: la de :163 porque antes no había `status` inicial, y la de :176 porque sin la marca nadie enfoca el aviso. La E2E comprueba `toBeFocused` en las dos rutas. En `[borradorId]` la E2E no distingue si el foco lo puso el editor o el aviso, pero el resultado observable es el pedido.

### H4 · BAJA · CERRADO · `esquemas.ts:72-84`, `editor-borrador.tsx:309-318`
`tipo` admite `''`, que solo se rechaza en modo tercero y con su propio mensaje. El selector tiene su propio texto vacío («Elegir el tipo») y pinta `errores` (`aria-invalid`). Las pruebas fallarían sin el arreglo: en `esquemas.test.ts` el mensaje y el `success` del modo paciente serían otros, y en `editor-borrador.test.tsx` no habría mensaje.

## Delta de la ronda 2: comprobado sin hallazgo
- `cargarElegibles` con `borradorId`: si la cabecera no es de quien actúa devuelve `null`, y eso da 404 en `ContenidoEditor`. Solo se llama cuando el borrador es editable. Sin `borradorId` (alta nueva) usa el profesional asignado, que es el que pondrá `crear_borrador`.
- Esquema de `tipo`: el `superRefine` sale antes para cualquier modo que no sea tercero, y `transform` solo convierte `tipo` cuando ya ha pasado la comprobación. El valor por defecto del formulario sigue siendo `'fisica'`.
- `momentoAlAzar`: horas de 7 a 20 en días de 2001 a 2018, fuera del hueco del cambio de hora. Reduce las colisiones de agenda entre pasadas frente a las 10:00 fijas de antes. El residuo es probabilístico y crece con pasadas sin `db reset`, pero no tiene un escenario cerrado.
- E2E con `page.route`: `ruta.fetch({ maxRedirects: 0 })` + `fulfill` con el cuerpo leído. El paso a la ruta de corrección usa el uuid que devuelve la acción. Las teclas son Enter y Shift+Tab, y el foco se comprueba en cada paso.
- Tabla de `scripts/rls/README.md` y banco 32 §R: coherentes con el código.

## BAJA

### H5 · prueba · `app/(app)/pacientes/[id]/borrador/aviso-de-estado.tsx:12` (con `editor-borrador.tsx:163` y `editor-borrador.test.tsx:188`)
La marca de módulo `descarteEnCurso` solo se apaga cuando monta un `AvisoDeEstado` o cuando la acción devuelve un error. Un descarte que termina bien en la ruta de alta (`/pacientes/[id]/borrador`, donde nunca se monta la vista de solo lectura) o una acción rechazada por red la dejan encendida para el resto del documento. La negativa «no roba el foco si no viene de un descarte» solo está verde porque la prueba anterior consume la marca.

Escenario medido: `npx vitest run editor-borrador.test -t "al confirmar el descarte|no roba el foco"` ejecuta la prueba de :163, que confirma el descarte y deja la marca encendida, y después la de :188, sin la de :176 que la consumía. La de :188 falla con `Received element is focused: <p role="status" tabindex="-1">Descartado</p>`. Lo mismo pasa si se reordenan las pruebas.

En la aplicación hoy no hay camino. Las entradas a `[borradorId]` desde el panel y a la ruta de alta son `<a>` (carga completa, que reinicia el módulo), y desde la ruta de alta no se llega a una vista de solo lectura navegando en el cliente. Basta con que una de esas entradas pase a `<Link>`, o con cualquier navegación en el cliente nueva hacia `[borradorId]`. Por ejemplo: descartar en `/borrador`, volver con el `<Link>` «Volver» y abrir con un `<Link>` un borrador en cola. El aviso de esa vista le quita el foco a `body` y se salta el enlace «Volver» y el encabezado que lo preceden. El comentario de `aviso-de-estado.tsx:9-10` («fuera de ese caso el aviso no roba el foco») queda falso.

Qué haría falta: que la marca lleve el `borradorId` que se descarta y que `AvisoDeEstado` solo enfoque si coincide con el suyo. O bien apagarla cuando el editor confirma el descarte en una ruta que no se sustituye. Además, una negativa que no dependa del orden: un `beforeEach` que reinicie el módulo, o la prueba de :188 justo después de un descarte en la ruta de alta.