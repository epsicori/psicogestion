import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { interpretarOklch, razonDeContraste, type Oklch } from './contraste';

/**
 * T-009·B · El validador de contraste de T-009·A, aplicado a los tokens de verdad.
 *
 * T-009·A escribió la aritmética —`razonDeContraste`, `cumpleAA`— y la probó con colores
 * de ejemplo. Lo que faltaba es lo que de verdad protege la pantalla: **comprobar los
 * tokens que hay en `app/globals.css`, cada uno sobre las superficies donde se usa de
 * verdad**. Un token puede cumplir sobre el fondo de página y fallar sobre la tarjeta, y
 * hasta aquí nada lo miraba.
 *
 * No necesita navegador y por eso vive en `npm test`: es aritmética sobre un fichero de
 * texto. El navegador hace falta para otras cosas —360 px, `prefers-reduced-motion`— y de
 * eso se encarga la batería de Playwright.
 */

/** Umbral AA de WCAG 2.2 para texto normal. El de texto grande es 3.0. */
export const UMBRAL_AA = 4.5;
export const UMBRAL_AA_GRANDE = 3.0;

export type Par = {
  /** Token del texto, sin los dos guiones. */
  texto: string;
  /** Token de la superficie sobre la que se pinta. */
  fondo: string;
  /** Dónde se usa de verdad. Si un par no se usa, no se comprueba: sería teatro. */
  donde: string;
  /** Cierto si en la interfaz ese par solo aparece en texto grande (≥ 24 px o ≥ 19 px en negrita). */
  grande?: boolean;
};

/**
 * Los pares que la interfaz pinta HOY. Cada uno con el sitio donde se usa, porque un
 * catálogo de pares inventados da una cifra de cobertura falsa: lo que protege es
 * comprobar lo que se pinta, no comprobar mucho.
 *
 * Cuando una pantalla nueva combine dos tokens que no estén aquí, se añade la línea. Es
 * deliberadamente manual: si se generara el producto cartesiano, la mitad de los pares no
 * existirían en ninguna pantalla y el primero que fallara costaría media tarde de
 * averiguar si importa.
 */
export const PARES: Par[] = [
  { texto: 'foreground', fondo: 'background', donde: 'Texto general sobre el fondo de página' },
  { texto: 'foreground', fondo: 'card', donde: 'Texto general dentro de una tarjeta' },
  { texto: 'card-foreground', fondo: 'card', donde: 'Contenido de tarjeta' },
  { texto: 'muted-foreground', fondo: 'background', donde: 'Texto secundario y ayudas sobre el fondo' },
  { texto: 'muted-foreground', fondo: 'card', donde: 'Texto secundario dentro de tarjeta (rótulos del armazón)' },
  { texto: 'muted-foreground', fondo: 'muted', donde: 'Píldora «pronto» de la navegación' },
  { texto: 'primary-foreground', fondo: 'primary', donde: 'Botón principal y marca del armazón' },
  { texto: 'secondary-foreground', fondo: 'secondary', donde: 'Módulo activo de la navegación y avatar de paciente' },
  { texto: 'accent-foreground', fondo: 'accent', donde: 'Avisos de atención' },
  { texto: 'destructive-foreground', fondo: 'destructive', donde: 'Botón destructivo' },
  { texto: 'destructive', fondo: 'card', donde: 'Mensaje de error de formulario, dentro de la tarjeta' },
  { texto: 'destructive', fondo: 'background', donde: 'Mensaje de error sobre el fondo de página' },
  { texto: 'primary', fondo: 'background', donde: 'Rótulo «Espacio de trabajo» de la cabecera de Pacientes' },
];

const RUTA_GLOBALS = join(process.cwd(), 'app', 'globals.css');

/**
 * Lee los tokens de color del bloque `:root` de `app/globals.css`.
 *
 * Se lee del fichero y NO se copian aquí los valores: una copia se desincroniza el primer
 * día y entonces la prueba certifica un contraste que la aplicación no tiene.
 */
export function leerTokens(css: string = readFileSync(RUTA_GLOBALS, 'utf8')): Map<string, Oklch> {
  const bloque = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!bloque) {
    throw new Error('No se encuentra el bloque :root en app/globals.css');
  }

  const tokens = new Map<string, Oklch>();
  const patron = /--([a-z0-9-]+):\s*(oklch\([^)]*\))/gi;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = patron.exec(bloque[1])) !== null) {
    const color = interpretarOklch(coincidencia[2]);
    if (color) tokens.set(coincidencia[1], color);
  }

  return tokens;
}

export type Fallo = {
  par: Par;
  razon: number;
  umbral: number;
};

/**
 * Devuelve los pares que NO llegan a AA. Lista vacía es la paleta sana.
 *
 * Un token nombrado en `PARES` que no exista en el CSS es un fallo, no un par que se salta
 * en silencio: renombrar un token y olvidarse de esta lista dejaría de comprobar la mitad
 * de la paleta sin que nadie se enterase.
 */
export function revisarTokens(tokens: Map<string, Oklch> = leerTokens()): Fallo[] {
  const fallos: Fallo[] = [];

  for (const par of PARES) {
    const texto = tokens.get(par.texto);
    const fondo = tokens.get(par.fondo);

    if (!texto || !fondo) {
      throw new Error(
        `El par «${par.texto} sobre ${par.fondo}» nombra un token que no existe en globals.css. ` +
          'Si el token se renombró, actualiza PARES: un par que se salta en silencio deja de proteger nada.',
      );
    }

    const umbral = par.grande ? UMBRAL_AA_GRANDE : UMBRAL_AA;
    const razon = razonDeContraste(fondo, texto);
    if (razon < umbral) {
      fallos.push({ par, razon, umbral });
    }
  }

  return fallos;
}

/** Una línea por fallo, con el sitio donde se ve y cuánto falta. */
export function describir(fallos: Fallo[]): string {
  return fallos
    .map(
      (f) =>
        `  · --${f.par.texto} sobre --${f.par.fondo}: ${f.razon.toFixed(2)}:1, ` +
        `hace falta ${f.umbral}:1 — ${f.par.donde}`,
    )
    .join('\n');
}
