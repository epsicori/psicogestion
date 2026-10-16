import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { construirSobreBorrador, type EntradaSobreBorrador } from './sobre-borrador';
import vectores from './vectores-borrador.json';

// T-046 · El sobre del borrador en TypeScript. El oráculo independiente es el texto escrito a mano
// del primer caso; los seis vectores congelados se comparan además con su copia literal en el
// banco 32 (vectores-borrador-sql.test.ts) y con la huella que sella la base (32.V).

const BASE: EntradaSobreBorrador = {
  borradorId: '32320000-0000-4000-8000-0000000000B1',
  numeroVersion: 1,
  pacienteId: '32320000-0000-4000-8000-000000000001',
  profesionalId: '00000000-0000-0000-0000-000000000002',
  centroId: null,
  creadaPor: '00000000-0000-0000-0000-000000000002',
  creadaEn: new Date('2026-10-01T10:00:00.123456Z'),
  descartado: false,
  destinatarioNombre: 'Ana',
  nif: null,
  lineas: [
    {
      concepto: 'Sesión',
      cantidad: 1,
      precio_unitario_centimos: 6000,
      regimen_iva: 'exento_sanitario',
      tipo_iva_centesimas: 0,
      cita_id: null,
    },
  ],
  baseCentimos: 6000,
  cuotaCentimos: 0,
  totalCentimos: 6000,
};

type Vector = {
  nombre: string;
  entrada: Omit<EntradaSobreBorrador, 'creadaEn'> & { creadaEn: string };
  contenido_canonico: string;
  huella_hex: string;
};

function huellaGenesis(texto: string): string {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.alloc(32)]))
    .digest('hex');
}

describe('construirSobreBorrador', () => {
  it('escribe las quince claves en orden JCS, sin espacios, uuid en minúsculas y creada_en en ms', () => {
    const { contenidoCanonico } = construirSobreBorrador(BASE);
    expect(contenidoCanonico).toBe(
      '{"base_centimos":6000,"borrador_id":"32320000-0000-4000-8000-0000000000b1","centro_id":null,' +
        '"creada_en":"2026-10-01T10:00:00.123Z","creada_por":"00000000-0000-0000-0000-000000000002",' +
        '"cuota_iva_centimos":0,"descartado":false,"destinatario_nif":null,"destinatario_nombre":"Ana",' +
        '"esquema_version":1,"lineas":[{"cantidad":1,"cita_id":null,"concepto":"Sesión",' +
        '"precio_unitario_centimos":6000,"regimen_iva":"exento_sanitario","tipo_iva_centesimas":0}],' +
        '"numero_version":1,"paciente_id":"32320000-0000-4000-8000-000000000001",' +
        '"profesional_id":"00000000-0000-0000-0000-000000000002","total_centimos":6000}',
    );
  });

  it('el NIF va como objeto de cuatro claves con clave_version 1', () => {
    const { contenidoCanonico } = construirSobreBorrador({
      ...BASE,
      nif: { cifrado: 'QUJD', nonce: 'Tk9OQ0U=', etiqueta: 'RVRJUQ==' },
    });
    expect(contenidoCanonico).toContain(
      '"destinatario_nif":{"cifrado":"QUJD","clave_version":1,"etiqueta":"RVRJUQ==","nonce":"Tk9OQ0U="}',
    );
  });

  it('normaliza a NFC una sola vez y devuelve la entrada normalizada para las columnas', () => {
    const nfd = 'José';
    const { contenidoCanonico, normalizada } = construirSobreBorrador({
      ...BASE,
      destinatarioNombre: nfd,
      lineas: [{ ...BASE.lineas[0], concepto: `Sesión` }],
    });
    expect(normalizada.destinatarioNombre).toBe('José');
    expect(normalizada.lineas[0].concepto).toBe('Sesión');
    expect(contenidoCanonico).toContain('"destinatario_nombre":"José"');
    expect(contenidoCanonico).not.toContain('́');
    // Los uuid normalizados también van en minúsculas a las columnas.
    expect(normalizada.borradorId).toBe('32320000-0000-4000-8000-0000000000b1');
    expect(normalizada.creadaEn.toISOString()).toBe('2026-10-01T10:00:00.123Z');
  });

  it('una cita en mayúsculas sale en minúsculas en el sobre y en la columna', () => {
    const { contenidoCanonico, normalizada } = construirSobreBorrador({
      ...BASE,
      lineas: [{ ...BASE.lineas[0], cita_id: '32320000-0000-4000-8000-0000000000AA' }],
    });
    expect(normalizada.lineas[0].cita_id).toBe('32320000-0000-4000-8000-0000000000aa');
    expect(contenidoCanonico).toContain('"cita_id":"32320000-0000-4000-8000-0000000000aa"');
  });

  it('rechaza importes que no son enteros de céntimos', () => {
    expect(() => construirSobreBorrador({ ...BASE, totalCentimos: 60.5 })).toThrow();
  });
});

describe('vectores congelados del sobre del borrador', () => {
  const lista = vectores as Vector[];

  it('son seis', () => {
    expect(lista).toHaveLength(6);
  });

  it.each(lista.map((v) => [v.nombre, v] as const))('%s: el constructor da el texto y la huella congelados', (_, v) => {
    const { contenidoCanonico } = construirSobreBorrador({ ...v.entrada, creadaEn: new Date(v.entrada.creadaEn) });
    expect(contenidoCanonico).toBe(v.contenido_canonico);
    expect(huellaGenesis(contenidoCanonico)).toBe(v.huella_hex);
  });
});
