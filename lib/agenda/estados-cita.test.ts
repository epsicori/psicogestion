import { describe, expect, it } from 'vitest';

import {
  CLAVES_ESTADO_CITA,
  ESTADOS_CITA,
  claveDeEstado,
  estaEnCurso,
  estadoVisible,
  puedeTransitar,
  transicionesDesde,
} from './estados-cita';

// Reloj fijo: cita de 10:00 a 10:50 UTC del 15-04-2026. `ahora` siempre es
// parámetro; ninguna prueba lee el reloj del sistema.
const inicio = new Date('2026-04-15T08:00:00Z');
const fin = new Date('2026-04-15T08:50:00Z');

describe('ESTADOS_CITA', () => {
  it('declara los cinco valores en el orden del contrato con T-010', () => {
    expect(ESTADOS_CITA).toEqual([
      'programada',
      'confirmada',
      'realizada',
      'cancelada',
      'no_asistida',
    ]);
    expect(Object.isFrozen(ESTADOS_CITA)).toBe(true);
  });
});

describe('matriz de transiciones (5 × 5, los veinticinco casos afirmados uno a uno)', () => {
  // Desde programada
  it('programada → programada: no', () => {
    expect(puedeTransitar('programada', 'programada')).toBe(false);
  });
  it('programada → confirmada: sí', () => {
    expect(puedeTransitar('programada', 'confirmada')).toBe(true);
  });
  it('programada → realizada: sí', () => {
    expect(puedeTransitar('programada', 'realizada')).toBe(true);
  });
  it('programada → cancelada: sí', () => {
    expect(puedeTransitar('programada', 'cancelada')).toBe(true);
  });
  it('programada → no_asistida: sí', () => {
    expect(puedeTransitar('programada', 'no_asistida')).toBe(true);
  });

  // Desde confirmada
  it('confirmada → programada: no', () => {
    expect(puedeTransitar('confirmada', 'programada')).toBe(false);
  });
  it('confirmada → confirmada: no', () => {
    expect(puedeTransitar('confirmada', 'confirmada')).toBe(false);
  });
  it('confirmada → realizada: sí', () => {
    expect(puedeTransitar('confirmada', 'realizada')).toBe(true);
  });
  it('confirmada → cancelada: sí', () => {
    expect(puedeTransitar('confirmada', 'cancelada')).toBe(true);
  });
  it('confirmada → no_asistida: sí', () => {
    expect(puedeTransitar('confirmada', 'no_asistida')).toBe(true);
  });

  // Desde realizada (terminal)
  it('realizada → programada: no', () => {
    expect(puedeTransitar('realizada', 'programada')).toBe(false);
  });
  it('realizada → confirmada: no', () => {
    expect(puedeTransitar('realizada', 'confirmada')).toBe(false);
  });
  it('realizada → realizada: no', () => {
    expect(puedeTransitar('realizada', 'realizada')).toBe(false);
  });
  it('realizada → cancelada: no', () => {
    expect(puedeTransitar('realizada', 'cancelada')).toBe(false);
  });
  it('realizada → no_asistida: no', () => {
    expect(puedeTransitar('realizada', 'no_asistida')).toBe(false);
  });

  // Desde cancelada (terminal)
  it('cancelada → programada: no', () => {
    expect(puedeTransitar('cancelada', 'programada')).toBe(false);
  });
  it('cancelada → confirmada: no', () => {
    expect(puedeTransitar('cancelada', 'confirmada')).toBe(false);
  });
  it('cancelada → realizada: no', () => {
    expect(puedeTransitar('cancelada', 'realizada')).toBe(false);
  });
  it('cancelada → cancelada: no', () => {
    expect(puedeTransitar('cancelada', 'cancelada')).toBe(false);
  });
  it('cancelada → no_asistida: no', () => {
    expect(puedeTransitar('cancelada', 'no_asistida')).toBe(false);
  });

  // Desde no_asistida (terminal)
  it('no_asistida → programada: no', () => {
    expect(puedeTransitar('no_asistida', 'programada')).toBe(false);
  });
  it('no_asistida → confirmada: no', () => {
    expect(puedeTransitar('no_asistida', 'confirmada')).toBe(false);
  });
  it('no_asistida → realizada: no', () => {
    expect(puedeTransitar('no_asistida', 'realizada')).toBe(false);
  });
  it('no_asistida → cancelada: no', () => {
    expect(puedeTransitar('no_asistida', 'cancelada')).toBe(false);
  });
  it('no_asistida → no_asistida: no', () => {
    expect(puedeTransitar('no_asistida', 'no_asistida')).toBe(false);
  });
});

