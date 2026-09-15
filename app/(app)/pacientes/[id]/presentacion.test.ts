import { describe, expect, it } from 'vitest';

import {
  MESES_VALORACION_VIGENTE,
  agruparPorEpisodio,
  edadEnAnios,
  minutosRestantes,
  valoracionEsAntigua,
} from './presentacion';

const AHORA = new Date('2026-09-15T12:00:00Z');

describe('edadEnAnios', () => {
  it('cuenta años cumplidos, no años empezados', () => {
    expect(edadEnAnios('1990-09-16', AHORA)).toBe(35);
    expect(edadEnAnios('1990-09-15', AHORA)).toBe(36);
  });

  it('sin fecha de nacimiento no inventa un cero', () => {
    // Un cero diría «recién nacido». La ausencia se dice, no se rellena.
    expect(edadEnAnios(null, AHORA)).toBeNull();
  });

  it('una fecha futura o ilegible es un dato mal metido, no una edad negativa', () => {
    expect(edadEnAnios('2030-01-01', AHORA)).toBeNull();
    expect(edadEnAnios('no es una fecha', AHORA)).toBeNull();
  });
});

describe('valoracionEsAntigua', () => {
  it('justo en el umbral ya conviene revisarla', () => {
    const umbral = new Date(AHORA);
    umbral.setMonth(umbral.getMonth() - MESES_VALORACION_VIGENTE);
    expect(valoracionEsAntigua(umbral.toISOString(), AHORA)).toBe(true);
  });

  it('una valoración reciente no se marca', () => {
    expect(valoracionEsAntigua('2026-08-01T00:00:00Z', AHORA)).toBe(false);
  });

  it('una fecha ilegible no se marca: marcarla acusaría de vieja a lo que no sabemos leer', () => {
    expect(valoracionEsAntigua('vaya', AHORA)).toBe(false);
  });
});

describe('minutosRestantes', () => {
  it('redondea hacia arriba, para no decir «0 min» medio minuto antes de tiempo', () => {
    expect(minutosRestantes('2026-09-15T12:00:30Z', AHORA)).toBe(1);
    expect(minutosRestantes('2026-09-15T12:14:01Z', AHORA)).toBe(15);
  });

  it('una ventana ya vencida da negativo, no cero', () => {
    expect(minutosRestantes('2026-09-15T11:58:00Z', AHORA)).toBe(-2);
  });
});

describe('agruparPorEpisodio', () => {
  const episodio = {
    id: 'e1',
    motivo_consulta: 'Ansiedad ante exámenes',
    modalidad_relacional: 'individual' as const,
    abierto_en: '2026-01-10T09:00:00Z',
    cerrado_en: null,
  };

  const diagnostico = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    episodio_id: 'e1',
    cie10es_codigo: 'F41.1',
    cie10es_descripcion: 'Trastorno de ansiedad generalizada',
    principal: false,
    retirado_en: null,
    ...extra,
  });

  it('cuelga cada diagnóstico de su episodio', () => {
    const [vista] = agruparPorEpisodio([episodio], [diagnostico('d1')]);
    expect(vista.motivo).toBe('Ansiedad ante exámenes');
    expect(vista.diagnosticos.map((d) => d.id)).toEqual(['d1']);
  });

  it('ordena el principal primero y el retirado al final', () => {
    const [vista] = agruparPorEpisodio(
      [episodio],
      [
        diagnostico('secundario'),
        diagnostico('retirado', { retirado_en: '2026-05-01T00:00:00Z' }),
        diagnostico('principal', { principal: true }),
      ],
    );
    expect(vista.diagnosticos.map((d) => d.id)).toEqual(['principal', 'secundario', 'retirado']);
  });

  it('un episodio que RLS no deja ver se lleva sus diagnósticos, no los suelta sueltos', () => {
    // Es el escenario de verdad: `diagnosticos` tiene política propia y puede llegar una
    // fila cuyo episodio no ha llegado. Enseñarla suelta diría que ese episodio existe.
    const vistas = agruparPorEpisodio([], [diagnostico('huerfano')]);
    expect(vistas).toEqual([]);
  });

  it('un episodio sin diagnósticos se pinta igual, con la lista vacía', () => {
    const [vista] = agruparPorEpisodio([episodio], []);
    expect(vista.diagnosticos).toEqual([]);
  });
});
