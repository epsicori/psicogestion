import { describe, expect, it } from 'vitest';

import {
  esquemaDialogoCopia,
  esquemaDialogoCopiaPorMotivo,
  esquemaPedirCopia,
  esquemaRegistrarFichero,
} from './esquemas-copia';

const P = '11111111-1111-4111-8111-111111111111';
const N = '22222222-2222-4222-8222-222222222222';
const E = '33333333-3333-4333-8333-333333333333';
const HUELLA = 'a'.repeat(64);

describe('esquemaPedirCopia', () => {
  const profesional = { pacienteId: P, notaId: N, motivo: null, referencia: null };
  const conMotivo = { pacienteId: P, notaId: N, motivo: 'traspaso_caso', referencia: 'EXP-12' };

  it('acepta la copia del profesional (sin motivo ni referencia) y la copia por motivo', () => {
    expect(esquemaPedirCopia.safeParse(profesional).success).toBe(true);
    expect(esquemaPedirCopia.safeParse(conMotivo).success).toBe(true);
  });
  it('es estricto: una contraseña colada en la entrada la rechaza, no se ignora en silencio', () => {
    expect(esquemaPedirCopia.safeParse({ ...profesional, contrasena: 'una-contrasena-larga' }).success).toBe(false);
  });
  it('el motivo y la referencia van juntos', () => {
    expect(esquemaPedirCopia.safeParse({ ...profesional, motivo: 'traspaso_caso' }).success).toBe(false);
    expect(esquemaPedirCopia.safeParse({ ...profesional, referencia: 'EXP-12' }).success).toBe(false);
  });
  it('la referencia mide de 3 a 200 tras recortar', () => {
    expect(esquemaPedirCopia.safeParse({ ...conMotivo, referencia: '  ab  ' }).success).toBe(false);
    expect(esquemaPedirCopia.safeParse({ ...conMotivo, referencia: 'x'.repeat(201) }).success).toBe(false);
    expect(esquemaPedirCopia.safeParse({ ...conMotivo, referencia: 'x'.repeat(200) }).success).toBe(true);
  });
  it('rechaza un motivo fuera del enum y un identificador que no es UUID', () => {
    expect(esquemaPedirCopia.safeParse({ ...conMotivo, motivo: 'curiosidad' }).success).toBe(false);
    expect(esquemaPedirCopia.safeParse({ ...profesional, notaId: 'x' }).success).toBe(false);
  });
});

describe('esquemaRegistrarFichero', () => {
  it('acepta una huella SHA-256 en hexadecimal minúsculo', () => {
    expect(esquemaRegistrarFichero.safeParse({ pacienteId: P, exportacionId: E, huellaHex: HUELLA }).success).toBe(true);
  });
  it('rechaza mayúsculas, longitudes distintas y campos de más', () => {
    expect(esquemaRegistrarFichero.safeParse({ pacienteId: P, exportacionId: E, huellaHex: 'A'.repeat(64) }).success).toBe(false);
    expect(esquemaRegistrarFichero.safeParse({ pacienteId: P, exportacionId: E, huellaHex: 'a'.repeat(63) }).success).toBe(false);
    expect(
      esquemaRegistrarFichero.safeParse({ pacienteId: P, exportacionId: E, huellaHex: HUELLA, contrasena: 'x' }).success,
    ).toBe(false);
  });
});

describe('esquemaDialogoCopia', () => {
  const valido = {
    motivo: null,
    referencia: '',
    contrasena: 'caballo-bateria-grapa',
    repeticion: 'caballo-bateria-grapa',
    entendido: true,
  };
  const ruta = (r: ReturnType<typeof esquemaDialogoCopia.safeParse>) =>
    r.success ? [] : r.error.issues.map((i) => i.path.join('.'));

  it('acepta una contraseña de 12 caracteres repetida y la casilla marcada', () => {
    expect(esquemaDialogoCopia.safeParse(valido).success).toBe(true);
    expect(esquemaDialogoCopia.safeParse({ ...valido, contrasena: 'x'.repeat(12), repeticion: 'x'.repeat(12) }).success).toBe(true);
  });
  it('cuenta caracteres, no unidades UTF-16: once emojis no llegan a doce', () => {
    const once = '😀'.repeat(11);
    expect(ruta(esquemaDialogoCopia.safeParse({ ...valido, contrasena: once, repeticion: once }))).toContain('contrasena');
  });
  it('rechaza más de 256 caracteres', () => {
    const larga = 'x'.repeat(257);
    expect(ruta(esquemaDialogoCopia.safeParse({ ...valido, contrasena: larga, repeticion: larga }))).toContain('contrasena');
  });
  it('compara tras NFC: «é» precompuesta y descompuesta son la misma contraseña', () => {
    const nfc = 'contraseñaé12'.normalize('NFC');
    const nfd = 'contraseñaé12'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect(esquemaDialogoCopia.safeParse({ ...valido, contrasena: nfc, repeticion: nfd }).success).toBe(true);
  });
  it('si no coinciden, el error va en la repetición', () => {
    expect(ruta(esquemaDialogoCopia.safeParse({ ...valido, repeticion: 'otra-cosa-larga' }))).toEqual(['repeticion']);
  });
  it('sin la casilla marcada, no', () => {
    expect(ruta(esquemaDialogoCopia.safeParse({ ...valido, entendido: false }))).toContain('entendido');
  });
  it('con motivo exige referencia de 3 a 200, y sin motivo la referencia va vacía', () => {
    expect(ruta(esquemaDialogoCopia.safeParse({ ...valido, motivo: 'traspaso_caso', referencia: 'ab' }))).toEqual(['referencia']);
    expect(esquemaDialogoCopia.safeParse({ ...valido, motivo: 'traspaso_caso', referencia: 'EXP-12' }).success).toBe(true);
    expect(ruta(esquemaDialogoCopia.safeParse({ ...valido, referencia: 'EXP-12' }))).toEqual(['referencia']);
  });
});

describe('esquemaDialogoCopiaPorMotivo', () => {
  it('exige el motivo', () => {
    const r = esquemaDialogoCopiaPorMotivo.safeParse({
      motivo: null,
      referencia: '',
      contrasena: 'caballo-bateria-grapa',
      repeticion: 'caballo-bateria-grapa',
      entendido: true,
    });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toContain('motivo');
  });
});
