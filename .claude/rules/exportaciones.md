---
paths:
  - "lib/exportaciones/**"
  - "accesibilidad/marca-de-agua.spec.ts"
---

# Reglas: `lib/exportaciones/**` y `accesibilidad/marca-de-agua.spec.ts`

**Aplica a**: `lib/exportaciones/**`, `accesibilidad/marca-de-agua.spec.ts`, `lib/i18n/es.ts` exportaciones, formato versionado, marca de agua (T-040).

## Esquemas versionados por rama y alcance

Los campos requeridos varían por rama (`profesional`, `judicial`, `paciente`) y alcance (`nota`, `versiones`). No uses `.optional()` sin `superRefine` o `discriminatedUnion` que exija presencia de cada campo por rama (riesgo: esquema falso positivo).

Ejemplo: profesional conjunta no exige `participantes`, pero profesional judicial sí; individual del paciente no lleva `motivo_cambio` ni `anotaciones_reservadas`.

**Verificar**: mutante que quita cada `superRefine` debe fallar. Campo faltante en respuesta de la base debe fallar el esquema.

## Trim de nombres y textos identificables

Normaliza `.trim()` todo texto que vaya al visor (nombres, motivos). Prueba incluye:
- Caso vacío: `''`
- Solo blancos: `'   '`, `' \t\n '`
- Normales: `'Ana Martín'`, `'  Berta Ruiz  '` → `'Berta Ruiz'`

Mutante `z.string().min(1)` sin `.trim()` debe fallar.

## Base64 por trozos (chunking)

`cifrar.ts` envía la carga en trozos de `TROZO` bytes (32 KiB) en base64 iterativo. Prueba debe incluir ida y vuelta con **>64 KiB** descifrado. Mutante que trunca el trozo debe fallar (e.g., `bytes.subarray(i, TROZO)` con i≥32768).

## Marca de agua: geometría real (Playwright + píxeles)

No confíes en vitest/jsdom para medir la marca. `accesibilidad/marca-de-agua.spec.ts`:
- Mide píxeles negros reales (filas con fondo negro, `<main>` invisible) en **4 tamaños mínimo**: 390×844, 1366×768, 1920×1080, 2560×1440.
- Incluye **paso de pantalla después de abrir**: 1366×768 → 5120×1440 (recalcular lado).
- Exige cobertura ≥80 % de `<main>` y ventana.
- Mutantes que matan: `rotate(-30deg)`, `fontSize:6px`, `zIndex:-1`, `display:block` en centrado.

**Opacidad y color no están cubiertos** (R3-H1): `getComputedStyle` antes de neutralizar, o fixture vitest que fije intervalo (0.10–0.14) y color.

## Normalización NFC (criptografía)

Entrada: NFC (línea 169 de cifrar.ts lleva U+0303). Salida: visor con `.normalize('NFC')`. Prueba comprueba:
- Cifra con NFC (Windows ñ compuesta)
- Abre con NFD (macOS ñ descompuesta)
- Visor normaliza y abre OK

Mutante que quita VISOR_JS:125 `.normalize('NFC')` debe fallar.

## Avisos accesibles del visor

Región `role=alert` debe:
- Estar vacía al cargar (para que no se anuncie).
- Escribirse en siguiente tick (setter `avisarDeNuevo`).
- Al reescribir, vaciar y escribir de nuevo (fuerza anuncio).

Mutante que escribe directamente sin vaciar → no se anuncia.

## Errores de Argon2id sin culpar la contraseña

Catch de Argon2id diferencia:
- Falta de memoria: `sinMemoria` (error de dispositivo, usuario culpa).
- Otro error: `error` genérico (pero ve contraseña OK → se reintenta).

No uses `'Contraseña incorrecta o fichero dañado'` para lógica interna.

## Motivos de exportación: texto fijo

Textos de motivos de exportación (`i18n/es.ts`) son literales: `peticion_paciente`, `requerimiento_judicial_o_inspeccion`, etc. Fija la forma (con/sin «de») en prueba, no en decisión del implementador.
