import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();
vi.mock('node:child_process', () => {
  const modulo = { execFileSync: (...a: unknown[]) => execFileSync(...a) };
  return { ...modulo, default: modulo };
});

const { contenedorDelProyecto } = await import('./contenedor-proyecto');

describe('contenedorDelProyecto (T-037, A-H2)', () => {
  beforeEach(() => execFileSync.mockReset());

  it('toma el contenedor de este proyecto aunque otro aparezca antes en docker ps', () => {
    execFileSync.mockReturnValue('supabase_db_cinfa-e2e\nsupabase_db_Psicogestion\n');
    expect(contenedorDelProyecto()).toBe('supabase_db_Psicogestion');
  });

  it('falla con un mensaje claro si el de este proyecto no está, sin tomar otro', () => {
    execFileSync.mockReturnValue('supabase_db_cinfa-e2e\n');
    expect(() => contenedorDelProyecto()).toThrow(/supabase_db_Psicogestion.*supabase start/s);
  });
});
