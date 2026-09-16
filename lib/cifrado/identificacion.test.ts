import { describe, expect, it, vi } from 'vitest';

const CLAVE_CIFRADO = Buffer.alloc(32, 3);
const CLAVE_INDICE = Buffer.alloc(32, 5);

vi.mock('./claves', () => ({
  VERSION_CLAVE: 1,
  claveDeCifrado: vi.fn(async () => CLAVE_CIFRADO),
  claveDeIndice: vi.fn(async () => CLAVE_INDICE),
}));

import { indice } from './aes-gcm';
import { aBase64 } from './bytea';
import { cifrarIdentificacion, descifrarIdentificacion } from './identificacion';

describe('cifrarIdentificacion', () => {
  it('deriva tipo_documento=dni para un DNI de 8 dígitos y letra', async () => {
    const columnas = await cifrarIdentificacion({ documento: '12345678Z' });
    expect(columnas.p_tipo_documento).toBe('dni');
  });

  it('deriva tipo_documento=nie cuando empieza por X, Y o Z', async () => {
    const columnas = await cifrarIdentificacion({ documento: 'X2482300W' });
    expect(columnas.p_tipo_documento).toBe('nie');
  });

  it('normaliza el documento antes de indexar: formas equivalentes dan el mismo índice', async () => {
    const a = await cifrarIdentificacion({ documento: '12345678z' });
    const b = await cifrarIdentificacion({ documento: '12345678-Z' });
    const c = await cifrarIdentificacion({ documento: ' 12345678 Z ' });
    expect(a.p_dni_indice).toBe(b.p_dni_indice);
    expect(a.p_dni_indice).toBe(c.p_dni_indice);
    // Y coincide con el índice calculado a mano sobre la forma normalizada.
    expect(a.p_dni_indice).toBe(aBase64(indice(CLAVE_INDICE, '12345678Z')));
  });

  it('sin documento ni domicilio, todas las columnas de identificación son null', async () => {
    const columnas = await cifrarIdentificacion({});
    expect(columnas.p_tipo_documento).toBeNull();
    expect(columnas.p_dni_cifrado).toBeNull();
    expect(columnas.p_domicilio_cifrado).toBeNull();
  });

  it('el domicilio se cifra pero no se indexa', async () => {
    const columnas = await cifrarIdentificacion({ domicilio: 'Calle Falsa 123' });
    expect(columnas.p_domicilio_cifrado).not.toBeNull();
    expect(columnas.p_dni_indice).toBeNull();
  });
});

describe('descifrarIdentificacion', () => {
  it('descifra lo que cifrarIdentificacion produjo (ida y vuelta a través de bytea)', async () => {
    const columnas = await cifrarIdentificacion({
      documento: '12345678Z',
      domicilio: 'Calle Ñandú 12',
    });

    // Simula lo que devuelve leer_identificacion() por PostgREST: bytea en forma \x.
    const aBytea = (b64: string | null) =>
      b64 === null ? null : '\\x' + Buffer.from(b64, 'base64').toString('hex');

    const fila = {
      tipo_documento: columnas.p_tipo_documento,
      dni_cifrado: aBytea(columnas.p_dni_cifrado),
      dni_nonce: aBytea(columnas.p_dni_nonce),
      dni_etiqueta: aBytea(columnas.p_dni_etiqueta),
      dni_clave_version: columnas.p_clave_version,
      domicilio_cifrado: aBytea(columnas.p_domicilio_cifrado),
      domicilio_nonce: aBytea(columnas.p_domicilio_nonce),
      domicilio_etiqueta: aBytea(columnas.p_domicilio_etiqueta),
      domicilio_clave_version: columnas.p_clave_version,
    };

    const claro = await descifrarIdentificacion(fila);
    expect(claro.documento).toBe('12345678Z');
    expect(claro.domicilio).toBe('Calle Ñandú 12');
  });

  it('sin documento ni domicilio en la fila, devuelve un objeto vacío', async () => {
    const claro = await descifrarIdentificacion({
      tipo_documento: null,
      dni_cifrado: null,
      dni_nonce: null,
      dni_etiqueta: null,
      dni_clave_version: null,
      domicilio_cifrado: null,
      domicilio_nonce: null,
      domicilio_etiqueta: null,
      domicilio_clave_version: null,
    });
    expect(claro.documento).toBeUndefined();
    expect(claro.domicilio).toBeUndefined();
  });
});
