import { describe, expect, it } from 'vitest';

import { ROLES_COPROFESIONAL } from './coprofesional';

describe('ROLES_COPROFESIONAL', () => {
  it('admite al profesional sanitario y al administrador (director sanitario; ADR-073.2)', () => {
    expect([...ROLES_COPROFESIONAL]).toEqual(['profesional_sanitario', 'administrador']);
  });

  it('deja fuera al técnico administrativo (lista cerrada)', () => {
    expect(ROLES_COPROFESIONAL).not.toContain('tecnico_administrativo');
  });
});
