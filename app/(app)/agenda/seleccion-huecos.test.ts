import { describe, expect, it } from 'vitest';

import { carrilesDeHuecos, diaPorDefecto } from './seleccion-huecos';
import type { DiaAlta, HuecoVista } from './nueva/vista-alta';

function hueco(diaIndice: number, minutoPared: number, duracionMinutos: number, estado: HuecoVista['estado'] = 'libre'): HuecoVista {
  const clave = `d${diaIndice}-${minutoPared}`;
  return { clave, fecha: '2026-10-06', horaLocal: '00:00', diaIndice, minutoPared, duracionMinutos, estado, sugerida: null, habitual: false, etiqueta: clave, rango: clave };
}

describe('carrilesDeHuecos', () => {
  it('los que no se pisan ocupan el ancho entero', () => {
    const a = hueco(0, 600, 50);
    const b = hueco(0, 660, 50);
    const r = carrilesDeHuecos([a, b]);
    expect(r.get(a.clave)).toEqual({ carril: 0, carriles: 1 });
    expect(r.get(b.clave)).toEqual({ carril: 0, carriles: 1 });
  });

  it('los que se pisan se reparten en carriles, y el siguiente que ya no se pisa vuelve al ancho entero', () => {
    const a = hueco(0, 600, 90);
    const b = hueco(0, 660, 90);
    const c = hueco(0, 900, 50);
    const r = carrilesDeHuecos([c, b, a]);
    expect(r.get(a.clave)).toEqual({ carril: 0, carriles: 2 });
    expect(r.get(b.clave)).toEqual({ carril: 1, carriles: 2 });
    expect(r.get(c.clave)).toEqual({ carril: 0, carriles: 1 });
  });

  it('cada día va por su cuenta', () => {
    const a = hueco(0, 600, 90);
    const b = hueco(1, 660, 90);
    const r = carrilesDeHuecos([a, b]);
    expect(r.get(a.clave)?.carriles).toBe(1);
    expect(r.get(b.clave)?.carriles).toBe(1);
  });
});

describe('diaPorDefecto', () => {
  const dias = Array.from({ length: 7 }, (_, i) => ({ fecha: `2026-10-0${i + 5}`, esHoy: i === 2 }) as DiaAlta);

  it('el primer día con un hueco libre; sin ninguno, hoy; sin hoy, el primero', () => {
    expect(diaPorDefecto(dias, [hueco(4, 600, 50), hueco(3, 600, 50, 'ocupado'), hueco(5, 600, 50)])).toBe(4);
    expect(diaPorDefecto(dias, [hueco(3, 600, 50, 'ocupado')])).toBe(2);
    expect(diaPorDefecto(dias.map((d) => ({ ...d, esHoy: false })), [])).toBe(0);
  });
});
