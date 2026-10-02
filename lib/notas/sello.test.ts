import { describe, expect, it } from 'vitest';

import { canonizar, construirSobre, type EntradaFirma } from '@/lib/huella';

import { fraseDelSello, leerSello } from './sello';

const ID = '11111111-1111-4111-8111-111111111111';

function canonico(parcial: Partial<EntradaFirma> = {}): string {
  const entrada: EntradaFirma = {
    notaId: ID,
    pacienteId: ID,
    episodioId: ID,
    fechaSesion: '2026-08-26',
    coprofesionalId: null,
    autorId: ID,
    cuerpo: { texto: 'x' },
    anotacionesReservadas: null,
    motivoCambio: null,
    alcance: 'individual',
    citaId: ID,
    ventanaCita: {
      inicio: new Date('2026-08-26T15:00:00.000Z'),
      fin: new Date('2026-08-26T15:50:00.000Z'),
    },
    margenMinutos: 15,
    abiertaEn: new Date('2026-08-26T15:05:00.000Z'),
    ahora: new Date('2026-08-26T15:52:00.000Z'),
    ...parcial,
  };
  return canonizar(construirSobre(entrada));
}

describe('leerSello', () => {
  it('lee los campos del sobre sellado', () => {
    const s = leerSello(canonico());
    expect(s).toEqual({
      citaId: ID,
      abiertaEn: new Date('2026-08-26T15:05:00.000Z'),
      firmadaEn: new Date('2026-08-26T15:52:00.000Z'),
      redactadaEnSesion: true,
      margenMinutos: 15,
      fechaSesion: '2026-08-26',
    });
  });

  it('devuelve null si no es JSON, si no es un sobre o si es de otra era', () => {
    expect(leerSello('no es json')).toBeNull();
    expect(leerSello('{"a":1}')).toBeNull();
    const otraEra = canonico().replace('"esquema_version":4', '"esquema_version":3');
    expect(leerSello(otraEra)).toBeNull();
  });
});

describe('fraseDelSello', () => {
  it('en sesión', () => {
    expect(fraseDelSello(leerSello(canonico()), 'Europe/Madrid')).toBe(
      'Escrita durante la sesión del 26/08 · 17:05–17:52',
    );
  });

  it('fuera de sesión', () => {
    const s = leerSello(canonico({ ahora: new Date('2026-08-26T19:00:00.000Z') }));
    expect(fraseDelSello(s, 'Europe/Madrid')).toBe('Escrita fuera de la sesión del 26/08 · 17:05–21:00');
  });

  it('sin cita', () => {
    const s = leerSello(canonico({ citaId: null, ventanaCita: null, margenMinutos: null }));
    expect(fraseDelSello(s, 'Europe/Madrid')).toBe('Escrita el 26/08 · 17:05–17:52');
  });

  it('si abierta y firmada caen en días locales distintos, cada hora lleva su dd/MM', () => {
    const s = leerSello(
      canonico({
        citaId: null,
        ventanaCita: null,
        margenMinutos: null,
        abiertaEn: new Date('2026-08-26T21:30:00.000Z'),
        ahora: new Date('2026-08-26T22:30:00.000Z'),
      }),
    );
    expect(fraseDelSello(s, 'Europe/Madrid')).toBe('Escrita el 26/08 · 26/08 23:30–27/08 00:30');
  });

  it('un sobre ilegible dice «Sello no legible», nunca false', () => {
    expect(fraseDelSello(null, 'Europe/Madrid')).toBe('Sello no legible');
  });
});

describe('fraseDelSello · la fecha que pone es la de cuando se escribió (R2-H4)', () => {
  const sinCita = { citaId: null, ventanaCita: null, margenMinutos: null };

  it('con cita, una modificación escrita otro día lleva la fecha en cada hora', () => {
    // Sesión el 26/08; v2 abierta y firmada el 15/09 de 10:00 a 10:15 (hora de Madrid).
    const s = leerSello(
      canonico({
        abiertaEn: new Date('2026-09-15T08:00:00.000Z'),
        ahora: new Date('2026-09-15T08:15:00.000Z'),
      }),
    );
    expect(fraseDelSello(s, 'Europe/Madrid')).toBe(
      'Escrita fuera de la sesión del 26/08 · 15/09 10:00–15/09 10:15',
    );
  });

  it('sin cita, la fecha de la frase es la de abierta_en y no la de fecha_sesion', () => {
    const s = leerSello(
      canonico({
        ...sinCita,
        abiertaEn: new Date('2026-09-15T08:00:00.000Z'),
        ahora: new Date('2026-09-15T08:15:00.000Z'),
      }),
    );
    expect(fraseDelSello(s, 'Europe/Madrid')).toBe('Escrita el 15/09 · 10:00–10:15');
  });

  it('si el año cambia, todas las fechas de la frase llevan año', () => {
    const s = leerSello(
      canonico({
        ...sinCita,
        abiertaEn: new Date('2026-10-02T08:00:00.000Z'),
        ahora: new Date('2027-10-02T08:00:00.000Z'),
      }),
    );
    expect(fraseDelSello(s, 'Europe/Madrid')).toBe(
      'Escrita el 02/10/2026 · 02/10/2026 10:00–02/10/2027 10:00',
    );
  });

  it('con cita en otro año que la escritura, también llevan año', () => {
    const s = leerSello(
      canonico({
        fechaSesion: '2026-12-30',
        ventanaCita: {
          inicio: new Date('2026-12-30T15:00:00.000Z'),
          fin: new Date('2026-12-30T15:50:00.000Z'),
        },
        abiertaEn: new Date('2027-01-02T08:00:00.000Z'),
        ahora: new Date('2027-01-02T08:10:00.000Z'),
      }),
    );
    expect(fraseDelSello(s, 'Europe/Madrid')).toBe(
      'Escrita fuera de la sesión del 30/12/2026 · 02/01/2027 09:00–02/01/2027 09:10',
    );
  });
});
