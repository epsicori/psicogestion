import { describe, expect, it } from 'vitest';

import {
  anadirDescartada,
  combinarAvisos,
  cuantasDestacadas,
  esquemaDatosAvisos,
  fotoDeLayout,
  type DatosAvisos,
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

function datos(parcial: Partial<DatosAvisos> = {}): DatosAvisos {
  return {
    ahoraServidor: '2026-10-01T10:00:00.000Z',
    sesiones: [],
    recuento: { nivel1: 0, nivel2: 0, nivel3: 0 },
    notificaciones: [],
    descartadas: [],
    ...parcial,
  };
}

describe('fotoDeLayout (B2-H3: una lectura fallida no pisa la buena)', () => {
  const COMPLETA = {
    ahoraServidor: '2026-10-01T10:00:00.000Z',
    sesiones: [sesion({})],
    recuento: { nivel1: 1, nivel2: 0, nivel3: 0 },
    notificaciones: [],
  };

  it('con las tres lecturas conserva el instante del servidor y los datos', () => {
    const f = fotoDeLayout(COMPLETA, [UUID_A]);
    expect(f.ahoraServidor).toBe(COMPLETA.ahoraServidor);
    expect(f.sesiones).toEqual(COMPLETA.sesiones);
    expect(f.recuento).toEqual(COMPLETA.recuento);
    expect(f.descartadas).toEqual([UUID_A]);
  });

  for (const falla of ['sesiones', 'recuento', 'notificaciones'] as const) {
    it(`si falla la lectura de ${falla}, se pinta sin sesiones y con el instante de la época`, () => {
      const f = fotoDeLayout({ ...COMPLETA, [falla]: null }, []);
      expect(f.sesiones).toEqual([]);
      expect(f.ahoraServidor).toBe('1970-01-01T00:00:00.000Z');
    });

    it(`y una foto fresca buena gana a la del layout con ${falla} fallida`, () => {
      const inicial = fotoDeLayout({ ...COMPLETA, [falla]: null }, []);
      const fresco = datos({ ahoraServidor: '2026-10-01T09:00:00.000Z' });
      expect(combinarAvisos(inicial, fresco)).toBe(fresco);
    });
  }
});

describe('combinarAvisos', () => {
  it('devuelve la foto fresca solo si es estrictamente posterior', () => {
    const inicial = datos();
    const fresco = datos({
      ahoraServidor: '2026-10-01T10:00:00.001Z',
      recuento: { nivel1: 0, nivel2: 1, nivel3: 0 },
    });
    expect(combinarAvisos(inicial, fresco)).toBe(fresco);
  });

  it('con el mismo instante conserva la inicial (>= sería un bug)', () => {
    const inicial = datos();
    const fresco = datos({ recuento: { nivel1: 9, nivel2: 9, nivel3: 9 } });
    expect(combinarAvisos(inicial, fresco)).toBe(inicial);
  });

  it('una foto más vieja nunca pisa a la nueva', () => {
    const inicial = datos({ ahoraServidor: '2026-10-01T10:05:00.000Z' });
    const fresco = datos({ ahoraServidor: '2026-10-01T10:00:00.000Z' });
    expect(combinarAvisos(inicial, fresco)).toBe(inicial);
  });

  it('sin foto fresca devuelve la inicial', () => {
    const inicial = datos();
    expect(combinarAvisos(inicial, null)).toBe(inicial);
  });

  it('un instante ilegible en la fresca no gana', () => {
    const inicial = datos();
    expect(combinarAvisos(inicial, datos({ ahoraServidor: 'no es una fecha' }))).toBe(inicial);
  });
});

describe('esquemaDatosAvisos', () => {
  const sesionJson = sesion({});
  const valido = {
    ahoraServidor: '2026-10-01T10:00:00.000Z',
    sesiones: [sesionJson],
    recuento: { nivel1: 1, nivel2: 2, nivel3: 3 },
    notificaciones: [
      { id: UUID_A, tipo: 'nota_sin_firmar', titulo: null, detalle: 'x', fecha: '1 oct', leida: false },
    ],
    descartadas: [UUID_B],
  };

  it('acepta la forma de DatosAvisos', () => {
    expect(esquemaDatosAvisos.safeParse(valido).success).toBe(true);
  });

  it.each([
    ['sin sesiones', { ...valido, sesiones: undefined }],
    ['estado de cita desconocido', { ...valido, sesiones: [{ ...sesionJson, estado: 'inventado' }] }],
    ['recuento negativo', { ...valido, recuento: { nivel1: -1, nivel2: 0, nivel3: 0 } }],
    ['instante no ISO', { ...valido, ahoraServidor: 'ayer' }],
    ['descartada que no es UUID', { ...valido, descartadas: ['no-uuid'] }],
    ['un HTML', '<html></html>'],
    ['null', null],
  ])('rechaza: %s', (_nombre, cuerpo) => {
    expect(esquemaDatosAvisos.safeParse(cuerpo).success).toBe(false);
  });
});
