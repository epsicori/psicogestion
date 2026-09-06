// T-005 · Canonicalizador JCS (RFC 8785), propio y sin dependencia nueva.
//
// Por qué no una librería (`canonicalize` de erdtman, la única alternativa real):
// un módulo instalado se mueve solo con un `npm update`, y el ADR-035 existe
// precisamente para que eso no pueda volver a pasar. RFC 8785 delega las dos
// partes difíciles —escapado de cadenas (§3.2.2.2) y formato de números
// (§3.2.2.3)— en ECMAScript, y la ordenación de claves es la que ya hace
// `Array.prototype.sort()` sin comparador (unidades de código UTF-16). Lo que
// queda propio es el recorrido recursivo y el ensamblado.
//
// `canonizar` NO normaliza Unicode: eso lo hace `normalizarNfc()` (nfc.ts)
// antes, y el orden importa (ver sobre.ts). Este módulo tampoco calcula ningún
// hash: eso lo hace pgcrypto en la base (§6 del diseño aprobado del ticket).
// No importa `node:crypto` en ningún punto: es lo que hace que el criterio de
// `blocking-prerender-*` (ADR-043) se cumpla por construcción.

export type ValorJson =
  | null
  | boolean
  | number
  | string
  | ValorJson[]
  | { [clave: string]: ValorJson };

/** Un valor no canonizable. `ruta` señala el nodo culpable, p. ej. `cuerpo.content[2].attrs.level`. */
export class ErrorCanonicalizacion extends Error {
  constructor(
    motivo: string,
    public readonly ruta: string,
  ) {
    super(`${motivo} (en ${ruta || '$'})`);
    this.name = 'ErrorCanonicalizacion';
  }
}

// Un sustituto (surrogate) UTF-16 sin su pareja no es Unicode válido: Postgres
// lo rechazaría al convertir a UTF-8, y peor, más tarde.
function tieneSustitutoSuelto(cadena: string): boolean {
  for (let i = 0; i < cadena.length; i++) {
    const unidad = cadena.charCodeAt(i);
    const esAlto = unidad >= 0xd800 && unidad <= 0xdbff;
    const esBajo = unidad >= 0xdc00 && unidad <= 0xdfff;
    if (esAlto) {
      const siguiente = cadena.charCodeAt(i + 1);
      if (!(siguiente >= 0xdc00 && siguiente <= 0xdfff)) return true;
      i++; // el par ya se consumió
    } else if (esBajo) {
      return true; // un bajo sin alto delante
    }
  }
  return false;
}

function esObjetoPlano(valor: object): boolean {
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

function procesarNumero(valor: number, ruta: string): string {
  if (Number.isNaN(valor) || !Number.isFinite(valor)) {
    throw new ErrorCanonicalizacion('NaN e Infinity no son JSON', ruta);
  }
  // Decisión con consecuencia (§2 del diseño): los únicos números legítimos en
  // un sobre o en un documento TipTap son enteros pequeños. Todo entero seguro
  // se serializa como dígitos planos con `String()` bajo cualquier motor, así
  // que la huella deja de depender del camino doble→texto de ES6.
  if (!Number.isSafeInteger(valor)) {
    throw new ErrorCanonicalizacion(
      'Solo se admiten enteros seguros (Number.isSafeInteger): ni decimales ni enteros fuera de rango',
      ruta,
    );
  }
  return String(valor);
}

function procesarCadena(valor: string, ruta: string): string {
  if (tieneSustitutoSuelto(valor)) {
    throw new ErrorCanonicalizacion('La cadena contiene un sustituto UTF-16 suelto (no es Unicode válido)', ruta);
  }
  // RFC 8785 §3.2.2.2 remite al escapado de JSON.stringify. U+0000 sale como
  // `\u0000` (seis caracteres ASCII), así que la salida nunca lleva un byte
  // nulo crudo aunque la columna destino sea `text`.
  return JSON.stringify(valor);
}

function procesarValor(valor: ValorJson, ruta: string): string {
  if (valor === null) return 'null';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (typeof valor === 'number') return procesarNumero(valor, ruta);
  if (typeof valor === 'string') return procesarCadena(valor, ruta);

  if (Array.isArray(valor)) {
    const elementos = valor.map((elemento, indice) => procesarValor(elemento, `${ruta}[${indice}]`));
    return `[${elementos.join(',')}]`;
  }

  if (typeof valor === 'object') {
    if (!esObjetoPlano(valor)) {
      throw new ErrorCanonicalizacion(
        'Solo se admiten objetos planos: un `Date`, `Map` o `Set` convertido por detrás es la conversión implícita que rompe una huella',
        ruta,
      );
    }
    const claves = Object.keys(valor as Record<string, ValorJson>);
    // JCS ordena por unidades de código UTF-16: es exactamente lo que hace
    // `Array.prototype.sort()` sin comparador.
    claves.sort();
    const pares = claves.map((clave) => {
      const valorClave = (valor as Record<string, ValorJson>)[clave];
      return `${procesarCadena(clave, `${ruta}.<clave:${clave}>`)}:${procesarValor(valorClave, `${ruta}.${clave}`)}`;
    });
    return `{${pares.join(',')}}`;
  }

  const tipo = valor === undefined ? 'undefined' : typeof valor;
  throw new ErrorCanonicalizacion(`El valor de tipo «${tipo}» no es JSON`, ruta);
}

/** JCS (RFC 8785) sobre `valor`. NO normaliza: eso lo hace normalizarNfc() antes. */
export function canonizar(valor: ValorJson): string {
  return procesarValor(valor, '$');
}

/** El mismo resultado en UTF-8. Es lo que se sella. */
export function canonizarABytes(valor: ValorJson): Uint8Array {
  return new TextEncoder().encode(canonizar(valor));
}
