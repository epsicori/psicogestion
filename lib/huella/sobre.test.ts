import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ALGORITMO_VERSION,
  canonizarSobre,
  construirSobre,
  ESQUEMA_VERSION,
  esquemaSobre,
  type EntradaFirma,
  type Sobre,
} from './sobre';

const AUTOR = '11111111-1111-4111-8111-111111111111';
const OTRO_AUTOR = '22222222-2222-4222-8222-222222222222';
const NOTA = '33333333-3333-4333-8333-333333333333';
const PACIENTE = '55555555-5555-4555-8555-555555555555';
const EPISODIO = '66666666-6666-4666-8666-666666666666';
const COPROFESIONAL = '77777777-7777-4777-8777-777777777777';
const OTRO_COPROFESIONAL = '88888888-8888-4888-8888-888888888888';

/** SHA-256(utf8(canónico) || 32 bytes cero): la huella de un primer eslabón. */
function huellaGenesis(canonico: string): string {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(canonico, 'utf8'), Buffer.alloc(32)]))
    .digest('hex');
}

function entradaBase(sobrescribe: Partial<EntradaFirma> = {}): EntradaFirma {
  return {
    notaId: NOTA,
    pacienteId: PACIENTE,
    episodioId: EPISODIO,
    fechaSesion: '2026-08-29',
    coprofesionalId: null,
    autorId: AUTOR,
    cuerpo: { texto: 'contenido de la nota' },
    anotacionesReservadas: null,
    motivoCambio: null,
    alcance: 'individual',
    citaId: null,
    ventanaCita: null,
    margenMinutos: null,
    abiertaEn: new Date('2026-08-29T09:12:03.123Z'),
    ahora: new Date('2026-08-29T09:20:00.000Z'),
    ...sobrescribe,
  };
}

function sobreBase(sobrescribe: Partial<Sobre> = {}): Sobre {
  return esquemaSobre.parse({
    abierta_en: '2026-08-29T09:12:03.123Z',
    alcance: 'individual',
    anotaciones_reservadas: null,
    autor_id: AUTOR,
    cita_id: null,
    coprofesional_id: null,
    creada_en: '2026-08-29T09:20:00.000Z',
    cuerpo: { texto: 'contenido' },
    episodio_id: EPISODIO,
    esquema_version: ESQUEMA_VERSION,
    fecha_sesion: '2026-08-29',
    firmada_en: '2026-08-29T09:20:00.000Z',
    margen_sesion_minutos: null,
    motivo_cambio: null,
    nota_id: NOTA,
    paciente_id: PACIENTE,
    redactada_en_sesion: false,
    ...sobrescribe,
  });
}

