import { describe, expect, it } from 'vitest';

import { esquemaNuevoPaciente } from './esquemas';

describe('esquemaNuevoPaciente', () => {
  it('acepta nombre y apellidos válidos', () => {
    const resultado = esquemaNuevoPaciente.safeParse({
      nombre: 'Ana',
      apellidos: 'García López',
    });

    expect(resultado.success).toBe(true);
  });

  it('acepta un nombre de un solo carácter (longitud mínima)', () => {
    const resultado = esquemaNuevoPaciente.safeParse({
      nombre: 'A',
      apellidos: 'G',
    });

    expect(resultado.success).toBe(true);
  });

  it('rechaza el nombre vacío', () => {
    const resultado = esquemaNuevoPaciente.safeParse({
      nombre: '',
      apellidos: 'García López',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('Introduce el nombre');
    }
  });

  it('recorta los espacios sobrantes antes de validar', () => {
    const resultado = esquemaNuevoPaciente.safeParse({
      nombre: '  Ana  ',
      apellidos: '  García López  ',
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).toEqual({ nombre: 'Ana', apellidos: 'García López' });
    }
  });

  it('rechaza un nombre que solo tiene espacios', () => {
    const resultado = esquemaNuevoPaciente.safeParse({
      nombre: '   ',
      apellidos: 'García López',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('Introduce el nombre');
    }
  });

  it('rechaza un nombre con tipo equivocado', () => {
    const resultado = esquemaNuevoPaciente.safeParse({
      nombre: 42,
      apellidos: 'García López',
    });

    expect(resultado.success).toBe(false);
  });

  it('rechaza un nombre que pasa de la longitud máxima', () => {
    const resultado = esquemaNuevoPaciente.safeParse({
      nombre: 'a'.repeat(121),
      apellidos: 'García López',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('El nombre es demasiado largo');
    }
  });

  it('rechaza los apellidos vacíos', () => {
    const resultado = esquemaNuevoPaciente.safeParse({
      nombre: 'Ana',
      apellidos: '',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('Introduce los apellidos');
    }
  });
});
