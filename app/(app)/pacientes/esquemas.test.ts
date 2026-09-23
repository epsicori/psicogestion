import { afterEach, describe, expect, it, vi } from 'vitest';

import { esquemaNuevoPaciente } from './esquemas';

// Fecha de nacimiento válida y estable para las pruebas que no la ponen a prueba a ella.
const FECHA_VALIDA = '1990-05-20';

function datosMinimos(extra: Record<string, unknown> = {}) {
  return {
    nombre: 'Ana',
    apellidos: 'García López',
    fechaNacimiento: FECHA_VALIDA,
    ...extra,
  };
}

describe('esquemaNuevoPaciente', () => {
  it('acepta nombre y apellidos válidos', () => {
    const resultado = esquemaNuevoPaciente.safeParse(datosMinimos());

    expect(resultado.success).toBe(true);
  });

  it('acepta un nombre de un solo carácter (longitud mínima)', () => {
    const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ nombre: 'A', apellidos: 'G' }));

    expect(resultado.success).toBe(true);
  });

  it('rechaza el nombre vacío', () => {
    const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ nombre: '' }));

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('Introduce el nombre');
    }
  });

  it('recorta los espacios sobrantes antes de validar', () => {
    const resultado = esquemaNuevoPaciente.safeParse(
      datosMinimos({ nombre: '  Ana  ', apellidos: '  García López  ' }),
    );

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.nombre).toBe('Ana');
      expect(resultado.data.apellidos).toBe('García López');
    }
  });

  it('rechaza un nombre que solo tiene espacios', () => {
    const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ nombre: '   ' }));

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('Introduce el nombre');
    }
  });

  it('rechaza un nombre con tipo equivocado', () => {
    const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ nombre: 42 }));

    expect(resultado.success).toBe(false);
  });

  it('rechaza un nombre que pasa de la longitud máxima', () => {
    const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ nombre: 'a'.repeat(121) }));

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('El nombre es demasiado largo');
    }
  });

  it('rechaza los apellidos vacíos', () => {
    const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ apellidos: '' }));

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe('Introduce los apellidos');
    }
  });

  describe('fechaNacimiento', () => {
    it('es obligatoria', () => {
      const resultado = esquemaNuevoPaciente.safeParse({ nombre: 'Ana', apellidos: 'García' });
      expect(resultado.success).toBe(false);
    });

    it('rechaza una fecha futura', () => {
      const enElFuturo = new Date();
      enElFuturo.setFullYear(enElFuturo.getFullYear() + 1);
      const resultado = esquemaNuevoPaciente.safeParse(
        datosMinimos({ fechaNacimiento: enElFuturo.toISOString().slice(0, 10) }),
      );
      expect(resultado.success).toBe(false);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // Con «hoy» en 2000-01-01, 1899-12-31 son 100 años: solo puede caer por la guarda de 1900,
    // no por la de 120 años (H10 de la revisión: con el reloj real caían las dos y la prueba
    // no distinguía cuál). La gemela es el 1900-01-01, un día después, que sí entra.
    it('rechaza una fecha anterior a 1900 por la guarda de 1900, no por la de 120 años', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2000-01-01T12:00:00Z'));
      const resultado = esquemaNuevoPaciente.safeParse(
        datosMinimos({ fechaNacimiento: '1899-12-31' }),
      );
      expect(resultado.success).toBe(false);
      if (!resultado.success) {
        expect(resultado.error.issues.map((i) => i.message)).toEqual(['Fecha de nacimiento fuera de rango']);
      }
      const gemela = esquemaNuevoPaciente.safeParse(datosMinimos({ fechaNacimiento: '1900-01-01' }));
      expect(gemela.success).toBe(true);
    });

    // `new Date('2023-02-30')` no es NaN: el motor lo corre al 2 de marzo. La fecha de
    // calendario se comprueba por ida y vuelta (H10 de la revisión).
    it.each(['2023-02-30', '2023-02-29', '2023-04-31', '2023-13-01', '2023-00-10'])(
      'rechaza la fecha inexistente %s',
      (fecha) => {
        const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ fechaNacimiento: fecha }));
        expect(resultado.success).toBe(false);
        if (!resultado.success) {
          expect(resultado.error.issues[0].message).toBe('Esa fecha no es válida');
        }
      },
    );

    it('acepta el 29 de febrero de un año bisiesto', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ fechaNacimiento: '2024-02-29' }));
      expect(resultado.success).toBe(true);
    });

    it('rechaza una edad mayor de 120 años', () => {
      const resultado = esquemaNuevoPaciente.safeParse(
        datosMinimos({ fechaNacimiento: '1900-01-02' }),
      );
      expect(resultado.success).toBe(false);
    });

    it('rechaza una forma que no sea AAAA-MM-DD', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ fechaNacimiento: '20/05/1990' }));
      expect(resultado.success).toBe(false);
    });
  });

  describe('sexo', () => {
    it('es opcional', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos());
      expect(resultado.success).toBe(true);
      if (resultado.success) expect(resultado.data.sexo).toBeUndefined();
    });

    it('acepta hombre, mujer y otro', () => {
      for (const sexo of ['hombre', 'mujer', 'otro']) {
        expect(esquemaNuevoPaciente.safeParse(datosMinimos({ sexo })).success).toBe(true);
      }
    });

    it('rechaza un valor que no está en el catálogo', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ sexo: 'masculino' }));
      expect(resultado.success).toBe(false);
    });
  });

  describe('telefono', () => {
    it('es opcional: una cadena vacía no rechaza', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ telefono: '' }));
      expect(resultado.success).toBe(true);
      if (resultado.success) expect(resultado.data.telefono).toBeUndefined();
    });

    it('rechaza un teléfono con forma inválida', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ telefono: '12345' }));
      expect(resultado.success).toBe(false);
    });

    it('normaliza a E.164', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ telefono: '600 00 00 00' }));
      expect(resultado.success).toBe(true);
      if (resultado.success) expect(resultado.data.telefono).toBe('+34600000000');
    });
  });

  describe('dni', () => {
    it('es opcional', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos());
      expect(resultado.success).toBe(true);
      if (resultado.success) expect(resultado.data.dni).toBeUndefined();
    });

    it('rechaza un DNI con letra de control equivocada', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ dni: '12345678A' }));
      expect(resultado.success).toBe(false);
    });

    it('acepta un DNI válido y lo normaliza (mayúsculas, sin espacios)', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos({ dni: '12345678 z' }));
      expect(resultado.success).toBe(true);
      if (resultado.success) expect(resultado.data.dni).toBe('12345678Z');
    });
  });

  describe('domicilio, alergias y medicación', () => {
    it('los tres son opcionales', () => {
      const resultado = esquemaNuevoPaciente.safeParse(datosMinimos());
      expect(resultado.success).toBe(true);
    });

    it('el domicilio rechaza más de 300 caracteres', () => {
      const resultado = esquemaNuevoPaciente.safeParse(
        datosMinimos({ domicilio: 'a'.repeat(301) }),
      );
      expect(resultado.success).toBe(false);
    });

    it('las alergias y la medicación rechazan más de 2000 caracteres', () => {
      expect(
        esquemaNuevoPaciente.safeParse(datosMinimos({ alergias: 'a'.repeat(2001) })).success,
      ).toBe(false);
      expect(
        esquemaNuevoPaciente.safeParse(datosMinimos({ medicacionActual: 'a'.repeat(2001) }))
          .success,
      ).toBe(false);
    });
  });
});
