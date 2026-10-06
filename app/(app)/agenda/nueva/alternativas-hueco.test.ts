import { describe, expect, it } from 'vitest';

import { alternativasSinHueco } from './alternativas-hueco';

type H = Parameters<typeof alternativasSinHueco>[0][number];

/** Un hueco de la semana del lunes 2026-10-05: `diaIndice` 0 es el lunes. */
function h(diaIndice: number, hora: number, estado: H['estado'] = 'libre'): H {
  const fecha = `2026-10-${String(5 + diaIndice).padStart(2, '0')}`;
  const horaTxt = `${String(hora).padStart(2, '0')}:00`;
  return { clave: `${fecha}T${horaTxt}`, fecha, diaIndice, minutoPared: hora * 60, estado };
}

describe('alternativasSinHueco', () => {
  const elegido = h(1, 10);

  it('ordena: mismo día primero, luego por días de distancia (el anterior gana el empate), y dentro del día por minutos', () => {
    const huecos = [h(3, 10), h(0, 10), h(1, 12), h(1, 9), h(2, 10), elegido];
    expect(alternativasSinHueco(huecos, {}, elegido.clave, 10)).toEqual([
      h(1, 9).clave,
      h(1, 12).clave,
      h(0, 10).clave,
      h(2, 10).clave,
      h(3, 10).clave,
    ]);
  });

  it('a igual distancia en minutos, el anterior', () => {
    const huecos = [h(1, 11), h(1, 9), elegido];
    expect(alternativasSinHueco(huecos, {}, elegido.clave)).toEqual([h(1, 9).clave, h(1, 11).clave]);
  });

  it('excluye el elegido, los ocupados y los que son raros', () => {
    const huecos = [elegido, h(1, 11, 'ocupado'), h(1, 12), h(1, 13)];
    expect(alternativasSinHueco(huecos, { [h(1, 12).clave]: 20 }, elegido.clave)).toEqual([h(1, 13).clave]);
  });

  it('corta en `maximo` (3 por defecto)', () => {
    const huecos = [elegido, h(1, 11), h(1, 12), h(1, 13), h(1, 14)];
    expect(alternativasSinHueco(huecos, {}, elegido.clave)).toHaveLength(3);
    expect(alternativasSinHueco(huecos, {}, elegido.clave, 1)).toEqual([h(1, 11).clave]);
    expect(alternativasSinHueco(huecos, {}, elegido.clave, 0)).toEqual([]);
  });

  it('si el elegido no está entre los huecos pintados, no hay alternativas', () => {
    expect(alternativasSinHueco([h(2, 10), h(2, 11)], {}, elegido.clave)).toEqual([]);
  });

  it('una clave heredada del prototipo no cuenta como hueco raro', () => {
    const otro = { ...h(1, 11), clave: 'toString' };
    expect(alternativasSinHueco([elegido, otro], {}, elegido.clave)).toEqual(['toString']);
  });
});
