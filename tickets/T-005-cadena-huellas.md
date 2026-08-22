---
id: T-005
titulo: Cadena de huellas SHA-256, canonicalización y verificador
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-004]
estado: pendiente
---

# Contexto

El invariante 1 dice `huella(n) = SHA-256( contenido(n) || huella(n-1) )` y el **ADR-035**
define lo que faltaba: `contenido(n)` es **una cadena de bytes canónica generada una sola
vez al firmar y guardada**, y la verificación vuelve a leer esos bytes, **jamás los deriva
otra vez del objeto**.

Si se hace mal, se rompe en silencio, que es la peor forma. Una huella recalculada
serializando el objeto cambia con el orden de las claves, el escapado, los espacios, la
forma de los números o la normalización Unicode. Un `npm update` bastaría, y el
verificador nocturno **no podría distinguirlo de una manipulación**.

Referencias: `docs/architecture.md` §Cadena de huellas. ADR **035** (canonicalización y
sobre), **027** (los dos cuerpos entran en el cómputo), **031** (fusionar **jamás**
recalcula una huella), **036** (a la cadena se entra firmando), **043** (`crypto` bloquea
el prerenderizado: esto vive en Server Actions y en la base, nunca en el render).

Sirve a **dos** obligaciones legales con un solo mecanismo: `notas_clinicas_versiones`
(Ley 41/2002) y `facturas` (RD 1007/2023, Verifactu). Las facturas son fase posterior;
la cadena se escribe ahora **genérica**, igual que se hizo con `fn_auditar()`.

## Tareas

- [ ] **Canonicalizador JCS (RFC 8785)** en TypeScript, en `lib/huella/`, con
      **normalización Unicode NFC de todos los valores de texto antes de canonicalizar**.
      Salida: `Uint8Array` en UTF-8.
- [ ] **Sobre**, no cuerpo suelto: se sellan `cuerpo`, `anotaciones_reservadas`, `autor_id`,
      `creada_en`, `motivo_cambio` y `esquema_version`. Sellar solo el cuerpo dejaría
      cambiar el autor sin romper la cadena.
- [ ] **Encadenado**: `contenido || huella_anterior`, con la anterior en **32 bytes
      fijos** —sin separador, porque la longitud fija lo hace inambiguo— y **32 bytes cero**
      en el primer eslabón.
- [ ] `algoritmo_version` en cada versión. Cambiar de algoritmo abre una era nueva;
      **recalcular lo viejo está prohibido**.
- [ ] **Server Action de firma**: canoniza, calcula, encadena e inserta la versión, todo en
      **una transacción**, con **serialización de la cadena por paciente o por episodio**
      para que dos firmas simultáneas no compartan `huella_anterior`.
- [ ] **Verificador**: recorre la cadena leyendo los bytes guardados y señala **cuál** es
      el primer eslabón roto y **cuándo**. Ejecutable a mano (`npm run verificar:huellas`)
      y preparado para la ejecución nocturna.
- [ ] **Batería de casos feos** a propósito: acentos compuestos y precompuestos, emoji,
      comillas tipográficas, texto pegado desde Word, claves fuera de orden, números en
      notación exponencial, cadenas con caracteres de control, campos vacíos y
      `anotaciones_reservadas` nulo frente a cadena vacía.
- [ ] **Vector de regresión congelado**: un puñado de sobres con su huella esperada,
      guardados como fichero. Si un cambio de dependencia mueve una huella, **falla ahí**,
      no en producción seis meses después.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npx supabase db reset`, `npm run lint` y `npm run build` limpios.
- [ ] **Automático** — el mismo sobre con las claves en **otro orden** produce la
      **misma** huella; el mismo texto en NFD y en NFC, también.
- [ ] **Automático** — cambiar **un solo carácter** de `anotaciones_reservadas` cambia la
      huella (ADR-027: los dos cuerpos entran).
- [ ] **Automático** — cambiar `autor_id` sin tocar el cuerpo **rompe** la cadena.
- [ ] **Automático** — el vector de regresión congelado reproduce sus huellas byte a byte.
- [ ] **Automático** — el verificador sobre una cadena sana devuelve **cero** roturas;
      manipulando una versión intermedia **con `postgres` y los cerrojos levantados a
      propósito**, señala **exactamente esa** y ninguna anterior.
- [ ] **Automático** — el verificador **no vuelve a serializar el objeto**: comprobable
      porque, alterando el JSON guardado de forma que serialice distinto pero canonice
      igual, la verificación sigue dando el mismo resultado que leyendo los bytes.
- [ ] **Automático** — dos firmas concurrentes sobre la misma cadena **no** producen dos
      versiones con la misma `huella_anterior` (prueba con dos transacciones a la vez).
- [ ] **Automático** — vincular un paciente duplicado (ADR-031) **no** altera ninguna
      huella existente: el verificador da idéntico resultado antes y después.
- [ ] **Automático** — `npm run build` no muestra avisos `blocking-prerender-*` por uso de
      `crypto` en render (ADR-043).

## Guion de comprobación manual

1. `npx supabase db reset` y `npm run dev`.
2. Firma una nota desde el guion de prueba del ticket y ejecuta
   `npm run verificar:huellas`: cadena íntegra.
3. Manipula a mano una versión intermedia en Studio con los cerrojos levantados y vuelve a
   ejecutarlo: debe nombrar esa versión, su fecha y su paciente.
4. Restaura y vuelve a verificar: íntegra.

## Notas para el agente

- **La columna de contenido *es* el JSON canónico.** No hay un objeto por un lado y unos
  bytes por otro: serían dos verdades y una tendría que ganar.
- JCS es un estándar escrito **exactamente para esto**. No lo reinventes ni lo aproximes
  con `JSON.stringify` y claves ordenadas: los números y los escapes están especificados.
- NFC **no** la exige JCS; aquí hace falta y va antes de canonicalizar.
- El editor puede normalizar un documento antiguo al abrirlo; si lo hace, guardar produce
  **una versión nueva con su motivo, visible**. Lo que no puede es normalizar y volver a
  sellar en silencio.
- Nada de esto vive en el renderizado (ADR-043). Server Actions y base de datos.
- El editor TipTap y la pantalla de notas **no entran aquí**: son fase 1. Este ticket
  entrega el mecanismo y su prueba, y se ejercita con un guion, no con una interfaz.
