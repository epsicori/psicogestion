---
id: T-017
titulo: Identificadores y contacto españoles — validación pura y refinamientos Zod
modelo: sonnet
fase: 0
prioridad: media
depende_de: [T-016]
estado: pendiente
---

# Contexto

El alta de paciente, la invitación de usuario y, más adelante, la factura, piden todos los
mismos datos con las mismas reglas: DNI o NIE con su letra, NIF o CIF de la organización,
IBAN, teléfono, código postal. Hoy cada pantalla los validaría a su manera, y el ADR-029
—`dni_cifrado` más `dni_indice` único— **exige una normalización única**: si dos pantallas
normalizan distinto, el índice único deja de detectar el alta doble, que es justo lo que
existe para impedir.

Este ticket escribe esas reglas **una vez, como funciones puras**, con sus refinamientos
Zod listos para que las pantallas los compongan. **No toca la base de datos, ni RLS, ni
ninguna pantalla**: no cifra, no indexa, no guarda. Cifrado e índice son del ticket que
cree la columna.

Referencias: ADR **029** (DNI cifrado con índice único), decisión **11** (`wa.me` como
canal, que necesita el teléfono en formato internacional). Sin sección de `interfaz.md`:
no dibuja.

## Tareas

- [ ] `lib/identidad/` con un módulo por familia y un `index.ts` que reexporte. Nombres del
      dominio en castellano: `validarNif`, `normalizarNif`, `validarIban`, etc.
- [ ] **DNI, NIE y NIF de persona física**:
      - letra de control por el resto de la división entre 23 sobre la tabla
        `TRWAGMYFPDXBNJZSQVHLCKE`;
      - NIE con `X`/`Y`/`Z` sustituidas por `0`/`1`/`2` **antes** del cálculo;
      - `normalizarNif` devuelve **mayúsculas, sin espacios, sin puntos y sin guiones**, y
        es la forma que un día alimentará `dni_indice`. Documenta en el propio módulo que
        esa normalización **no se cambia nunca sin migrar el índice**.
- [ ] **NIF de persona jurídica (CIF)**: letra inicial de organización, dígito o letra de
      control según la inicial, con la regla de qué iniciales exigen letra y cuáles dígito.
- [ ] **IBAN**: longitud por país, reordenación de los cuatro primeros caracteres al final,
      conversión de letras a números y **módulo 97 sobre entero grande**, calculado por
      trozos o con `BigInt` — nunca con `Number`, que pierde precisión mucho antes de los
      22 dígitos. Acepta con y sin espacios; `normalizarIban` devuelve sin espacios y en
      mayúsculas. Valida cualquier IBAN, no solo `ES`.
- [ ] **Teléfono español**: distingue **móvil** (empieza por 6 o 7) de **fijo** (8 o 9),
      admite prefijo `+34`, `0034` o ninguno, y espacios o guiones por medio.
      `normalizarTelefono` devuelve **E.164** (`+34600000000`) porque es el formato que
      `wa.me` necesita, y una función aparte devuelve la forma legible para pintar.
- [ ] **Código postal**: cinco dígitos, dos primeros entre `01` y `52`, ceros a la
      izquierda conservados —es texto, jamás número—. Devuelve también el **código de
      provincia**, sin tabla de nombres: los nombres son cadenas de interfaz y pertenecen
      al catálogo de i18n de T-009.
- [ ] **Número de colegiado**: **no se valida el contenido**, porque cada colegio
      autonómico tiene su formato. Solo se sanea —recorte y colapso de espacios— y se
      comprueba longitud razonable. Deja el comentario que explique por qué **no** hay
      expresión regular aquí; el próximo agente intentará añadirla.
- [ ] **Refinamientos Zod** exportados en `lib/identidad/esquemas.ts`, componibles con los
      esquemas de `lib/formularios.ts`, con **mensajes de error en castellano** y en el
      tono del producto (útiles, no acusadores). No los cablees dentro de ningún
      formulario existente: este ticket entrega la pieza, la usan sus tickets.
- [ ] **Todas las funciones son puras**: entrada `string`, salida valor. Sin `fetch`, sin
      `Date.now()`, sin acceso a Supabase, sin lectura de entorno.
- [ ] Pruebas con el banco de **T-016**, con vectores válidos **e inválidos** en cada
      familia, incluidos los casos feos: minúsculas, espacios interiores, letra de control
      equivocada por uno, cadena vacía, `null` colado como `unknown`, IBAN de 34
      caracteres, teléfono con prefijo doble.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm test` en verde con al menos **seis** vectores por familia,
      mitad válidos, mitad inválidos.
- [ ] **Automático** — `normalizarNif` devuelve la **misma** cadena para `12345678z`,
      `12345678-Z`, ` 12345678 Z ` y `12345678Z`. Es el criterio que sostiene el índice
      único del ADR-029.
- [ ] **Automático** — un IBAN español real de 24 caracteres valida, y el mismo con un
      dígito cambiado **no** valida.
- [ ] **Automático** — `normalizarTelefono('600 00 00 00')`,
      `normalizarTelefono('+34 600 000 000')` y `normalizarTelefono('0034600000000')`
      devuelven la misma cadena E.164.
- [ ] **Automático** — un código postal `01001` conserva el cero inicial y devuelve
      provincia `01`; `53001` **no** valida.
- [ ] **Automático** — `grep -rn "supabase\|fetch(\|Date.now\|process.env" lib/identidad/`
      devuelve **cero** resultados.
- [ ] **Automático** — `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. `npm test` — verde.
2. Cambiar la letra de un DNI válido en un vector y volver a lanzar: rojo. Revertir.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.**
- **No inventes vectores «reales» de personas.** Usa números construidos para el ejemplo y
  calcula tú la letra con el algoritmo; si tu vector y tu implementación se equivocan
  igual, la prueba pasa y la función está rota. Calcula al menos **dos letras a mano**, en
  un comentario del fichero de prueba, para anclar el algoritmo a algo que no salió de él.
- **Cero dependencias nuevas.** Nada de `ibantools`, `libphonenumber-js` ni similares: son
  cuatro algoritmos cortos, y una librería de teléfonos pesa más que toda esta carpeta.
- **No toques `supabase/`, `docs/architecture.md`, `docs/decisions.md`, ninguna pantalla
  ni `lib/formularios.ts`.** Este ticket **añade** ficheros; no reescribe formularios.
- El cifrado del DNI y la columna del índice **no son de este ticket**. Si te tienta
  escribirlos, anótalo en `docs/state.md` §Hallazgos anotados y sigue (constitución,
  regla 2).
