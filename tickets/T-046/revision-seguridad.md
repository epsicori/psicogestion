Sin hallazgos ALTA. (T-046, ronda 2, foco seguridad; commit revisado 397b195, delta 3ef2147..397b195; 0 ALTA, 0 MEDIA, 0 BAJA)

## H1 de la ronda 1: arreglado

`lib/economico/borrador.ts:96-110` añade `leerProfesionalDelBorrador`. La función lee la cabecera bajo la RLS de quien actúa y devuelve `null` en tres casos: la cabecera no se ve, es de otro paciente (`paciente_id` distinto del de la URL), o quien actúa no es administrador y no es el profesional de la cabecera. Antes de llamarla, `leerPacienteAtendible` ya exige que el profesional esté asignado. El resultado es la misma condición que la política `borradores_factura_versiones_alta` (profesional de la cabecera y además asignado). Para el administrador, cualquier cabecera del paciente.

Ese profesional llega ahora a todos los usos que señalé:
- el sobre (`:323`);
- `comprobarCitas` (`:206`);
- `elegibilidadDeCitas` en `cargarEditor` (`:440`, `:485`);
- `cargarElegibles`, que recibe el `borradorId` desde `contenido.tsx:83`.

El borrador nuevo sigue tomando el profesional que hoy atiende al paciente, y eso coincide con lo que fija `crear_borrador`. El `centro_id` del sobre sigue siendo el del paciente, que el sellado (`20261011120000_economico_esquema.sql:441-445`) acepta siempre. No hace falta tocarlo.

### ¿Abre otra puerta?

No.
- **Profesional.** No ve más de lo que ya veía. La RLS de `borradores_factura` solo le deja leer cabeceras propias, y `leerPacienteAtendible` sigue exigiendo la asignación actual. La rama `cabecera.profesional_id !== deps.usuario.id` es redundante con la RLS, pero solo puede restringir, nunca abrir.
- **Borrador de otro paciente en la URL.** Se sigue rechazando: el cotejo `paciente_id` se conserva y ahora corre también en `cargarElegibles`.
- **Lista de elegibles del administrador.** Ahora puede incluir sesiones del profesional anterior, pero el administrador ya ve todas las citas. No hay columna nueva hacia el cliente: sigue llegando `tieneNif` y nunca `nif_*`.
- **Migraciones.** El delta no trae ninguna.

### Pruebas de H1

- **`lib/economico/borrador.bd.test.ts:413-493`**: recorre el escenario completo contra la base, con el núcleo real.
  - Ana crea el borrador y el administrador reasigna el paciente a Bruno.
  - El editor del administrador da la línea como elegible.
  - Los elegibles del borrador traen la otra sesión de Ana, y los de un borrador nuevo ninguna.
  - Ana y Bruno reciben `no_disponible` en guardar y `null` en el editor.
  - El administrador corrige (v2) y descarta (v3), con PRO de Ana en el sobre y la cadena verificada.

  Lo razoné sin ejecutarlo, porque la base es compartida: si se deshace el arreglo y se vuelve a `paciente.profesional_id`, la prueba falla en `citaNoElegible` (`[true]`) y en la corrección (`cita_no_elegible`). El arreglo, por tanto, discrimina.
- **Banco `scripts/rls/32-editor-borrador.sql` §R (R1-R7).** Fija la parte de la base:
  - la reasignación deja la cabecera en PRO1;
  - PRO1, ya no asignado, y PRO2, sin ser el de la cabecera, reciben 42501 con el mensaje exacto del paso 0 del sellado;
  - el administrador corrige y descarta;
  - las tres versiones llevan PRO1 y la cadena verifica.

## Delta de la ronda, con el foco de seguridad

- **`aviso-de-estado.tsx`.** Una marca booleana de módulo, en cliente, que solo decide el foco. No lleva datos ni cruza sesiones (vive en la pestaña) y no se pinta nada nuevo.
- **`esquemas.ts`.** El tipo vacío solo se admite fuera del modo tercero, y con tercero da error antes de mirar el NIF. El núcleo vuelve a validar con `esquemaEntradaGuardar`. No hay nueva entrada que llegue sin validar.
- **`accesibilidad/borrador.spec.ts`.** Intercepta con `page.route` los documentos, las cargas RSC y los POST de las acciones.
  - Tiene control positivo: la ficha sí trae el DNI, y la prueba lo comprueba en el cuerpo y en pantalla.
  - Después busca el DNI del paciente y el CIF del tercero en todo lo recogido desde el editor. Eso incluye abrir por uuid un borrador cuyo destinatario es el paciente, que es el caso en que el servidor descifra el DNI para cifrarlo en la versión.
  - La negativa ya no es vacua. La interceptación no altera las respuestas: las entrega con el mismo cuerpo.
- **Solo adición.** La E2E deja dos borradores descartados, como versiones nuevas. Nada borra ni actualiza.

## Descartado

La guarda `cabecera.profesional_id !== deps.usuario.id` no tiene prueba que la ejercite, porque la RLS la hace inalcanzable. No hay escenario de fallo hoy, así que no es hallazgo.