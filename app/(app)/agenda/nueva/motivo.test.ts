import { describe, expect, it } from 'vitest';

import { textoMotivo } from './motivo';

describe('textoMotivo', () => {
  it('«como las n últimas» escribe n con letras, sin cifras (ADR-049c)', () => {
    expect(textoMotivo({ tipo: 'comoLasUltimas', n: 6 })).toBe('Como las seis últimas');
    expect(textoMotivo({ tipo: 'comoLasUltimas', n: 2 })).toBe('Como las dos últimas');
  });

  it('el día habitual lleva el día con nombre y la hora', () => {
    expect(textoMotivo({ tipo: 'diaHabitual', diaSemana: 2, hora: '12:00' })).toBe(
      'martes a las 12:00, su día habitual',
    );
    expect(textoMotivo({ tipo: 'diaHabitual', diaSemana: 7, hora: '09:30' })).toBe(
      'domingo a las 09:30, su día habitual',
    );
  });

  it('los intervalos de semanas enteras se dicen con letras; los demás, en días', () => {
    expect(textoMotivo({ tipo: 'cadaIntervalo', dias: 7 })).toBe('Cada semana, como de costumbre');
    expect(textoMotivo({ tipo: 'cadaIntervalo', dias: 14 })).toBe('Cada dos semanas, como de costumbre');
    expect(textoMotivo({ tipo: 'cadaIntervalo', dias: 10 })).toBe('Cada 10 días, como de costumbre');
  });

  it('el primer hueco no dice «habitual»', () => {
    const texto = textoMotivo({ tipo: 'primerHueco' });
    expect(texto).toBe('Primer hueco libre');
    expect(texto).not.toMatch(/habitual/i);
  });

  it('un n fuera de la tabla no rompe el render: cae en la cifra', () => {
    expect(textoMotivo({ tipo: 'comoLasUltimas', n: 9 })).toBe('Como las 9 últimas');
  });
});
