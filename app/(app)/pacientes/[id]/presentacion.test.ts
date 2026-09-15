import { describe, expect, it } from 'vitest';

import {
  MESES_VALORACION_VIGENTE,
  agruparPorEpisodio,
  edadEnAnios,
  estadoDeConsentimiento,
  estadoDocumental,
  minutosRestantes,
  representacionVigente,
  resumirCitas,
  valoracionEsAntigua,
  type CitaDeVista,
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

describe('resumirCitas', () => {
  const cita = (id: string, inicio: string, estado: CitaDeVista['estado']): CitaDeVista => ({
    id,
    inicio,
    fin: inicio,
    estado,
    zonaHoraria: 'Europe/Madrid',
    sala: null,
  });

  const citas = [
    cita('vieja', '2026-06-01T09:00:00Z', 'realizada'),
    cita('ultima', '2026-09-01T09:00:00Z', 'realizada'),
    cita('faltó', '2026-08-01T09:00:00Z', 'no_asistida'),
    cita('anulada', '2026-08-15T09:00:00Z', 'cancelada'),
    cita('proxima', '2026-09-18T09:00:00Z', 'confirmada'),
    cita('lejana', '2026-10-01T09:00:00Z', 'programada'),
  ];

  it('la última sesión es la última REALIZADA, no la última que pasó', () => {
    // Una cita a la que el paciente no vino no es una sesión: contarla diría que se le vio.
    expect(resumirCitas(citas, AHORA).ultimaSesion?.id).toBe('ultima');
  });

  it('la próxima cita es la más cercana por delante y nunca una cancelada', () => {
    const conAnuladaCerca = [...citas, cita('anulada-manana', '2026-09-16T09:00:00Z', 'cancelada')];
    expect(resumirCitas(conAnuladaCerca, AHORA).proximaCita?.id).toBe('proxima');
  });

  it('cuenta por separado lo realizado, lo no asistido y lo cancelado', () => {
    const resumen = resumirCitas(citas, AHORA);
    expect([resumen.realizadas, resumen.noAsistidas, resumen.canceladas]).toEqual([2, 1, 1]);
  });

  it('una fila con fecha ilegible se descarta y no arrastra al resto', () => {
    // Un NaN en la comparación deja el orden indefinido: una sola fila mala decidiría
    // cuál es la última sesión de todo el expediente.
    const resumen = resumirCitas([cita('rota', 'vaya', 'realizada'), ...citas], AHORA);
    expect(resumen.ultimaSesion?.id).toBe('ultima');
    expect(resumen.realizadas).toBe(2);
  });

  it('sin citas no hay ni última ni próxima, y los contadores son cero', () => {
    const resumen = resumirCitas([], AHORA);
    expect(resumen.ultimaSesion).toBeNull();
    expect(resumen.proximaCita).toBeNull();
    expect(resumen.realizadas).toBe(0);
  });
});

describe('estadoDeConsentimiento', () => {
  it('retirado manda sobre firmado: se firmó y luego se revocó', () => {
    expect(
      estadoDeConsentimiento({ otorgadoEn: '2026-01-01T00:00:00Z', revocadoEn: '2026-05-01T00:00:00Z' }),
    ).toBe('retirado');
  });

  it('con fecha de otorgamiento está firmado', () => {
    expect(estadoDeConsentimiento({ otorgadoEn: '2026-01-01T00:00:00Z', revocadoEn: null })).toBe(
      'firmado',
    );
  });

  it('sin ninguna de las dos fechas está pendiente de firma', () => {
    expect(estadoDeConsentimiento({ otorgadoEn: null, revocadoEn: null })).toBe('sin_firmar');
  });
});

describe('estadoDocumental', () => {
  it('una alerta abierta manda: hay algo que revisar', () => {
    expect(estadoDocumental({ alertasAbiertas: 1, consentimientos: 3 })).toBe('revisar');
  });

  it('sin alertas y sin ningún consentimiento, el paciente es nuevo', () => {
    expect(estadoDocumental({ alertasAbiertas: 0, consentimientos: 0 })).toBe('nuevo');
  });

  it('sin alertas y con papeles, al día', () => {
    expect(estadoDocumental({ alertasAbiertas: 0, consentimientos: 2 })).toBe('al_dia');
  });

  it('si no se pueden leer los consentimientos no se afirma nada', () => {
    // `null` es «quien mira no puede verlos». Decirle «al día» a quien no ha podido mirar
    // sería afirmar sobre el expediente algo que nadie ha comprobado.
    expect(estadoDocumental({ alertasAbiertas: 0, consentimientos: null })).toBeNull();
  });
});

describe('representacionVigente', () => {
  it('sin fecha de fin sigue vigente', () => {
    expect(representacionVigente({ vigenteDesde: '2026-01-01', vigenteHasta: null }, AHORA)).toBe(
      true,
    );
  });

  it('una representación que aún no ha empezado no vale hoy', () => {
    expect(representacionVigente({ vigenteDesde: '2027-01-01', vigenteHasta: null }, AHORA)).toBe(
      false,
    );
  });

  it('una representación caducada no vale', () => {
    expect(
      representacionVigente({ vigenteDesde: '2020-01-01', vigenteHasta: '2026-01-01' }, AHORA),
    ).toBe(false);
  });

  it('una fecha de fin ilegible no retira la representación', () => {
    // Quitarle la patria potestad a alguien porque una fecha está mal escrita sería peor
    // error que dejarla puesta: el dato malo se arregla, la decisión no se improvisa aquí.
    expect(
      representacionVigente({ vigenteDesde: '2020-01-01', vigenteHasta: 'vaya' }, AHORA),
    ).toBe(true);
  });
});
