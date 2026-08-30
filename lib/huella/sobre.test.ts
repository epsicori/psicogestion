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

function entradaBase(sobrescribe: Partial<EntradaFirma> = {}): EntradaFirma {
  return {
    notaId: '33333333-3333-4333-8333-333333333333',
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
    anotaciones_reservadas: null,
    autor_id: AUTOR,
    cita_id: null,
    creada_en: '2026-08-29T09:20:00.000Z',
    cuerpo: { texto: 'contenido' },
    esquema_version: ESQUEMA_VERSION,
    firmada_en: '2026-08-29T09:20:00.000Z',
    margen_sesion_minutos: null,
    motivo_cambio: null,
    redactada_en_sesion: false,
    ...sobrescribe,
  });
}

describe('construirSobre', () => {
  it('produce exactamente las once claves del sobre', () => {
    const sobre = construirSobre(entradaBase());
    expect(Object.keys(sobre).sort()).toEqual(
      [
        'abierta_en',
        'anotaciones_reservadas',
        'autor_id',
        'cita_id',
        'creada_en',
        'cuerpo',
        'esquema_version',
        'firmada_en',
        'margen_sesion_minutos',
        'motivo_cambio',
        'redactada_en_sesion',
      ].sort(),
    );
  });

  it('esquema_version es 2 y algoritmo_version (constante) es 1', () => {
    const sobre = construirSobre(entradaBase());
    expect(sobre.esquema_version).toBe(2);
    expect(ESQUEMA_VERSION).toBe(2);
    expect(ALGORITMO_VERSION).toBe(1);
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

  it('rechaza cuerpo que no sea un objeto', () => {
    expect(() => esquemaSobre.parse({ ...sobreBase(), cuerpo: [] })).toThrow();
    expect(() => esquemaSobre.parse({ ...sobreBase(), cuerpo: 'texto' })).toThrow();
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

  it('cambiar redactada_en_sesion de false a true cambia el canónico (ADR-046)', () => {
    const conCita = {
      cita_id: '44444444-4444-4444-8444-444444444444',
      margen_sesion_minutos: 5,
    };
    const a = canonizarSobre(sobreBase({ ...conCita, redactada_en_sesion: false }));
    const b = canonizarSobre(sobreBase({ ...conCita, redactada_en_sesion: true }));
    expect(a).not.toBe(b);
  });

  it('el mismo sobre con las claves insertadas en otro orden produce el mismo canónico', () => {
    const sobre = sobreBase();
    const reordenado: Sobre = {
      redactada_en_sesion: sobre.redactada_en_sesion,
      motivo_cambio: sobre.motivo_cambio,
      margen_sesion_minutos: sobre.margen_sesion_minutos,
      firmada_en: sobre.firmada_en,
      esquema_version: sobre.esquema_version,
      cuerpo: sobre.cuerpo,
      creada_en: sobre.creada_en,
      cita_id: sobre.cita_id,
      autor_id: sobre.autor_id,
      anotaciones_reservadas: sobre.anotaciones_reservadas,
      abierta_en: sobre.abierta_en,
    };
    expect(canonizarSobre(sobre)).toBe(canonizarSobre(reordenado));
  });
});
