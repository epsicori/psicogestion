// T-005 · Normalización Unicode NFC, recursiva y también en las claves.
//
// JCS no la exige (RFC 8785 no dice nada de normalización Unicode); aquí hace
// falta porque el mismo texto visible en NFD y en NFC son cadenas distintas
// byte a byte, y sin normalizar producirían dos huellas para el mismo
// contenido (ADR-035). Va ANTES de canonizar, nunca al revés.
//
// Las claves también se normalizan, aunque la lectura literal de
// `architecture.md` diga «todos los valores de texto»: JCS ordena por
// unidades de código UTF-16, así que una clave con «á» descompuesta ordena y
// serializa distinto que la misma clave compuesta. Dejarlas fuera reabriría
// el agujero por el otro lado.

import type { ValorJson } from './jcs';

/** Dos claves del mismo objeto normalizan a la misma clave NFC: no es una fusión, es un error. */
export class ErrorNormalizacionNfc extends Error {
  constructor(
    motivo: string,
    public readonly ruta: string,
  ) {
    super(`${motivo} (en ${ruta || '$'})`);
    this.name = 'ErrorNormalizacionNfc';
  }
}

// `typeof new Date() === 'object'` y `typeof new Map() === 'object'`, y las
// dos tienen `Object.keys(...) === []`: sin esta comprobación, el recorrido
// genérico de más abajo las vacía en `{}` EN SILENCIO antes de que
// `jcs.ts` pueda rechazarlas (hallazgo ALTA de la revisión con Opus del
// 30-08-2026 — el §2 del diseño promete que `canonizar` lanza ante un
// `Date`/`Map`/objeto no plano, pero el guarda de `jcs.ts` nunca llegaba a
// verlos: ya habían pasado por aquí, convertidos en un objeto plano vacío).
function esObjetoPlano(valor: object): boolean {
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

/** Devuelve una copia con toda cadena —en valor Y EN CLAVE— normalizada a NFC. */
export function normalizarNfc<T extends ValorJson>(valor: T, ruta = '$'): T {
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'number') {
    return valor;
  }

  if (typeof valor === 'string') {
    return valor.normalize('NFC') as T;
  }

  if (Array.isArray(valor)) {
    return valor.map((elemento, indice) => normalizarNfc(elemento, `${ruta}[${indice}]`)) as unknown as T;
  }

  if (typeof valor === 'object') {
    if (!esObjetoPlano(valor)) {
      const nombre = (valor as { constructor?: { name?: string } })?.constructor?.name ?? 'objeto no plano';
      throw new ErrorNormalizacionNfc(
        `Valor no soportado: ${nombre} no es un objeto plano ni un array (Date, Map y Set no son JSON)`,
        ruta,
      );
    }
    const original = valor as Record<string, ValorJson>;
    const resultado: Record<string, ValorJson> = {};
    const clavesNfcVistas = new Map<string, string>();

    for (const claveOriginal of Object.keys(original)) {
      const claveNfc = claveOriginal.normalize('NFC');
      const claveOriginalPrevia = clavesNfcVistas.get(claveNfc);
      if (claveOriginalPrevia !== undefined) {
        throw new ErrorNormalizacionNfc(
          `Las claves «${claveOriginalPrevia}» y «${claveOriginal}» normalizan a la misma clave NFC («${claveNfc}»)`,
          ruta,
        );
      }
      clavesNfcVistas.set(claveNfc, claveOriginal);
      resultado[claveNfc] = normalizarNfc(original[claveOriginal], `${ruta}.${claveOriginal}`);
    }

    return resultado as T;
  }

  throw new ErrorNormalizacionNfc(`Valor no soportado: ${typeof valor}`, ruta);
}
