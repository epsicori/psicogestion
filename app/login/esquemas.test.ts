import { describe, expect, it } from 'vitest';

import { esquemaInicioSesion } from './esquemas';

describe('esquemaInicioSesion', () => {
  it('acepta un correo y una contraseña válidos', () => {
    const resultado = esquemaInicioSesion.safeParse({
      correo: 'ana@example.com',
      contrasena: 'secreta',
    });

    expect(resultado.success).toBe(true);
  });

  it('acepta una contraseña de un solo carácter (longitud mínima)', () => {
    const resultado = esquemaInicioSesion.safeParse({
      correo: 'ana@example.com',
      contrasena: 'a',
    });

    expect(resultado.success).toBe(true);
  });

  it('rechaza el correo vacío', () => {
    const resultado = esquemaInicioSesion.safeParse({
      correo: '',
      contrasena: 'secreta',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('Introduce un correo válido');
    }
  });

  it('rechaza un correo con tipo equivocado', () => {
    const resultado = esquemaInicioSesion.safeParse({
      correo: 42,
      contrasena: 'secreta',
    });

    expect(resultado.success).toBe(false);
  });

  it('rechaza la contraseña vacía', () => {
    const resultado = esquemaInicioSesion.safeParse({
      correo: 'ana@example.com',
      contrasena: '',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('Introduce tu contraseña');
    }
  });

  it('rechaza una contraseña que pasa de la longitud máxima', () => {
    const resultado = esquemaInicioSesion.safeParse({
      correo: 'ana@example.com',
      contrasena: 'a'.repeat(121),
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('La contraseña es demasiado larga');
    }
  });
});
