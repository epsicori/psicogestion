import { describe, expect, it } from 'vitest';

import { PX_MIN, destinoDeArrastre, horaDeMinuto } from './arrastre';

// Una rejilla de 700 px de ancho y 7 columnas de 100 px; el eje va de las 07:00 a las 21:00.
const base = {
  caja: { left: 50, top: 100, width: 700 },
  desdeMinuto: 7 * 60,
  hastaMinuto: 21 * 60,
  columnas: 7,
  yAgarre: 0,
};

describe('destinoDeArrastre', () => {
  it('el borde superior del cuerpo es la primera hora del eje, en la primera columna', () => {
    expect(destinoDeArrastre({ ...base, x: 60, y: 100 })).toEqual({ columna: 0, minuto: 7 * 60 });
  });

  it('cada 100 px de ancho es una columna', () => {
    expect(destinoDeArrastre({ ...base, x: 149, y: 100 }).columna).toBe(0);
    expect(destinoDeArrastre({ ...base, x: 150, y: 100 }).columna).toBe(1);
    expect(destinoDeArrastre({ ...base, x: 749, y: 100 }).columna).toBe(6);
  });

  it('fuera de la rejilla se queda en la columna del borde', () => {
    expect(destinoDeArrastre({ ...base, x: -500, y: 100 }).columna).toBe(0);
    expect(destinoDeArrastre({ ...base, x: 5000, y: 100 }).columna).toBe(6);
  });

  it('ajusta a cuartos de hora: a media hora de pantalla la hora sale redonda', () => {
    // 60 minutos = 96 px. 08:00 queda a 96 px del borde.
    expect(destinoDeArrastre({ ...base, x: 60, y: 100 + 96 }).minuto).toBe(8 * 60);
    // 7 minutos y medio por debajo de las 08:00 se ajusta al cuarto más cercano.
    expect(destinoDeArrastre({ ...base, x: 60, y: 100 + 96 + 4 * PX_MIN }).minuto).toBe(8 * 60);
    expect(destinoDeArrastre({ ...base, x: 60, y: 100 + 96 + 8 * PX_MIN }).minuto).toBe(8 * 60 + 15);
  });

  it('descuenta el punto de la cita por donde se agarró', () => {
    // Agarrada 48 px por debajo de su borde superior: soltar el puntero 48 px más abajo es
    // soltar el borde superior en la misma hora.
    expect(destinoDeArrastre({ ...base, x: 60, y: 100 + 96 + 48, yAgarre: 48 }).minuto).toBe(8 * 60);
  });

  it('no sale del eje: ni antes de la primera hora ni pasada la última', () => {
    expect(destinoDeArrastre({ ...base, x: 60, y: -900 }).minuto).toBe(7 * 60);
    expect(destinoDeArrastre({ ...base, x: 60, y: 99999 }).minuto).toBe(21 * 60 - 15);
  });
});

describe('horaDeMinuto', () => {
  it('escribe HH:MM con ceros a la izquierda, sin Date', () => {
    expect(horaDeMinuto(0)).toBe('00:00');
    expect(horaDeMinuto(9 * 60 + 5)).toBe('09:05');
    expect(horaDeMinuto(20 * 60 + 45)).toBe('20:45');
  });
});
