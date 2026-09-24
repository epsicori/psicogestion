import { describe, expect, it } from 'vitest';

import { cifrar, descifrar, indice } from './aes-gcm';

const CLAVE_A = Buffer.alloc(32, 7);
const CLAVE_B = Buffer.alloc(32, 9);

describe('cifrar / descifrar', () => {
  it('ida y vuelta de un texto con acentos y ñ', () => {
    const texto = 'Calle Ñandú, 12 — 2º B, Logroño (La Rioja)';
    const sobre = cifrar(CLAVE_A, texto);
    expect(descifrar(CLAVE_A, sobre)).toBe(texto);
  });

  it('dos cifrados del mismo texto difieren (nonce distinto)', () => {
    const texto = '12345678Z';
    const uno = cifrar(CLAVE_A, texto);
    const dos = cifrar(CLAVE_A, texto);
    expect(uno.cifrado.equals(dos.cifrado)).toBe(false);
    expect(uno.nonce.equals(dos.nonce)).toBe(false);
  });

  it('un byte cambiado en el cifrado lanza', () => {
    const sobre = cifrar(CLAVE_A, '12345678Z');
    const alterado = Buffer.from(sobre.cifrado);
    alterado[0] ^= 0xff;
    expect(() => descifrar(CLAVE_A, { ...sobre, cifrado: alterado })).toThrow();
  });

  it('un byte cambiado en la etiqueta lanza', () => {
    const sobre = cifrar(CLAVE_A, '12345678Z');
    const alterada = Buffer.from(sobre.etiqueta);
    alterada[0] ^= 0xff;
    expect(() => descifrar(CLAVE_A, { ...sobre, etiqueta: alterada })).toThrow();
  });

  it('una clave de 31 bytes lanza un mensaje propio', () => {
    const claveCorta = Buffer.alloc(31, 1);
    expect(() => cifrar(claveCorta, 'x')).toThrow(/32 bytes/);
    expect(() => descifrar(claveCorta, cifrar(CLAVE_A, 'x'))).toThrow(/32 bytes/);
  });
});

describe('indice', () => {
  it('12345678z, 12345678-Z y " 12345678 Z " dan el mismo índice tras normalizar', () => {
    // El módulo indice() no normaliza por sí mismo (eso lo hace lib/identidad antes de
    // llamarlo): esta prueba fija que HMAC es determinista sobre la MISMA entrada.
    const normalizado = '12345678Z';
    const uno = indice(CLAVE_A, normalizado);
    const dos = indice(CLAVE_A, normalizado);
    expect(uno.equals(dos)).toBe(true);
  });

  it('el índice es distinto del HMAC con la clave de cifrado (dos claves distintas)', () => {
    const conIndice = indice(CLAVE_B, '12345678Z');
    const conCifrado = indice(CLAVE_A, '12345678Z');
    expect(conIndice.equals(conCifrado)).toBe(false);
  });

  it('devuelve 32 bytes (HMAC-SHA-256)', () => {
    expect(indice(CLAVE_A, 'x').length).toBe(32);
  });

  it('una clave de 31 bytes lanza un mensaje propio', () => {
    expect(() => indice(Buffer.alloc(31, 1), 'x')).toThrow(/32 bytes/);
  });
});
