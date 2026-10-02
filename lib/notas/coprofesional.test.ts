import { describe, expect, it } from 'vitest';

import { ROLES_COPROFESIONAL } from './coprofesional';

describe('ROLES_COPROFESIONAL', () => {
  it('hoy solo el profesional sanitario puede figurar como coprofesional (T-034; T-035 añade administrador)', () => {
    expect([...ROLES_COPROFESIONAL]).toEqual(['profesional_sanitario']);
  });
});
