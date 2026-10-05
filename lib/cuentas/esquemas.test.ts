import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  MAX_CENTROS_DE_ALTA,
  esquemaAltaCentro,
  esquemaInvitacion,
  esquemaRegenerarCodigos,
} from './esquemas';

describe('esquemaRegenerarCodigos', () => {
  it('acepta una contraseña y un código de seis dígitos', () => {
    const r = esquemaRegenerarCodigos.safeParse({ contrasena: 'clave', codigo: '123456' });
    expect(r.success).toBe(true);
  });

  it('no recorta la contraseña: los espacios del borde forman parte de ella', () => {
    const r = esquemaRegenerarCodigos.safeParse({ contrasena: '  clave  ', codigo: '123456' });
    expect(r.success && r.data.contrasena).toBe('  clave  ');
  });

  it('rechaza una contraseña vacía y una de más de 256 caracteres', () => {
    expect(esquemaRegenerarCodigos.safeParse({ contrasena: '', codigo: '123456' }).success).toBe(false);
    expect(
      esquemaRegenerarCodigos.safeParse({ contrasena: 'a'.repeat(257), codigo: '123456' }).success,
    ).toBe(false);
    expect(
      esquemaRegenerarCodigos.safeParse({ contrasena: 'a'.repeat(256), codigo: '123456' }).success,
    ).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', '12 456', ' 123456'])('rechaza el código %j', (codigo) => {
    expect(esquemaRegenerarCodigos.safeParse({ contrasena: 'clave', codigo }).success).toBe(false);
  });

  it('un error de validación no lleva el valor de la contraseña', () => {
    const r = esquemaRegenerarCodigos.safeParse({ contrasena: 'secreto-que-no-sale', codigo: 'x' });
    expect(JSON.stringify(r)).not.toContain('secreto-que-no-sale');
  });
});

// T-041 · La invitación con varios centros y su centro principal (diseño P3).
describe('esquemaInvitacion (T-041)', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const C = '33333333-3333-4333-8333-333333333333';
  const base = { correo: 'ana@ejemplo.es', nombreCompleto: 'Ana Pérez' };

  function erroresDe(datos: unknown) {
    const r = esquemaInvitacion.safeParse(datos);
    return r.success ? null : z.flattenError(r.error).fieldErrors;
  }

  it('refine 1: el técnico exige exactamente un centro', () => {
    expect(
      erroresDe({ ...base, rol: 'tecnico_administrativo', centrosIds: [], centroPrincipalId: null })
        ?.centrosIds,
    ).toEqual(['El técnico administrativo exige un centro.']);
    expect(
      erroresDe({ ...base, rol: 'tecnico_administrativo', centrosIds: [A, B], centroPrincipalId: A })
        ?.centrosIds,
    ).toEqual(['El técnico administrativo exige un centro.']);
  });

  it('refine 1 (gemela): el técnico con un centro, que es el principal, pasa', () => {
    expect(
      erroresDe({ ...base, rol: 'tecnico_administrativo', centrosIds: [A], centroPrincipalId: A }),
    ).toBeNull();
  });

  it('refine 2: no admite centros repetidos', () => {
    expect(
      erroresDe({ ...base, rol: 'profesional_sanitario', centrosIds: [A, A], centroPrincipalId: A })
        ?.centrosIds,
    ).toEqual(['Hay centros repetidos.']);
  });

  it('refine 2 (gemela): dos centros distintos con principal pasan', () => {
    expect(
      erroresDe({ ...base, rol: 'profesional_sanitario', centrosIds: [A, B], centroPrincipalId: B }),
    ).toBeNull();
  });

  it('refine 3: con centros, el principal es obligatorio y tiene que estar entre ellos', () => {
    expect(
      erroresDe({ ...base, rol: 'profesional_sanitario', centrosIds: [A, B], centroPrincipalId: null })
        ?.centroPrincipalId,
    ).toEqual(['Elige cuál es su centro principal']);
    expect(
      erroresDe({ ...base, rol: 'administrador', centrosIds: [A, B], centroPrincipalId: C })
        ?.centroPrincipalId,
    ).toEqual(['Elige cuál es su centro principal']);
  });

  it('refine 3: sin centros, no hay principal', () => {
    expect(
      erroresDe({ ...base, rol: 'profesional_sanitario', centrosIds: [], centroPrincipalId: A })
        ?.centroPrincipalId,
    ).toEqual(['Elige cuál es su centro principal']);
  });

  it('refine 3 (gemela): sin centros y sin principal pasa (profesional o administrador)', () => {
    expect(
      erroresDe({ ...base, rol: 'profesional_sanitario', centrosIds: [], centroPrincipalId: null }),
    ).toBeNull();
    expect(
      erroresDe({ ...base, rol: 'administrador', centrosIds: [], centroPrincipalId: null }),
    ).toBeNull();
  });

  it(`no admite más de ${MAX_CENTROS_DE_ALTA} centros`, () => {
    const muchos = Array.from(
      { length: MAX_CENTROS_DE_ALTA + 1 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(
      esquemaInvitacion.safeParse({
        ...base,
        rol: 'profesional_sanitario',
        centrosIds: muchos,
        centroPrincipalId: muchos[0],
      }).success,
    ).toBe(false);
    expect(
      esquemaInvitacion.safeParse({
        ...base,
        rol: 'profesional_sanitario',
        centrosIds: muchos.slice(0, MAX_CENTROS_DE_ALTA),
        centroPrincipalId: muchos[0],
      }).success,
    ).toBe(true);
  });
});

describe('esquemaAltaCentro (T-041)', () => {
  it('acepta perfil y centro UUID', () => {
    expect(
      esquemaAltaCentro.safeParse({
        perfilId: '11111111-1111-4111-8111-111111111111',
        centroId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(true);
  });

  it('rechaza un perfilId que no es UUID', () => {
    expect(
      esquemaAltaCentro.safeParse({
        perfilId: 'no-es-un-uuid',
        centroId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(false);
  });
});
