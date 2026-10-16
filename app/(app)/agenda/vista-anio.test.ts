import { describe, expect, it } from 'vitest';

import { construirVistaAnio, type EntradaVistaAnio } from './vista-anio';

const ENTRADA: EntradaVistaAnio = {
  fecha: '2026-03-10',
  zona: 'Europe/Madrid',
  hoy: '2026-03-10',
  dias: [
    { dia: '2026-03-03', recuento: 7 },
    { dia: '2026-03-04', recuento: 1 },
    { dia: '2026-03-10', recuento: 14 },
    { dia: '2026-12-31', recuento: 3 },
  ],
  profesionales: [
    { id: 'p2', nombre: 'Óscar Peña' },
    { id: 'p1', nombre: 'Ana Ruiz' },
    { id: 'p3', nombre: null },
  ],
};

function dia(vista: ReturnType<typeof construirVistaAnio>, fecha: string) {
  const mes = vista.meses.find((m) => m.clave === fecha.slice(0, 7));
  const d = mes?.dias.find((x) => x.fecha === fecha);
  if (!d) throw new Error(`sin ${fecha}`);
  return d;
}

describe('construirVistaAnio', () => {
  it('año, título y foco salen de la fecha; doce meses de enero a diciembre', () => {
    const v = construirVistaAnio(ENTRADA);
    expect(v.vista).toBe('anio');
    expect(v.anio).toBe(2026);
    expect(v.titulo).toBe('2026');
    expect(v.fechaFoco).toBe('2026-03-10');
    expect(v.hoy).toBe('2026-03-10');
    expect(v.meses.map((m) => m.clave)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ]);
    expect(v.meses.flatMap((m) => m.dias)).toHaveLength(365);
  });

  it('el total del año y el de cada mes suman los recuentos del año', () => {
    const v = construirVistaAnio(ENTRADA);
    expect(v.total).toBe(25);
    expect(v.meses[2].total).toBe(22);
    expect(v.meses[11].total).toBe(3);
    expect(v.meses[0].total).toBe(0);
  });

  it('una fila de otro año se ignora', () => {
    const v = construirVistaAnio({
      ...ENTRADA,
      dias: [...ENTRADA.dias, { dia: '2025-12-31', recuento: 99 }, { dia: '2027-01-01', recuento: 99 }],
    });
    expect(v.total).toBe(25);
  });

  it('los títulos de mes llevan el nombre con mayúscula y el recuento', () => {
    const v = construirVistaAnio(ENTRADA);
    expect(v.meses[2].titulo).toBe('Marzo · 22 citas');
    expect(v.meses[0].titulo).toBe('Enero · sin citas');
    const una = construirVistaAnio({ ...ENTRADA, dias: [{ dia: '2026-05-05', recuento: 1 }] });
    expect(una.meses[4].titulo).toBe('Mayo · 1 cita');
  });

  it('cada día lleva su nivel relativo al máximo del año, su número y su nombre accesible', () => {
    const v = construirVistaAnio(ENTRADA);
    expect(dia(v, '2026-03-10')).toMatchObject({ numero: 10, recuento: 14, nivel: 4, esHoy: true });
    expect(dia(v, '2026-03-03')).toMatchObject({ recuento: 7, nivel: 2, esHoy: false });
    expect(dia(v, '2026-03-04')).toMatchObject({ recuento: 1, nivel: 1 });
    expect(dia(v, '2026-03-05')).toMatchObject({ recuento: 0, nivel: 0 });
    expect(dia(v, '2026-03-03').nombre).toBe('martes, 3 de marzo de 2026, 7 citas');
    expect(dia(v, '2026-03-04').nombre).toBe('miércoles, 4 de marzo de 2026, 1 cita');
    expect(dia(v, '2026-03-05').nombre).toBe('jueves, 5 de marzo de 2026, sin citas');
  });

  it('los huecos son los del primer día del mes con el lunes primero', () => {
    const v = construirVistaAnio(ENTRADA);
    // Enero de 2026 empieza en jueves; junio, en lunes.
    expect(v.meses[0].huecos).toBe(3);
    expect(v.meses[5].huecos).toBe(0);
  });

  it('las cabeceras son L M X J V S D con su nombre largo', () => {
    const v = construirVistaAnio(ENTRADA);
    expect(v.cabeceras.map((c) => c.corta.toUpperCase())).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
    expect(v.cabeceras.map((c) => c.larga)).toEqual([
      'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
    ]);
  });

  it('la leyenda empieza en 0 y sigue con los tramos del año (máximo 14: 1–3, 4–7, 8–10, 11–14)', () => {
    const v = construirVistaAnio(ENTRADA);
    expect(v.leyenda).toEqual([
      { nivel: 0, texto: '0' },
      { nivel: 1, texto: '1–3' },
      { nivel: 2, texto: '4–7' },
      { nivel: 3, texto: '8–10' },
      { nivel: 4, texto: '11–14' },
    ]);
  });

  it('un tramo de un solo valor lleva solo ese número', () => {
    const v = construirVistaAnio({ ...ENTRADA, dias: [{ dia: '2026-03-03', recuento: 1 }] });
    expect(v.leyenda).toEqual([
      { nivel: 0, texto: '0' },
      { nivel: 4, texto: '1' },
    ]);
  });

  it('sin citas en el año la leyenda queda vacía y todo está a cero', () => {
    const v = construirVistaAnio({ ...ENTRADA, dias: [] });
    expect(v.total).toBe(0);
    expect(v.leyenda).toEqual([]);
    expect(v.meses.every((m) => m.dias.every((d) => d.nivel === 0 && d.recuento === 0))).toBe(true);
  });

  it('los profesionales van ordenados en español y el nombre nulo pasa a «Profesional»', () => {
    const v = construirVistaAnio(ENTRADA);
    expect(v.profesionales).toEqual([
      { id: 'p1', nombre: 'Ana Ruiz' },
      { id: 'p2', nombre: 'Óscar Peña' },
      { id: 'p3', nombre: 'Profesional' },
    ]);
  });

  it('«hoy» solo marca un día cuando cae dentro del año', () => {
    const v = construirVistaAnio({ ...ENTRADA, hoy: '2025-06-01' });
    expect(v.meses.flatMap((m) => m.dias).some((d) => d.esHoy)).toBe(false);
  });

  it('la vista es JSON puro: ningún Date cruza al cliente (ADR-034)', () => {
    const v = construirVistaAnio(ENTRADA);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('una zona con el salto de hora a medianoche no mueve el nombre del día', () => {
    // América/La Habana adelanta la hora a las 00:00: a medianoche el día se iría al anterior.
    const v = construirVistaAnio({ ...ENTRADA, zona: 'America/Havana', fecha: '2026-03-08', hoy: '2026-03-08' });
    expect(dia(v, '2026-03-08').nombre).toBe('domingo, 8 de marzo de 2026, sin citas');
  });
});
