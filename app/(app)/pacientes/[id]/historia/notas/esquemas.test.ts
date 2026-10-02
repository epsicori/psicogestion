import { describe, expect, it } from 'vitest';

import {
  esquemaApertura,
  esquemaBorrador,
  esquemaCoprofesional,
  esquemaFirma,
  esquemaModificar,
} from './esquemas';

const P = '11111111-1111-4111-8111-111111111111';
const N = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('esquemaApertura', () => {
  it('acepta una cita o una nota, con episodio opcional', () => {
    expect(esquemaApertura.safeParse({ pacienteId: P, citaId: C, notaId: null, episodioId: null }).success).toBe(true);
    expect(esquemaApertura.safeParse({ pacienteId: P, citaId: null, notaId: N, episodioId: null }).success).toBe(true);
  });
  it('rechaza un identificador que no es UUID', () => {
    expect(esquemaApertura.safeParse({ pacienteId: 'ana', citaId: C, notaId: null, episodioId: null }).success).toBe(false);
  });
  it('rechaza cita y nota a la vez, y ninguna de las dos', () => {
    expect(esquemaApertura.safeParse({ pacienteId: P, citaId: C, notaId: N, episodioId: null }).success).toBe(false);
    expect(esquemaApertura.safeParse({ pacienteId: P, citaId: null, notaId: null, episodioId: null }).success).toBe(false);
  });
});

describe('esquemaBorrador', () => {
  const base = { pacienteId: P, notaId: N, testigo: '2026-10-02T10:00:00.123456+00:00', texto: 'a', reservadas: '' };
  it('acepta texto vacío y conserva el testigo como cadena', () => {
    const r = esquemaBorrador.safeParse({ ...base, texto: '' });
    expect(r.success).toBe(true);
    expect(r.data?.testigo).toBe(base.testigo);
  });
  it('rechaza el testigo vacío', () => {
    expect(esquemaBorrador.safeParse({ ...base, testigo: '' }).success).toBe(false);
  });
  it('rechaza U+0000 en el texto y en las reservadas', () => {
    expect(esquemaBorrador.safeParse({ ...base, texto: 'a\u0000b' }).success).toBe(false);
    expect(esquemaBorrador.safeParse({ ...base, reservadas: 'a\u0000b' }).success).toBe(false);
  });
  it('acota el texto a 60 000 y las reservadas a 20 000', () => {
    expect(esquemaBorrador.safeParse({ ...base, texto: 'a'.repeat(60_000) }).success).toBe(true);
    expect(esquemaBorrador.safeParse({ ...base, texto: 'a'.repeat(60_001) }).success).toBe(false);
    expect(esquemaBorrador.safeParse({ ...base, reservadas: 'a'.repeat(20_000) }).success).toBe(true);
    expect(esquemaBorrador.safeParse({ ...base, reservadas: 'a'.repeat(20_001) }).success).toBe(false);
  });
});

describe('esquemaCoprofesional y esquemaModificar', () => {
  it('el coprofesional puede ser nulo (quitarlo) pero no una cadena cualquiera', () => {
    expect(esquemaCoprofesional.safeParse({ pacienteId: P, notaId: N, coprofesionalId: null }).success).toBe(true);
    expect(esquemaCoprofesional.safeParse({ pacienteId: P, notaId: N, coprofesionalId: C }).success).toBe(true);
    expect(esquemaCoprofesional.safeParse({ pacienteId: P, notaId: N, coprofesionalId: 'x' }).success).toBe(false);
  });
  it('modificar pide los dos UUID', () => {
    expect(esquemaModificar.safeParse({ pacienteId: P, notaId: N }).success).toBe(true);
    expect(esquemaModificar.safeParse({ pacienteId: P, notaId: 'x' }).success).toBe(false);
  });
});

describe('esquemaFirma', () => {
  const base = { pacienteId: P, notaId: N, testigo: 't', alcance: 'individual' as const, motivo: null };
  it('acepta motivo nulo y motivo con texto, recortado', () => {
    expect(esquemaFirma.safeParse(base).success).toBe(true);
    const r = esquemaFirma.safeParse({ ...base, motivo: '  corrijo la fecha  ' });
    expect(r.data?.motivo).toBe('corrijo la fecha');
  });
  it('un motivo en blanco NO es nulo: se rechaza', () => {
    expect(esquemaFirma.safeParse({ ...base, motivo: '   ' }).success).toBe(false);
  });
  it('rechaza motivos de más de 500 caracteres y con U+0000', () => {
    expect(esquemaFirma.safeParse({ ...base, motivo: 'a'.repeat(501) }).success).toBe(false);
    expect(esquemaFirma.safeParse({ ...base, motivo: 'a\u0000' }).success).toBe(false);
  });
  it('solo admite los dos alcances', () => {
    expect(esquemaFirma.safeParse({ ...base, alcance: 'conjunta' }).success).toBe(true);
    expect(esquemaFirma.safeParse({ ...base, alcance: 'otro' }).success).toBe(false);
  });
});
