import { describe, expect, it } from 'vitest';

import { esquemaRegenerarCodigos } from './esquemas';

describe('esquemaRegenerarCodigos', () => {
  it('acepta una contraseña y un código de seis dígitos', () => {
    const r = esquemaRegenerarCodigos.safeParse({ contrasena: 'clave', codigo: '123456' });
    expect(r.success).toBe(true);
  });

  it('no recorta la contraseña: los espacios del borde forman parte de ella', () => {
    const r = esquemaRegenerarCodigos.safeParse({ contrasena: '  clave  ', codigo: '123456' });
    expect(r.success && r.data.contrasena).toBe('  clave  ');
  });

  it('rechaza una contraseña vacía y una de más de 256 caracteres', () => {
    expect(esquemaRegenerarCodigos.safeParse({ contrasena: '', codigo: '123456' }).success).toBe(false);
    expect(
      esquemaRegenerarCodigos.safeParse({ contrasena: 'a'.repeat(257), codigo: '123456' }).success,
    ).toBe(false);
    expect(
      esquemaRegenerarCodigos.safeParse({ contrasena: 'a'.repeat(256), codigo: '123456' }).success,
    ).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', '12 456', ' 123456'])('rechaza el código %j', (codigo) => {
    expect(esquemaRegenerarCodigos.safeParse({ contrasena: 'clave', codigo }).success).toBe(false);
  });

  it('un error de validación no lleva el valor de la contraseña', () => {
    const r = esquemaRegenerarCodigos.safeParse({ contrasena: 'secreto-que-no-sale', codigo: 'x' });
    expect(JSON.stringify(r)).not.toContain('secreto-que-no-sale');
  });
});
