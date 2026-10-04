import { describe, expect, it } from 'vitest';

import type { BloqueAlta, PrevisualizacionAlta } from '@/lib/citas/alta';
import type { ResultadoSugerencias } from '@/lib/agenda/sugerencias';

import { construirCalendarioAlta, construirTarjetas, lunesDe, presentarSerie } from './vista-alta';

const ZONA = 'Europe/Madrid';

// Octubre de 2026: el lunes 5 es CEST (UTC+2).
function bloque(fecha: string, horaLocal: string, estado: BloqueAlta['estado'], minutos = 50): BloqueAlta {
  const [h, m] = horaLocal.split(':').map(Number);
  const inicio = new Date(`${fecha}T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const fin = new Date(inicio.getTime() + minutos * 60_000);
  return { fecha, horaLocal, inicio: inicio.toISOString(), fin: fin.toISOString(), estado };
}

const SIN_SUGERENCIAS: ResultadoSugerencias = { modo: 'enFrio', sugerencias: [] };

describe('lunesDe', () => {
  it('cualquier día de la semana devuelve el lunes (el domingo, el de seis días antes)', () => {
    expect(lunesDe('2026-10-07')).toBe('2026-10-05');
    expect(lunesDe('2026-10-05')).toBe('2026-10-05');
    expect(lunesDe('2026-10-11')).toBe('2026-10-05');
  });
});

describe('construirCalendarioAlta', () => {
  const base = { fechaFoco: '2026-10-07', zona: ZONA, hoy: '2026-10-04', sugerencias: SIN_SUGERENCIAS };

  it('siete días desde el lunes, con la semana anterior y la siguiente', () => {
    const c = construirCalendarioAlta({ ...base, bloques: [] });

    expect(c.dias.map((d) => d.fecha)).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ]);
    expect(c.desde).toBe('2026-10-05');
    expect(c.anterior).toBe('2026-09-28');
    expect(c.siguiente).toBe('2026-10-12');
  });

  it('un hueco lleva su posición, su duración y una etiqueta que no es solo color', () => {
    const c = construirCalendarioAlta({
      ...base,
      bloques: [bloque('2026-10-06', '17:00', 'libre'), bloque('2026-10-06', '18:00', 'ocupado')],
    });

    const [libre, ocupado] = c.huecos;
    expect(libre).toMatchObject({
      clave: '2026-10-06T17:00',
      diaIndice: 1,
      minutoPared: 17 * 60,
      duracionMinutos: 50,
      estado: 'libre',
      sugerida: null,
      habitual: false,
      rango: '17:00 – 17:50',
    });
    expect(libre.etiqueta).toBe('martes, 6 de octubre de 2026, 17:00, libre');
    expect(ocupado).toMatchObject({ estado: 'ocupado', diaIndice: 1 });
    expect(ocupado.etiqueta).toBe('martes, 6 de octubre de 2026, 18:00, Ocupado');
  });

  it('un bloque fuera de la semana visible no se pinta', () => {
    const c = construirCalendarioAlta({ ...base, bloques: [bloque('2026-10-12', '10:00', 'libre')] });

    expect(c.huecos).toEqual([]);
  });

  it('marca las sugeridas con su número y el día y hora habituales, con palabras en la etiqueta', () => {
    const sugerencias: ResultadoSugerencias = {
      modo: 'habitual',
      sugerencias: [
        { fecha: '2026-10-06', horaLocal: '17:00', motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '17:00' } },
        { fecha: '2026-10-08', horaLocal: '10:00', motivo: { tipo: 'cadaIntervalo', dias: 7 } },
      ],
    };
    const c = construirCalendarioAlta({
      ...base,
      sugerencias,
      bloques: [
        bloque('2026-10-06', '17:00', 'libre'),
        bloque('2026-10-08', '10:00', 'libre'),
        bloque('2026-10-13', '17:00', 'libre'),
        bloque('2026-10-09', '12:00', 'libre'),
      ],
    });

    const por = (clave: string) => c.huecos.find((h) => h.clave === clave);
    expect(por('2026-10-06T17:00')).toMatchObject({ sugerida: 1, habitual: true });
    expect(por('2026-10-06T17:00')?.etiqueta).toBe('martes, 6 de octubre de 2026, 17:00, libre, sugerida, habitual');
    expect(por('2026-10-08T10:00')).toMatchObject({ sugerida: 2, habitual: false });
    expect(por('2026-10-09T12:00')).toMatchObject({ sugerida: null, habitual: false });
  });

  it('el eje se ensancha para que quepa un hueco temprano o tardío', () => {
    const normal = construirCalendarioAlta({ ...base, bloques: [bloque('2026-10-06', '10:00', 'libre')] });
    expect(normal.eje).toMatchObject({ desdeMinuto: 7 * 60, hastaMinuto: 21 * 60 });

    const ancho = construirCalendarioAlta({
      ...base,
      bloques: [bloque('2026-10-06', '06:00', 'libre'), bloque('2026-10-06', '21:00', 'libre')],
    });
    expect(ancho.eje.desdeMinuto).toBe(6 * 60);
    expect(ancho.eje.hastaMinuto).toBe(22 * 60);
    expect(ancho.eje.horas[0]).toBe('06:00');
  });
});

describe('presentarSerie', () => {
  const sesion = (extra: Partial<PrevisualizacionAlta['sesiones'][number]> = {}): PrevisualizacionAlta['sesiones'][number] => ({
    fecha: '2026-10-06',
    horaLocal: '10:00',
    inicio: '2026-10-06T08:00:00.000Z',
    fin: '2026-10-06T08:50:00.000Z',
    clasificacion: 'normal',
    bloqueo: null,
    alternativa: null,
    ...extra,
  });

  it('una sesión normal lleva fecha larga y hora, sin alternativa', () => {
    expect(presentarSerie({ zonaHoraria: ZONA, sesiones: [sesion()] }, ZONA)).toEqual([
      { fecha: '2026-10-06', fechaLarga: 'Martes, 6 de octubre de 2026', hora: '10:00', estado: 'normal', alternativa: null, horaResultante: null },
    ]);
  });

  it('un bloqueo no lleva hora y su alternativa se escribe con día y hora; sin alternativa, null', () => {
    const [con, sin] = presentarSerie(
      {
        zonaHoraria: ZONA,
        sesiones: [
          sesion({
            bloqueo: 'festivo',
            alternativa: { fecha: '2026-10-08', inicio: '2026-10-08T10:00:00.000Z', fin: '2026-10-08T10:50:00.000Z' },
          }),
          sesion({ fecha: '2026-10-13', bloqueo: 'ocupada' }),
        ],
      },
      ZONA,
    );

    expect(con).toMatchObject({ estado: 'festivo', hora: null, alternativa: 'jueves, 8 de octubre de 2026, 12:00' });
    expect(sin).toMatchObject({ estado: 'ocupada', hora: null, alternativa: null });
  });

  it('una hora inexistente o ambigua es un cambio de hora y dice la hora en que queda', () => {
    const [s] = presentarSerie(
      {
        zonaHoraria: ZONA,
        sesiones: [sesion({ fecha: '2026-03-29', horaLocal: '02:30', clasificacion: 'inexistente', inicio: '2026-03-29T01:00:00.000Z', fin: '2026-03-29T01:50:00.000Z' })],
      },
      ZONA,
    );

    expect(s).toMatchObject({ estado: 'cambioDeHora', hora: '02:30', horaResultante: '03:00' });
  });
});

describe('construirTarjetas', () => {
  it('tres tarjetas con fecha larga, hora y motivo escrito; en frío, ningún motivo dice «habitual»', () => {
    const t = construirTarjetas(
      {
        modo: 'enFrio',
        sugerencias: [
          { fecha: '2026-10-06', horaLocal: '17:00', motivo: { tipo: 'primerHueco' } },
          { fecha: '2026-10-07', horaLocal: '10:00', motivo: { tipo: 'primerHueco' } },
        ],
      },
      ZONA,
    );

    expect(t.modo).toBe('enFrio');
    expect(t.tarjetas[0]).toEqual({
      clave: '2026-10-06T17:00',
      fecha: 'Martes, 6 de octubre de 2026',
      hora: '17:00',
      motivo: 'Primer hueco libre',
    });
    expect(t.tarjetas.map((x) => x.motivo).join(' ')).not.toMatch(/habitual/i);
  });
});
