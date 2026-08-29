/**
 * Validador de contraste WCAG 2.2 AA para Psicogestión.
 * Implementa la conversión OKLCH → Luminancia relativa WCAG según las
 * fórmulas de Björn Ottosson, sin dependencias externas.
 */

/** Color en el espacio OKLCH. L está normalizado a [0, 1]. */
export type Oklch = {
  /** Luminosidad: 0 (negro) a 1 (blanco). */
  l: number;
  /** Croma: saturación del color. */
  c: number;
  /** Tono: ángulo en grados [0, 360). */
  h: number;
};

/**
 * Interpreta una cadena oklch(..) y devuelve el color o null si es inválida.
 * Acepta formatos: `oklch(0.975 0.012 88)` o `oklch(97.5% 0.012 88)`.
 */
export function interpretarOklch(texto: string): Oklch | null {
  const limpio = texto.trim().toLowerCase();
  
  if (!limpio.startsWith('oklch(') || !limpio.endsWith(')')) {
    return null;
  }

  const inner = limpio.slice(6, -1).trim();
  if (inner.length === 0) {
    return null;
  }

  const partes = inner.split(/\s+/);
  if (partes.length !== 3) {
    return null;
  }

  // Parsear L (puede venir con %)
  const valorL = partes[0].replace('%', '');
  const l = Number(valorL);
  if (Number.isNaN(l)) {
    return null;
  }

  // Normalizar L: si estaba en %, dividir por 100; si no, ya está en rango [0,1]
  const lNormalizado = partes[0].includes('%') ? l / 100 : l;
  
  if (lNormalizado < 0 || lNormalizado > 1) {
    return null;
  }

  const c = Number(partes[1]);
  const h = Number(partes[2]);

  if (Number.isNaN(c) || Number.isNaN(h)) {
    return null;
  }

  if (c < 0 || h < 0 || h >= 360) {
    return null;
  }

  return { l: lNormalizado, c, h };
}

/**
 * Convierte OKLCH a luminancia relativa WCAG (0–1).
 * Paso 1: OKLCH → OKLab (a, b a partir del ángulo)
 * Paso 2: OKLab → LMS' (matriz de Björn Ottosson)
 * Paso 3: Aplicar cubicación: l = l'^3, m = m'^3, s = s'^3
 * Paso 4: LMS → sRGB lineal (matriz)
 * Paso 5: Calcular Y = 0.2126*R + 0.7152*G + 0.0722*B
 */
export function luminanciaRelativa(color: Oklch): number {
  // 1. OKLCH → OKLab
  // a = c * cos(h), b = c * sin(h)
  const radianes = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(radianes);
  const b = color.c * Math.sin(radianes);

  // 2. OKLab → LMS' (matriz de Björn Ottosson)
  const lPrima = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrima = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrima = color.l - 0.0894841775 * a - 1.2914855480 * b;

  // 3. LMS' → LMS (cubicación)
  const l = lPrima ** 3;
  const m = mPrima ** 3;
  const s = sPrima ** 3;

  // 4. LMS → sRGB lineal (matriz inversa de sRGB a LMS)
  const rLineal = 4.0767416621 * l - 3.3077115913 * m + 0.2309699294 * s;
  const gLineal = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLineal = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // 5. Acotar a [0, 1] y calcular luminancia WCAG
  const R = Math.max(0, Math.min(1, rLineal));
  const G = Math.max(0, Math.min(1, gLineal));
  const B = Math.max(0, Math.min(1, bLineal));

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calcula la razón de contraste WCAG entre dos colores.
 * Fórmula: (Lmás claro + 0.05) / (Lmás oscuro + 0.05)
 * Retorna un valor entre 1 y 21.
 */
export function razonDeContraste(a: Oklch, b: Oklch): number {
  const lumA = luminanciaRelativa(a);
  const lumB = luminanciaRelativa(b);

  const masClaro = Math.max(lumA, lumB);
  const masOscuro = Math.min(lumA, lumB);

  return (masClaro + 0.05) / (masOscuro + 0.05);
}

/**
 * Determina si un par de colores cumple WCAG 2.2 AA.
 * @param fondo - Color de fondo
 * @param texto - Color del texto
 * @param grande - Si es true, usa el umbral 3:1 para texto grande; si no, 4.5:1
 */
export function cumpleAA(fondo: Oklch, texto: Oklch, grande: boolean = false): boolean {
  const contraste = razonDeContraste(fondo, texto);
  const umbral = grande ? 3.0 : 4.5;
  return contraste >= umbral;
}

/**
 * Encuentra el tono más cercano al texto original que SÍ cumple AA sobre el fondo.
 * Solo ajusta la luminosidad L, manteniendo croma (c) y tono (h) intactos.
 * Si ni el negro puro ni el blanco puro cumplen, retorna null.
 */
export function tonoMasCercanoQueCumple(
  fondo: Oklch,
  texto: Oklch,
  grande: boolean = false
): Oklch | null {
  const umbral = grande ? 3.0 : 4.5;
  
  // Luminancia del fondo
  const lumFondo = luminanciaRelativa(fondo);

  // Función auxiliar: calcular luminancia de un color con luminosidad L dada
  const luminanciaConL = (l: number): number => {
    return luminanciaRelativa({ l, c: texto.c, h: texto.h });
  };

  // Calcular luminancia del texto original
  const lumTextoOriginal = luminanciaRelativa(texto);

  // Determinar si我们需要 ir hacia arriba o hacia abajo
  // Para cumplir AA: (max(lumFondo, lumTexto) + 0.05) / (min(lumFondo, lumTexto) + 0.05) >= umbral
  
  // Es más eficiente buscar binariamente en [0, 1]
  let bajo = 0;
  let alto = 1;
  let resultado: Oklch | null = null;

  // Iteraciones fijas para precisión suficiente (binsearch)
  for (let i = 0; i < 50; i++) {
    const mid = (bajo + alto) / 2;
    const lumMid = luminanciaConL(mid);
    
    // Calcular contraste
    const masClaro = Math.max(lumFondo, lumMid);
    const masOscuro = Math.min(lumFondo, lumMid);
    const contraste = (masClaro + 0.05) / (masOscuro + 0.05);

    if (contraste >= umbral) {
      // Cumple, guardar y buscar más cerca del original si es posible
      resultado = { l: mid, c: texto.c, h: texto.h };
      // Si el texto original era más oscuro, buscar hacia abajo; si no, hacia arriba
      if (lumTextoOriginal < lumFondo) {
        // El texto debe ser más oscuro, buscar más bajo
        alto = mid;
      } else {
        // El texto debe ser más claro, buscar más alto
        bajo = mid;
      }
    } else {
      // No cumple, alejarse del fondo
      if (lumMid < lumFondo) {
        // Muy oscuro, ir más oscuro
        bajo = mid;
      } else {
        // Muy claro, ir más claro
        alto = mid;
      }
    }
  }

  // Verificar que el resultado cumple (por seguridad)
  if (resultado && cumpleAA(fondo, resultado, grande)) {
    return resultado;
  }

  // Si la búsqueda falló, intentar con extremos
  const negro: Oklch = { l: 0, c: 0, h: 0 };
  const blanco: Oklch = { l: 1, c: 0, h: 0 };

  if (cumpleAA(fondo, negro, grande)) {
    return negro;
  }
  if (cumpleAA(fondo, blanco, grande)) {
    return blanco;
  }

  return null;
}

