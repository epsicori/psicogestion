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

  it('formatea la fecha prevista en servidor, no la baja en ISO (hallazgo 6 de la revisión)', () => {
    const resumen = resumirPropuesta(base);
    expect(resumen.fechaPrevistaCorta).toBe('01/05/2026');
    expect(resumen.fechaPrevistaCorta).not.toBe(base.fechaPrevista);
  });

  it('el día de calendario no se mueve ni en el cambio de horario ni en otra zona', () => {
    // 29-03-2026 es el domingo del salto en Europa: a las 02:00 no existen las
    // 02:30. El anclaje al mediodía tiene que devolver el mismo día igualmente.
    expect(resumirPropuesta({ ...base, fechaPrevista: '2026-03-29' }).fechaPrevistaCorta).toBe(
      '29/03/2026',
    );
    expect(
      resumirPropuesta({
        ...base,
        fechaPrevista: '2026-03-29',
        zonaHoraria: 'Atlantic/Canary',
      }).fechaPrevistaCorta,
    ).toBe('29/03/2026');
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
