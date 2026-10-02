/**
 * Comparación por palabras entre dos versiones de una nota (T-012 corte C, criterio 9).
 *
 * Pura y sin dependencias. Las fichas son una palabra o una tirada de blancos (los saltos de
 * línea incluidos), así que unir los segmentos devuelve el texto exacto. El tramo que no comparten
 * el principio y el final se compara con Myers O(ND); si hacen falta más de `MAX_EDICIONES`, el
 * tramo sale entero como retirado + añadido y la comparación lo dice (`completa: false`): un
 * bloque reescrito sin esa marca haría creer que se cambió todo.
 */

export type Segmento = { tipo: 'igual' | 'anadido' | 'retirado'; texto: string };
export type Comparacion = { segmentos: Segmento[]; /** false si se agotó el presupuesto */ completa: boolean };

export const MAX_EDICIONES = 1000;

type Operacion = { tipo: Segmento['tipo']; ficha: string };

function trocear(texto: string): string[] {
  return texto.match(/\s+|[^\s]+/gu) ?? [];
}

/**
 * Myers O(ND) sobre fichas. Devuelve las operaciones en orden, o `null` si `d` supera el
 * presupuesto. Guarda una instantánea de `V` por cada `d` (solo el tramo `[-d, d]`) para
 * reconstruir el camino hacia atrás.
 */
function myers(a: string[], b: string[]): Operacion[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const desplazamiento = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trazas: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    if (d > MAX_EDICIONES) return null;
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[desplazamiento + k - 1]! < v[desplazamiento + k + 1]!)
          ? v[desplazamiento + k + 1]!
          : v[desplazamiento + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[desplazamiento + k] = x;
      if (x >= n && y >= m) {
        trazas.push(v.slice(desplazamiento - d, desplazamiento + d + 1));
        return reconstruir(a, b, trazas);
      }
    }
    trazas.push(v.slice(desplazamiento - d, desplazamiento + d + 1));
  }
  // Inalcanzable: con d = n + m siempre se llega al final.
  return null;
}

function reconstruir(a: string[], b: string[], trazas: Int32Array[]): Operacion[] {
  const salida: Operacion[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trazas.length - 1; d > 0; d--) {
    // La instantánea del paso anterior cubre `[-(d-1), d-1]`: el índice de `k` es `k + d - 1`.
    const previa = trazas[d - 1]!;
    const k = x - y;
    const valor = (kk: number) => previa[kk + d - 1]!;
    const kPrevio = k === -d || (k !== d && valor(k - 1) < valor(k + 1)) ? k + 1 : k - 1;
    const xPrevio = valor(kPrevio);
    const yPrevio = xPrevio - kPrevio;
    while (x > xPrevio && y > yPrevio) {
      salida.push({ tipo: 'igual', ficha: a[x - 1]! });
      x--;
      y--;
    }
    if (x === xPrevio) salida.push({ tipo: 'anadido', ficha: b[y - 1]! });
    else salida.push({ tipo: 'retirado', ficha: a[x - 1]! });
    x = xPrevio;
    y = yPrevio;
  }
  while (x > 0 && y > 0) {
    salida.push({ tipo: 'igual', ficha: a[x - 1]! });
    x--;
    y--;
  }
  return salida.reverse();
}

/**
 * Funde fichas en segmentos: sin vacíos, sin dos contiguos del mismo tipo y, en cada bloque de
 * cambio, todo lo retirado antes que todo lo añadido (cada lado conserva su orden).
 */
function agrupar(operaciones: Operacion[]): Segmento[] {
  const segmentos: Segmento[] = [];
  const empujar = (tipo: Segmento['tipo'], texto: string) => {
    if (texto === '') return;
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto;
    else segmentos.push({ tipo, texto });
  };
  let retirado = '';
  let anadido = '';
  const cerrarBloque = () => {
    empujar('retirado', retirado);
    empujar('anadido', anadido);
    retirado = '';
    anadido = '';
  };
  for (const op of operaciones) {
    if (op.tipo === 'igual') {
      cerrarBloque();
      empujar('igual', op.ficha);
    } else if (op.tipo === 'retirado') {
      retirado += op.ficha;
    } else {
      anadido += op.ficha;
    }
  }
  cerrarBloque();
  return segmentos;
}

export function compararTextos(antes: string, despues: string): Comparacion {
  // La huella da por iguales las dos formas de un acento (criterio NFC): la comparación también.
  const a = trocear(antes.normalize('NFC'));
  const b = trocear(despues.normalize('NFC'));

  let inicio = 0;
  while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) inicio++;
  let finA = a.length;
  let finB = b.length;
  while (finA > inicio && finB > inicio && a[finA - 1] === b[finB - 1]) {
    finA--;
    finB--;
  }

  const centroA = a.slice(inicio, finA);
  const centroB = b.slice(inicio, finB);
  const operaciones: Operacion[] = a.slice(0, inicio).map((ficha) => ({ tipo: 'igual', ficha }));
  let completa = true;

  if (centroA.length === 0 || centroB.length === 0) {
    for (const ficha of centroA) operaciones.push({ tipo: 'retirado', ficha });
    for (const ficha of centroB) operaciones.push({ tipo: 'anadido', ficha });
  } else {
    const centro = myers(centroA, centroB);
    if (centro === null) {
      completa = false;
      operaciones.push({ tipo: 'retirado', ficha: centroA.join('') });
      operaciones.push({ tipo: 'anadido', ficha: centroB.join('') });
    } else {
      operaciones.push(...centro);
    }
  }
  for (const ficha of a.slice(finA)) operaciones.push({ tipo: 'igual', ficha });

  return { segmentos: agrupar(operaciones), completa };
}
