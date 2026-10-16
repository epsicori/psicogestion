import { describe, expect, it } from 'vitest';

import { esquemaEntradaGuardar } from '@/lib/economico/entrada';

import { esquemaBorrador, esquemaDescartar, type ValoresBorrador } from './esquemas';

// T-046 · CA8 (precio vacío rechazado), CA10 (régimen sin marcar rechazado), CA17 (línea libre
// incompleta rechazada) y que la salida es lo que el núcleo acepta.

const PAC = '11111111-1111-4111-8111-111111111111';
const CITA = '22222222-2222-4222-8222-222222222222';
const BOR = '33333333-3333-4333-8333-333333333333';

const linea = (p: Partial<ValoresBorrador['lineas'][number]> = {}) => ({
  cita_id: null,
  concepto: 'Informe',
  cantidad: '1',
  precio: '121,00',
  regimen_iva: 'general',
  ...p,
});

const valores = (p: Partial<ValoresBorrador> = {}): ValoresBorrador => ({
  pacienteId: PAC,
  borradorId: null,
  partida: null,
  destinatario: { modo: 'paciente', nombre: '', tipo: 'fisica', nif: '' },
  lineas: [linea()],
  ...p,
});

const mensajes = (v: ValoresBorrador) => {
  const r = esquemaBorrador.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('esquemaBorrador', () => {
  it('una línea libre al 21 % sale en céntimos y la acepta el núcleo (CA17)', () => {
    const r = esquemaBorrador.parse(valores());
    expect(r.lineas).toEqual([
      { cita_id: null, concepto: 'Informe', cantidad: 1, precio_centimos: 12100, regimen_iva: 'general' },
    ]);
    expect(esquemaEntradaGuardar.safeParse(r).success).toBe(true);
  });

  it('una línea de sesión lleva su cita', () => {
    const r = esquemaBorrador.parse(valores({ lineas: [linea({ cita_id: CITA, regimen_iva: 'exento_sanitario' })] }));
    expect(r.lineas[0]).toMatchObject({ cita_id: CITA, regimen_iva: 'exento_sanitario' });
  });

  it('CA8 · precio vacío: rechazado hasta que se rellene', () => {
    expect(mensajes(valores({ lineas: [linea({ precio: '' })] }))).toContain(
      'Escribe un precio mayor que cero, con dos decimales como mucho',
    );
    expect(mensajes(valores({ lineas: [linea({ precio: '0' })] }))).not.toEqual([]);
    expect(mensajes(valores({ lineas: [linea({ precio: 'abc' })] }))).not.toEqual([]);
  });

  it('CA10 · sin régimen marcado: rechazado, en la libre y en la de sesión sin tarifa', () => {
    for (const cita_id of [null, CITA]) {
      expect(mensajes(valores({ lineas: [linea({ cita_id, regimen_iva: '' })] }))).toContain(
        'Marca si la línea va exenta o al 21 %',
      );
    }
  });

  it('CA17 · línea libre sin concepto, o con un salto de línea: rechazada', () => {
    expect(mensajes(valores({ lineas: [linea({ concepto: '  ' })] }))).toContain('Escribe un concepto de una línea');
    expect(mensajes(valores({ lineas: [linea({ concepto: 'a\nb' })] }))).not.toEqual([]);
  });

  it('cantidad entera de 1 a 999', () => {
    expect(mensajes(valores({ lineas: [linea({ cantidad: '0' })] }))).not.toEqual([]);
    expect(mensajes(valores({ lineas: [linea({ cantidad: '1,5' })] }))).not.toEqual([]);
    expect(esquemaBorrador.parse(valores({ lineas: [linea({ cantidad: '3' })] })).lineas[0].cantidad).toBe(3);
  });

  it('sin líneas: rechazado', () => {
    expect(mensajes(valores({ lineas: [] }))).toContain('Añade al menos una línea');
  });

  it('tercero: CIF con el control mal rechazado; bueno, normalizado; vacío, sin NIF', () => {
    const tercero = (nif: string, tipo: 'fisica' | 'juridica' = 'juridica') =>
      valores({ destinatario: { modo: 'tercero', nombre: 'Mutua', tipo, nif } });
    expect(mensajes(tercero('B12345670'))).toContain('El NIF no es válido');
    expect(esquemaBorrador.parse(tercero('b-1234567-4')).destinatario).toEqual({
      modo: 'tercero',
      nombre: 'Mutua',
      tipo: 'juridica',
      nif: 'B12345674',
    });
    expect(esquemaBorrador.parse(tercero('')).destinatario).toMatchObject({ nif: null });
    expect(mensajes(tercero('12345678A', 'fisica'))).toContain('El NIF no es válido');
  });

  it('tercero sin nombre: rechazado; el paciente no lleva campos de tercero', () => {
    expect(mensajes(valores({ destinatario: { modo: 'tercero', nombre: ' ', tipo: 'fisica', nif: '' } }))).toContain(
      'Escribe el nombre del destinatario',
    );
    expect(esquemaBorrador.parse(valores()).destinatario).toEqual({ modo: 'paciente' });
  });

  it('el tipo se exige solo con tercero: vacío, rechazado allí con su mensaje; con el paciente, da igual (H4)', () => {
    expect(mensajes(valores({ destinatario: { modo: 'tercero', nombre: 'Mutua', tipo: '', nif: '' } }))).toEqual([
      'Elige si es una persona física o jurídica',
    ]);
    const r = esquemaBorrador.safeParse(valores({ destinatario: { modo: 'paciente', nombre: '', tipo: '', nif: '' } }));
    expect(r.success && r.data.destinatario).toEqual({ modo: 'paciente' });
  });
});

describe('esquemaDescartar', () => {
  it('sale como un descarte que conserva y que el núcleo acepta', () => {
    const r = esquemaDescartar.parse({ pacienteId: PAC, borradorId: BOR, partida: 2 });
    expect(r).toMatchObject({ descartar: true, destinatario: { modo: 'conservar' }, lineas: [] });
    expect(esquemaEntradaGuardar.safeParse(r).success).toBe(true);
  });
});
