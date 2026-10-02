import { describe, expect, it } from 'vitest';

import { compararTextos, type Segmento } from './comparar';

const unir = (segmentos: Segmento[], tipos: Segmento['tipo'][]) =>
  segmentos
    .filter((s) => tipos.includes(s.tipo))
    .map((s) => s.texto)
    .join('');

const fichas = (texto: string) => texto.match(/\s+|[^\s]+/gu) ?? [];

/** La LCS de fichas por programación dinámica: la referencia contra la que se mide la minimalidad. */
function lcs(a: string[], b: string[]): number {
  const fila = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j]!;
      fila[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(fila[j]!, fila[j - 1]!);
      diagonal = arriba;
    }
  }
  return fila[b.length]!;
}

/** Generador congruencial lineal sembrado: la propiedad se repite igual en cada pasada. */
function lcg(semilla: number) {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 2 ** 32;
  };
}

const ALFABETO = ['ansiedad', 'leve', 'sueño', 'refiere', 'mejora', 'café', ' ', '  ', '\n'];

function textoAleatorio(azar: () => number, maximo: number): string {
  const n = Math.floor(azar() * (maximo + 1));
  let texto = '';
  for (let i = 0; i < n; i++) texto += ALFABETO[Math.floor(azar() * ALFABETO.length)]!;
  return texto;
}

function comprobarForma(segmentos: Segmento[]) {
  for (const s of segmentos) expect(s.texto).not.toBe('');
  for (let i = 1; i < segmentos.length; i++) {
    expect(segmentos[i]!.tipo).not.toBe(segmentos[i - 1]!.tipo);
    // En cada bloque de cambio, lo retirado va antes que lo añadido.
    expect(segmentos[i - 1]!.tipo === 'anadido' && segmentos[i]!.tipo === 'retirado').toBe(false);
  }
}

describe('compararTextos', () => {
  it('el ejemplo del diseño: retirado «leve.», añadido «moderada y insomnio.»', () => {
    const r = compararTextos('El paciente refiere ansiedad leve.', 'El paciente refiere ansiedad moderada y insomnio.');
    expect(r).toEqual({
      completa: true,
      segmentos: [
        { tipo: 'igual', texto: 'El paciente refiere ansiedad ' },
        { tipo: 'retirado', texto: 'leve.' },
        { tipo: 'anadido', texto: 'moderada y insomnio.' },
      ],
    });
  });

  it('un cambio en medio deja igual lo de alrededor, con sus saltos de línea', () => {
    const r = compararTextos('Uno dos\ntres cuatro', 'Uno DOS\ntres cuatro');
    expect(r.segmentos).toEqual([
      { tipo: 'igual', texto: 'Uno ' },
      { tipo: 'retirado', texto: 'dos' },
      { tipo: 'anadido', texto: 'DOS' },
      { tipo: 'igual', texto: '\ntres cuatro' },
    ]);
  });

  it('vacíos: ("", "") → []; ("", "x") → añadido; ("x", "") → retirado', () => {
    expect(compararTextos('', '')).toEqual({ segmentos: [], completa: true });
    expect(compararTextos('', 'x').segmentos).toEqual([{ tipo: 'anadido', texto: 'x' }]);
    expect(compararTextos('x', '').segmentos).toEqual([{ tipo: 'retirado', texto: 'x' }]);
  });

  it('iguales: un solo segmento igual', () => {
    expect(compararTextos('a b  c\n', 'a b  c\n')).toEqual({ segmentos: [{ tipo: 'igual', texto: 'a b  c\n' }], completa: true });
  });

  it('NFC: «café» descompuesto frente a precompuesto es un solo igual', () => {
    const descompuesto = 'café solo';
    const precompuesto = 'café solo';
    expect(descompuesto).not.toBe(precompuesto);
    expect(compararTextos(descompuesto, precompuesto).segmentos).toEqual([{ tipo: 'igual', texto: precompuesto }]);
  });

  it('solo cambia el blanco: el blanco también es ficha y cuenta', () => {
    expect(compararTextos('a b', 'a  b').segmentos).toEqual([
      { tipo: 'igual', texto: 'a' },
      { tipo: 'retirado', texto: ' ' },
      { tipo: 'anadido', texto: '  ' },
      { tipo: 'igual', texto: 'b' },
    ]);
  });

  it('propiedad (500 pares sembrados): I1, I2, sin vacíos, sin contiguos iguales, retirado antes que añadido', () => {
    const azar = lcg(20261002);
    for (let k = 0; k < 500; k++) {
      const antes = textoAleatorio(azar, 25);
      const despues = textoAleatorio(azar, 25);
      const r = compararTextos(antes, despues);
      expect(r.completa).toBe(true);
      expect(unir(r.segmentos, ['igual', 'retirado'])).toBe(antes.normalize('NFC'));
      expect(unir(r.segmentos, ['igual', 'anadido'])).toBe(despues.normalize('NFC'));
      comprobarForma(r.segmentos);
    }
  });

  it('minimalidad (≤ 30 fichas): las fichas iguales son la LCS de la referencia', () => {
    const azar = lcg(7);
    let comprobados = 0;
    for (let k = 0; k < 400; k++) {
      const antes = textoAleatorio(azar, 15);
      const despues = textoAleatorio(azar, 15);
      const fa = fichas(antes);
      const fb = fichas(despues);
      if (fa.length > 30 || fb.length > 30) continue;
      comprobados++;
      const iguales = compararTextos(antes, despues)
        .segmentos.filter((s) => s.tipo === 'igual')
        .reduce((n, s) => n + fichas(s.texto).length, 0);
      expect(iguales).toBe(lcs(fa, fb));
    }
    expect(comprobados).toBeGreaterThan(100);
  });

  it('presupuesto: 3000 palabras distintas con prefijo común → igual, retirado, añadido; completa false; < 1 s', () => {
    const antes = 'A ' + Array.from({ length: 3000 }, (_, i) => `x${i}`).join(' ');
    const despues = 'A ' + Array.from({ length: 3000 }, (_, i) => `y${i}`).join(' ');
    const inicio = performance.now();
    const r = compararTextos(antes, despues);
    const ms = performance.now() - inicio;
    expect(r.completa).toBe(false);
    expect(r.segmentos.map((s) => s.tipo)).toEqual(['igual', 'retirado', 'anadido']);
    expect(r.segmentos[0]!.texto).toBe('A ');
    expect(unir(r.segmentos, ['igual', 'retirado'])).toBe(antes);
    expect(unir(r.segmentos, ['igual', 'anadido'])).toBe(despues);
    expect(ms).toBeLessThan(1000);
  });

  it('un texto largo con pocos cambios sigue completo y mínimo', () => {
    const base = Array.from({ length: 5000 }, (_, i) => `p${i % 97}`);
    const cambiado = [...base];
    cambiado[10] = 'NUEVA';
    cambiado.splice(2500, 1);
    const r = compararTextos(base.join(' '), cambiado.join(' '));
    expect(r.completa).toBe(true);
    expect(r.segmentos.filter((s) => s.tipo !== 'igual').map((s) => s.texto.trim())).toEqual(
      expect.arrayContaining(['p10', 'NUEVA']),
    );
  });
});
