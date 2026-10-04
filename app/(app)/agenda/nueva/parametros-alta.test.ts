import { describe, expect, it } from 'vitest';

import { leerParametrosAlta } from './parametros-alta';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('leerParametrosAlta', () => {
  it('sin nada, todo ausente', () => {
    expect(leerParametrosAlta({})).toEqual({ paciente: null, inicio: null, centro: null });
  });

  it('lee un paciente y un centro uuid, y un inicio local AAAA-MM-DDTHH:MM', () => {
    expect(leerParametrosAlta({ paciente: UUID, centro: UUID, inicio: '2026-10-06T17:00' })).toEqual({
      paciente: UUID,
      centro: UUID,
      inicio: { fecha: '2026-10-06', hora: '17:00' },
    });
  });

  it('lo que no vale se ignora, sin lanzar', () => {
    expect(
      leerParametrosAlta({ paciente: 'Ana Pérez', centro: 'todos', inicio: '2026-02-30T17:00' }),
    ).toEqual({ paciente: null, centro: null, inicio: null });
    expect(leerParametrosAlta({ inicio: '2026-10-06T25:00' }).inicio).toBeNull();
    expect(leerParametrosAlta({ inicio: '2026-10-06' }).inicio).toBeNull();
  });

  it('un parámetro repetido no se elige por el usuario: se ignora', () => {
    expect(leerParametrosAlta({ paciente: [UUID, UUID], inicio: ['2026-10-06T17:00', '2026-10-07T17:00'] })).toEqual({
      paciente: null,
      inicio: null,
      centro: null,
    });
  });
});
