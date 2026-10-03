---
paths:
  - "lib/exportaciones/**"
---

# Reglas: `lib/exportaciones/cifrar.ts`, `nucleo-js.ts`, `visor-js.ts`

**Aplica a**: Argon2id, AES-256-GCM, BLAKE2b, visor autodescifrable (T-040).

## Argon2id: cotejo byte a byte con `crypto.argon2Sync` nativo

El núcleo Argon2id en `nucleo-js.ts` es la implementación de referencia. Pruebas en `nucleo-js.test.ts` debe comparar con Node:

**Variantes mínimas** (mutantes que matan):
- `m ∈ {10, 1027, 4099}` (no solo múltiplos de 4)
- `t ∈ {1, 4, 5}` (no solo t=1)
- `salt ∈ {8, 16, 32, 300}` bytes (no solo 16)
- Contraseña vacía y de 1024 bytes (no solo <100)
- Longitud `∈ {4, 33, 63, 65, 96, 100, 128, 1000, 1024}` (no solo potencias)

Omitir una variante hace que sobrevivan tres desvíos del RFC 9106:
- `columnas = m` sin redondeo `m′ = 4·⌊m/4⌋`
- `H0` con `m′` en vez de `m`
- `le32(16)` fijo en vez de `le32(sal.length)`

En v1 (m=65536, sal=16) son equivalentes, pero bloquea regresos.

## Longitud de contraseña en caracteres (puntos de código)

Mide con `[...normalizada].length` (puntos de código), no `.length` (unidades UTF-16).

Ejemplo: `'🔐'.repeat(6)` = 6 caracteres = 12 unidades → acepta.
`'🔐'.repeat(200)` = 200 caracteres = 400 unidades → rechaza (máximo 256 caracteres).

Mutante `.length` debe fallar.

## AAD (datos asociados): cabecera exacta

Cifrado usa `utf8(cabecera_literal)` como datos asociados. Si la cabecera se reserializa o se modifica, el fichero no abre.

Pruebas:
- Espacio en cabecera extra → falla.
- Mutante `JSON.stringify(JSON.parse(...))` → falla (orden de claves).

## Contenido descifrado: sin inyección

Visor pinta solo con:
- `createElement` / `textContent` / `className` (valores fijos)
- `style` (valores fijos)

Sin `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, ni atributos dinámicos.

Valores descifrados nunca llegan a URLs, atributos HTML, ni contextos de evaluación.

## Marca de agua: parámetros en `formato_version`

Opacidad, color, rotación y otras propiedades de la marca son parámetros de `formato_version` v1.
Cambiarlos sin subir versión → regresión (un visor nuevo no abre copias viejas; un visor viejo
pinta mal copias nuevas).

En v1:
- `opacity: 0.12` (no parametrizado: literal)
- `color: hsl(0 0% 0%)` (negro, literal)

Visor v1 no debe aceptar otros valores en la cabecera.

## Bytes sensibles a cero

Claves y memorias derivadas se ponen a cero después de usar (`memoria.fill(0)`).
Mutante que omite esto → sobrevive en síntesis, falla en auditoría de seguridad.

## Validaciones del visor v1

Visor de formato_version v1 exige:
- `m = 65536` (literal; otro → dañado)
- `t = 3` (literal; otro → dañado)
- `p = 1` (literal)
- `longitud = 32` (literal)
- Sal de 16 bytes (exigido antes de derivar)
- Nonce de 12 bytes (exigido antes de descicar)

Campos ausentes o mal formados → dañado (no contraseña incorrecta).

Reserva aparte 64 MiB para Argon2id; si falla la reserva → sinMemoria. Otra excepción del núcleo → error.

## Fotograma doble para renderizado

Derivación de Argon2id en hilo principal tarda 1-5 segundos. Antes:
- Escribir en `role=status` «Abriendo…» y deshabilitar botón.
- Pedir **dos fotogramas**: `requestAnimationFrame(() => setTimeout(f, 0))`.
- Si no hay rAF (fallback): `setTimeout(f, 0)` (imperfecto; mejor avisarlo en manual).

Mutante un solo rAF → no se pinta antes. Prueba exige dos fotogramas y que no haya derivación en el primero.

Nota: `setTimeout(f, 0)` tampoco garantiza pintado en navegadores lentos (~16-20ms). Mejor en prueba manual C7.
