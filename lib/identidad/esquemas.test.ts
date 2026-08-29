import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import {
  esquemaCodigoPostal,
  esquemaColegiado,
  esquemaIban,
  esquemaNif,
  esquemaTelefono,
} from './esquemas';

// Los refinamientos se prueban compuestos en un `z.object`, como los usarán los
// formularios.

const esquemaEjemplo = z.object({
  nif: esquemaNif,
  telefono: esquemaTelefono,
});

describe('esquemas de identidad', () => {
  it('validan y devuelven la forma normalizada', () => {
    const resultado = esquemaEjemplo.safeParse({
      nif: '12345678-z',
      telefono: '600 00 00 00',
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).toEqual({
        nif: '12345678Z',
        telefono: '+34600000000',
      });
    }
  });

  it('devuelven mensajes en castellano cuando no validan', () => {
    const resultado = esquemaEjemplo.safeParse({
      nif: '12345678Y',
      telefono: '500000000',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const mensajes = resultado.error.issues.map((issue) => issue.message);
      expect(mensajes).toContain('Revisa el DNI o NIE: la letra no coincide con el número');
      expect(mensajes).toContain(
        'Introduce un teléfono español válido, por ejemplo 600 123 456',
      );
    }
  });

  it('esquemaIban normaliza a mayúsculas sin espacios', () => {
    const resultado = esquemaIban.safeParse('es91 2100 0418 4502 0005 1332');

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).toBe('ES9121000418450200051332');
    }
  });

  it('esquemaCodigoPostal recorta y conserva el cero inicial', () => {
    const resultado = esquemaCodigoPostal.safeParse('  01001 ');

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).toBe('01001');
    }
  });

  it('esquemaColegiado sanea sin exigir formato', () => {
    const resultado = esquemaColegiado.safeParse('  M  -1234 ');

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).toBe('M -1234');
    }
  });
});
