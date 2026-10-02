import { describe, expect, it } from 'vitest';

import { RUTA_NOTAS_DISPONIBLE, rutaNotas } from './notas';

describe('rutaNotas', () => {
  it('lleva al editor de notas del paciente con la cita en la consulta, solo con uuids', () => {
    expect(rutaNotas('p-uuid', 'c-uuid')).toBe('/pacientes/p-uuid/historia/notas?cita=c-uuid');
  });

  it('está encendida: T-012 creó la ruta (D8)', () => {
    expect(RUTA_NOTAS_DISPONIBLE).toBe(true);
  });
});