describe('transicionesDesde', () => {
  it('programada ofrece los cuatro destinos', () => {
    expect(transicionesDesde('programada')).toEqual([
      'confirmada',
      'realizada',
      'cancelada',
      'no_asistida',
    ]);
  });

  it('confirmada no ofrece volver a programada', () => {
    expect(transicionesDesde('confirmada')).toEqual(['realizada', 'cancelada', 'no_asistida']);
  });

  it('los tres terminales no ofrecen nada', () => {
    expect(transicionesDesde('realizada')).toEqual([]);
    expect(transicionesDesde('cancelada')).toEqual([]);
    expect(transicionesDesde('no_asistida')).toEqual([]);
  });
});

describe('estaEnCurso', () => {
  it('justo en `inicio`: en curso (intervalo semiabierto)', () => {
    expect(estaEnCurso({ inicio, fin, estado: 'programada' }, inicio)).toBe(true);
  });

  it('justo en `fin`: NO en curso (intervalo semiabierto)', () => {
    expect(estaEnCurso({ inicio, fin, estado: 'confirmada' }, fin)).toBe(false);
  });

  it('un minuto antes de `inicio`: no', () => {
    const antes = new Date('2026-04-15T07:59:00Z');
    expect(estaEnCurso({ inicio, fin, estado: 'confirmada' }, antes)).toBe(false);
  });

  it('un minuto después de `fin`: no', () => {
    const despues = new Date('2026-04-15T08:51:00Z');
    expect(estaEnCurso({ inicio, fin, estado: 'programada' }, despues)).toBe(false);
  });

  it('en medio del horario: en curso', () => {
    const dentro = new Date('2026-04-15T08:25:00Z');
    expect(estaEnCurso({ inicio, fin, estado: 'realizada' }, dentro)).toBe(true);
  });

  it('una cita cancelada dentro de su propio horario NO está en curso', () => {
    const dentro = new Date('2026-04-15T08:25:00Z');
    expect(estaEnCurso({ inicio, fin, estado: 'cancelada' }, dentro)).toBe(false);
  });

  it('una cita no asistida dentro de su propio horario NO está en curso', () => {
    const dentro = new Date('2026-04-15T08:25:00Z');
    expect(estaEnCurso({ inicio, fin, estado: 'no_asistida' }, dentro)).toBe(false);
  });
});

describe('estadoVisible', () => {
  const dentro = new Date('2026-04-15T08:25:00Z');
  const despues = new Date('2026-04-15T09:00:00Z');

  it('programada dentro de su horario se pinta en_curso', () => {
    expect(estadoVisible({ inicio, fin, estado: 'programada' }, dentro)).toBe('en_curso');
  });

  it('confirmada cuyo fin ya pasó se pinta pasada_sin_marcar', () => {
    expect(estadoVisible({ inicio, fin, estado: 'confirmada' }, despues)).toBe(
      'pasada_sin_marcar',
    );
  });

  it('programada cuyo fin ya pasó se pinta pasada_sin_marcar', () => {
    expect(estadoVisible({ inicio, fin, estado: 'programada' }, despues)).toBe(
      'pasada_sin_marcar',
    );
  });

  it('justo en `fin` ya es pasada_sin_marcar, no en_curso', () => {
    expect(estadoVisible({ inicio, fin, estado: 'confirmada' }, fin)).toBe('pasada_sin_marcar');
  });

  it('una cita marcada como realizada se pinta realizada aunque el fin ya pasó', () => {
    expect(estadoVisible({ inicio, fin, estado: 'realizada' }, despues)).toBe('realizada');
  });

  it('cancelada y no_asistida se pintan con su estado guardado, pase lo que pase', () => {
    expect(estadoVisible({ inicio, fin, estado: 'cancelada' }, dentro)).toBe('cancelada');
    expect(estadoVisible({ inicio, fin, estado: 'no_asistida' }, despues)).toBe('no_asistida');
  });

  it('antes de la cita se pinta el estado guardado', () => {
    const antes = new Date('2026-04-15T07:00:00Z');
    expect(estadoVisible({ inicio, fin, estado: 'programada' }, antes)).toBe('programada');
    expect(estadoVisible({ inicio, fin, estado: 'confirmada' }, antes)).toBe('confirmada');
  });
});

describe('claves de i18n', () => {
  it('cada estado guardado expone su clave agenda.estado.*', () => {
    expect(claveDeEstado('programada')).toBe('agenda.estado.programada');
    expect(claveDeEstado('confirmada')).toBe('agenda.estado.confirmada');
    expect(claveDeEstado('realizada')).toBe('agenda.estado.realizada');
    expect(claveDeEstado('cancelada')).toBe('agenda.estado.cancelada');
    expect(claveDeEstado('no_asistida')).toBe('agenda.estado.no_asistida');
  });

  it('los estados calculados también tienen clave', () => {
    expect(CLAVES_ESTADO_CITA.en_curso).toBe('agenda.estado.en_curso');
    expect(CLAVES_ESTADO_CITA.pasada_sin_marcar).toBe('agenda.estado.pasada_sin_marcar');
  });
});
