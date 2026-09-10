import { describe, expect, it } from 'vitest';

import { resumirCita, resumirPropuesta, type CitaParaResumen } from './presentacion';
import type { PropuestaPendiente } from './propuestas';

describe('resumirCita', () => {
  const base: CitaParaResumen = {
    id: 'a1',
    inicio: new Date('2026-03-29T10:00:00Z'),
    fin: new Date('2026-03-29T10:50:00Z'),
    zonaHoraria: 'Europe/Madrid',
    estado: 'programada',
    desviada: false,
    motivoDesviacion: null,
  };

  it('formatea fecha y rango en la zona de la cita, no en la del sistema', () => {
    const resumen = resumirCita(base);
    expect(resumen.fechaCorta).toBe('29/03/2026');
    expect(resumen.rangoHorario).toBe('12:00 – 12:50');
  });

  it('nunca expone el instante crudo: solo cadenas ya formateadas', () => {
    const resumen = resumirCita(base) as unknown as Record<string, unknown>;
    expect(resumen.inicio).toBeUndefined();
    expect(resumen.fin).toBeUndefined();
    expect(typeof resumen.rangoHorario).toBe('string');
  });

  it('conserva desviada y motivoDesviacion tal cual', () => {
    const resumen = resumirCita({
      ...base,
      desviada: true,
      motivoDesviacion: 'anomalia_horaria',
    });
    expect(resumen.desviada).toBe(true);
    expect(resumen.motivoDesviacion).toBe('anomalia_horaria');
  });
});

describe('resumirPropuesta', () => {
  const base: PropuestaPendiente = {
    id: 'p1',
    serieId: 's1',
    citaId: null,
    pacienteId: 'pac1',
    profesionalId: 'pro1',
    centroId: 'c1',
    motivo: 'festivo',
    fechaPrevista: '2026-05-01',
    horaLocalPrevista: '09:00:00',
    inicioPropuesto: '2026-05-02T07:00:00Z',
    finPropuesto: '2026-05-02T07:50:00Z',
    zonaHoraria: 'Europe/Madrid',
  };

  it('formatea el rango cuando hay desplazamiento', () => {
    const resumen = resumirPropuesta(base);
    expect(resumen.rangoPropuesto).toBe('09:00 – 09:50');
    expect(resumen.horaLocalPrevista).toBe('09:00');
  });

  it('rangoPropuesto es null cuando la propuesta no trae horario (§7 del diseño)', () => {
    const resumen = resumirPropuesta({
      ...base,
      inicioPropuesto: null,
      finPropuesto: null,
    });
    expect(resumen.rangoPropuesto).toBeNull();
  });
});