describe('construirSobre', () => {
  it('produce exactamente las diecisiete claves del sobre de la era 4, en orden JCS', () => {
    const sobre = construirSobre(entradaBase());
    const claves = [
      'abierta_en',
      'alcance',
      'anotaciones_reservadas',
      'autor_id',
      'cita_id',
      'coprofesional_id',
      'creada_en',
      'cuerpo',
      'episodio_id',
      'esquema_version',
      'fecha_sesion',
      'firmada_en',
      'margen_sesion_minutos',
      'motivo_cambio',
      'nota_id',
      'paciente_id',
      'redactada_en_sesion',
    ];
    expect(claves).toHaveLength(17);
    expect(Object.keys(sobre).sort()).toEqual(claves);
    // El canónico (JCS) las ordena igual que array_agg(k order by k) en la base.
    expect(Object.keys(JSON.parse(canonizarSobre(sobre)) as object)).toEqual(claves);
  });

  it('esquema_version es 4 y algoritmo_version (constante) es 1', () => {
    const sobre = construirSobre(entradaBase());
    expect(sobre.esquema_version).toBe(4);
    expect(ESQUEMA_VERSION).toBe(4);
    expect(ALGORITMO_VERSION).toBe(1);
  });

  it('lleva la cabecera de la nota: nota, paciente, episodio, fecha de sesión y coprofesional (ADR-067/071/072)', () => {
    const sobre = construirSobre(entradaBase({ coprofesionalId: COPROFESIONAL }));
    expect(sobre.nota_id).toBe(NOTA);
    expect(sobre.paciente_id).toBe(PACIENTE);
    expect(sobre.episodio_id).toBe(EPISODIO);
    expect(sobre.fecha_sesion).toBe('2026-08-29');
    expect(sobre.coprofesional_id).toBe(COPROFESIONAL);
    expect(construirSobre(entradaBase()).coprofesional_id).toBeNull();
  });

  it('pasa a minúsculas nota_id, paciente_id, episodio_id y coprofesional_id', () => {
    const sobre = construirSobre(
      entradaBase({
        notaId: NOTA.toUpperCase(),
        pacienteId: PACIENTE.toUpperCase(),
        episodioId: EPISODIO.toUpperCase(),
        coprofesionalId: 'ABCDEF01-2345-4678-89AB-CDEF01234567',
      }),
    );
    expect(sobre.nota_id).toBe(NOTA);
    expect(sobre.paciente_id).toBe(PACIENTE);
    expect(sobre.episodio_id).toBe(EPISODIO);
    expect(sobre.coprofesional_id).toBe('abcdef01-2345-4678-89ab-cdef01234567');
  });

  it('firmada_en === creada_en siempre', () => {
    const sobre = construirSobre(entradaBase());
    expect(sobre.firmada_en).toBe(sobre.creada_en);
  });

  it('los instantes van en formato toISOString(): UTC, milisegundos, Z', () => {
    const sobre = construirSobre(entradaBase());
    expect(sobre.abierta_en).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(sobre.creada_en).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('sin cita_id, redactada_en_sesion es falso y margen_sesion_minutos es null', () => {
    const sobre = construirSobre(entradaBase({ citaId: null, margenMinutos: 10 }));
    expect(sobre.cita_id).toBeNull();
    expect(sobre.redactada_en_sesion).toBe(false);
    expect(sobre.margen_sesion_minutos).toBeNull();
  });

  it('con cita, ventana y margen adecuados, redactada_en_sesion es verdadero', () => {
    const sobre = construirSobre(
      entradaBase({
        citaId: '44444444-4444-4444-8444-444444444444',
        margenMinutos: 5,
        ventanaCita: { inicio: new Date('2026-08-29T09:00:00.000Z'), fin: new Date('2026-08-29T09:30:00.000Z') },
        abiertaEn: new Date('2026-08-29T09:05:00.000Z'),
        ahora: new Date('2026-08-29T09:25:00.000Z'),
      }),
    );
    expect(sobre.redactada_en_sesion).toBe(true);
    expect(sobre.margen_sesion_minutos).toBe(5);
  });

  it('normaliza a NFC el cuerpo y las anotaciones reservadas', () => {
    const nfd = 'e' + '́';
    const sobre = construirSobre(
      entradaBase({ cuerpo: { texto: nfd }, anotacionesReservadas: nfd }),
    );
    expect((sobre.cuerpo as { texto: string }).texto).toBe('é');
    expect(sobre.anotaciones_reservadas).toBe('é');
  });

  it('rechaza un sobre con una clave de más (.strict())', () => {
    expect(() => esquemaSobre.parse({ ...sobreBase(), extra: 1 })).toThrow();
  });

  it('rechaza nota_id, paciente_id, episodio_id o fecha_sesion a null (ADR-071.4)', () => {
    for (const clave of ['nota_id', 'paciente_id', 'episodio_id', 'fecha_sesion']) {
      expect(() => esquemaSobre.parse({ ...sobreBase(), [clave]: null }), clave).toThrow();
    }
  });

  it('rechaza una fecha_sesion que no sea una fecha real AAAA-MM-DD', () => {
    for (const fecha of ['2026-02-30', '29/08/2026', '2026-08-29T00:00:00Z']) {
      expect(() => esquemaSobre.parse({ ...sobreBase(), fecha_sesion: fecha }), fecha).toThrow();
    }
    expect(esquemaSobre.parse({ ...sobreBase(), fecha_sesion: '2028-02-29' }).fecha_sesion).toBe('2028-02-29');
  });

  it('rechaza un sobre sin la clave coprofesional_id: «omitida» y «null» no son la misma forma (ADR-072.3)', () => {
    const sinCoprofesional: Record<string, unknown> = { ...sobreBase() };
    delete sinCoprofesional.coprofesional_id;
    expect(() => esquemaSobre.parse(sinCoprofesional)).toThrow();
  });

  it('rechaza coprofesional_id que no sea un UUID en minúsculas y acepta null', () => {
    expect(() => esquemaSobre.parse({ ...sobreBase(), coprofesional_id: 'no-es-uuid' })).toThrow();
    expect(esquemaSobre.parse({ ...sobreBase(), coprofesional_id: null }).coprofesional_id).toBeNull();
    expect(esquemaSobre.parse({ ...sobreBase(), coprofesional_id: COPROFESIONAL }).coprofesional_id).toBe(
      COPROFESIONAL,
    );
  });

  it('rechaza cuerpo que no sea un objeto', () => {
    expect(() => esquemaSobre.parse({ ...sobreBase(), cuerpo: [] })).toThrow();
    expect(() => esquemaSobre.parse({ ...sobreBase(), cuerpo: 'texto' })).toThrow();
  });

  it('el alcance del sobre es el de la entrada, no un valor fijo (ADR-057)', () => {
    expect(construirSobre(entradaBase({ alcance: 'conjunta' })).alcance).toBe('conjunta');
    expect(construirSobre(entradaBase({ alcance: 'individual' })).alcance).toBe('individual');
  });
});

describe('canonizarSobre · sensibilidad de la huella a cada campo del sobre', () => {
  it('cambiar un solo carácter de anotaciones_reservadas cambia el canónico (ADR-027)', () => {
    const a = canonizarSobre(sobreBase({ anotaciones_reservadas: 'texto reservado' }));
    const b = canonizarSobre(sobreBase({ anotaciones_reservadas: 'texto reservadX' }));
    expect(a).not.toBe(b);
  });

  it('anotaciones_reservadas null y "" dan canónicos distintos', () => {
    const conNull = canonizarSobre(sobreBase({ anotaciones_reservadas: null }));
    const conVacia = canonizarSobre(sobreBase({ anotaciones_reservadas: '' }));
    expect(conNull).not.toBe(conVacia);
  });

  it('cambiar autor_id cambia el canónico', () => {
    const a = canonizarSobre(sobreBase({ autor_id: AUTOR }));
    const b = canonizarSobre(sobreBase({ autor_id: OTRO_AUTOR }));
    expect(a).not.toBe(b);
  });

  it('cambiar alcance de individual a conjunta cambia el canónico (ADR-057)', () => {
    const a = canonizarSobre(sobreBase({ alcance: 'individual' }));
    const b = canonizarSobre(sobreBase({ alcance: 'conjunta' }));
    expect(a).not.toBe(b);
  });

  it('cambiar redactada_en_sesion de false a true cambia el canónico (ADR-046)', () => {
    const conCita = {
      cita_id: '44444444-4444-4444-8444-444444444444',
      margen_sesion_minutos: 5,
    };
    const a = canonizarSobre(sobreBase({ ...conCita, redactada_en_sesion: false }));
    const b = canonizarSobre(sobreBase({ ...conCita, redactada_en_sesion: true }));
    expect(a).not.toBe(b);
  });

  it('cambiar nota_id cambia el canónico y la huella (ADR-067)', () => {
    const a = canonizarSobre(construirSobre(entradaBase()));
    const b = canonizarSobre(construirSobre(entradaBase({ notaId: '33333333-3333-4333-8333-333333333334' })));
    expect(a).not.toBe(b);
    expect(huellaGenesis(a)).not.toBe(huellaGenesis(b));
  });

  it('cambiar paciente_id, episodio_id o fecha_sesion cambia el canónico (ADR-067, ADR-071)', () => {
    const base = canonizarSobre(construirSobre(entradaBase()));
    const cambios: Partial<EntradaFirma>[] = [
      { pacienteId: '55555555-5555-4555-8555-555555555556' },
      { episodioId: '66666666-6666-4666-8666-666666666667' },
      { fechaSesion: '2026-08-30' },
    ];
    for (const cambio of cambios) {
      expect(canonizarSobre(construirSobre(entradaBase(cambio))), JSON.stringify(cambio)).not.toBe(base);
    }
  });

  it('cambiar coprofesional_id (de null a un UUID, y de un UUID a otro) cambia el canónico y la huella (ADR-072)', () => {
    const sinCo = canonizarSobre(construirSobre(entradaBase({ coprofesionalId: null })));
    const conCo = canonizarSobre(construirSobre(entradaBase({ coprofesionalId: COPROFESIONAL })));
    const conOtro = canonizarSobre(construirSobre(entradaBase({ coprofesionalId: OTRO_COPROFESIONAL })));
    expect(conCo).not.toBe(sinCo);
    expect(huellaGenesis(conCo)).not.toBe(huellaGenesis(sinCo));
    expect(conOtro).not.toBe(conCo);
    expect(huellaGenesis(conOtro)).not.toBe(huellaGenesis(conCo));
  });

  it('el mismo sobre con las diecisiete claves insertadas en otro orden produce el mismo canónico', () => {
    const sobre = sobreBase({ coprofesional_id: COPROFESIONAL });
    const reordenado: Sobre = {
      redactada_en_sesion: sobre.redactada_en_sesion,
      paciente_id: sobre.paciente_id,
      nota_id: sobre.nota_id,
      motivo_cambio: sobre.motivo_cambio,
      margen_sesion_minutos: sobre.margen_sesion_minutos,
      firmada_en: sobre.firmada_en,
      fecha_sesion: sobre.fecha_sesion,
      esquema_version: sobre.esquema_version,
      episodio_id: sobre.episodio_id,
      cuerpo: sobre.cuerpo,
      creada_en: sobre.creada_en,
      coprofesional_id: sobre.coprofesional_id,
      cita_id: sobre.cita_id,
      autor_id: sobre.autor_id,
      anotaciones_reservadas: sobre.anotaciones_reservadas,
      alcance: sobre.alcance,
      abierta_en: sobre.abierta_en,
    };
    expect(canonizarSobre(sobre)).toBe(canonizarSobre(reordenado));
  });
});
