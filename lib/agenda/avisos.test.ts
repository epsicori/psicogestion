import { describe, expect, it } from 'vitest';

import {
  anadirDescartada,
  cuantasDestacadas,
  parsearDescartadas,
  proximoCambio,
  sesionesEnCurso,
  type SesionPropia,
} from './avisos';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function sesion(parcial: Partial<SesionPropia>): SesionPropia {
  return {
    citaId: UUID_A,
    pacienteId: UUID_B,
    nombrePaciente: 'Ana',
    inicio: '2026-10-01T10:00:00.000Z',
    fin: '2026-10-01T10:50:00.000Z',
    desde: '12:00',
    hasta: '12:50',
    estado: 'programada',
    ...parcial,
  };
}

describe('sesionesEnCurso', () => {
  it('incluye el inicio y excluye el fin (ADR-045)', () => {
    const s = sesion({});
    expect(sesionesEnCurso([s], new Date('2026-10-01T10:00:00.000Z'))).toEqual([s]);
    expect(sesionesEnCurso([s], new Date('2026-10-01T10:49:59.999Z'))).toEqual([s]);
    expect(sesionesEnCurso([s], new Date('2026-10-01T10:50:00.000Z'))).toEqual([]);
    expect(sesionesEnCurso([s], new Date('2026-10-01T09:59:59.999Z'))).toEqual([]);
  });

  it('una cancelada o no asistida no está en curso aunque el reloj caiga dentro', () => {
    const ahora = new Date('2026-10-01T10:10:00.000Z');
    expect(sesionesEnCurso([sesion({ estado: 'cancelada' })], ahora)).toEqual([]);
    expect(sesionesEnCurso([sesion({ estado: 'no_asistida' })], ahora)).toEqual([]);
    expect(sesionesEnCurso([sesion({ estado: 'realizada' })], ahora)).toHaveLength(1);
  });

  it('ordena por inicio', () => {
    const tarde = sesion({ citaId: UUID_B, inicio: '2026-10-01T10:05:00.000Z' });
    const pronto = sesion({ citaId: UUID_A });
    const ahora = new Date('2026-10-01T10:10:00.000Z');
    expect(sesionesEnCurso([tarde, pronto], ahora).map((s) => s.citaId)).toEqual([UUID_A, UUID_B]);
  });
});

describe('proximoCambio', () => {
  it('es el menor inicio o fin estrictamente posterior a ahora', () => {
    const a = sesion({ inicio: '2026-10-01T10:00:00.000Z', fin: '2026-10-01T10:50:00.000Z' });
    const b = sesion({ inicio: '2026-10-01T11:00:00.000Z', fin: '2026-10-01T11:50:00.000Z' });
    expect(proximoCambio([b, a], new Date('2026-10-01T09:00:00.000Z'))).toEqual(
      new Date('2026-10-01T10:00:00.000Z'),
    );
    expect(proximoCambio([b, a], new Date('2026-10-01T10:00:00.000Z'))).toEqual(
      new Date('2026-10-01T10:50:00.000Z'),
    );
    expect(proximoCambio([b, a], new Date('2026-10-01T10:55:00.000Z'))).toEqual(
      new Date('2026-10-01T11:00:00.000Z'),
    );
  });

  it('es null si no queda ningún cambio por delante', () => {
    expect(proximoCambio([], new Date('2026-10-01T09:00:00.000Z'))).toBeNull();
    expect(proximoCambio([sesion({})], new Date('2026-10-01T10:50:00.000Z'))).toBeNull();
  });
});

describe('parsearDescartadas', () => {
  it('sin cookie, lista vacía', () => {
    expect(parsearDescartadas(undefined)).toEqual([]);
    expect(parsearDescartadas('')).toEqual([]);
  });

  it('solo conserva UUID válidos', () => {
    expect(parsearDescartadas(`${UUID_A},basura,${UUID_B},<script>`)).toEqual([UUID_A, UUID_B]);
  });

  it('se queda con los 20 últimos como mucho', () => {
    const ids = Array.from(
      { length: 25 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const resultado = parsearDescartadas(ids.join(','));
    expect(resultado).toHaveLength(20);
    expect(resultado[19]).toBe(ids[24]);
  });
});

describe('anadirDescartada', () => {
  it('añade sin duplicar', () => {
    expect(anadirDescartada([UUID_A], UUID_B)).toEqual([UUID_A, UUID_B]);
    expect(anadirDescartada([UUID_A], UUID_A)).toEqual([UUID_A]);
  });

  it('recorta a 20 quitando el más antiguo', () => {
    const ids = Array.from(
      { length: 20 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const resultado = anadirDescartada(ids, UUID_A);
    expect(resultado).toHaveLength(20);
    expect(resultado[0]).toBe(ids[1]);
    expect(resultado[19]).toBe(UUID_A);
  });
});

describe('cuantasDestacadas', () => {
  it('suma nivel 2 y nivel 3, nunca el 1', () => {
    expect(cuantasDestacadas({ nivel1: 5, nivel2: 2, nivel3: 1 })).toBe(3);
    expect(cuantasDestacadas({ nivel1: 5, nivel2: 0, nivel3: 0 })).toBe(0);
  });
});
