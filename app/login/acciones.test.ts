import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

/**
 * T-033 · la acción de inicio de sesión y el modo local del segundo factor.
 *
 * Lo que se prueba es el ORDEN: el modo se evalúa antes de crear ninguna sesión (mal
 * configurado, lanza sin dejar una sesión `aal1` a medias), y el pase se intenta solo
 * después de unas credenciales buenas.
 */

const signInWithPassword = vi.fn();
const segundoFactorAutomaticoActivo = vi.fn();
const superarSegundoFactorSembrado = vi.fn();

class Redireccion extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Redireccion(destino);
  },
}));

vi.mock('@/lib/supabase/servidor', () => ({
  crearClienteServidor: async () => ({ auth: { signInWithPassword } }),
}));

vi.mock('@/lib/cuentas/modo-desarrollo', () => ({
  segundoFactorAutomaticoActivo: () => segundoFactorAutomaticoActivo(),
  superarSegundoFactorSembrado: (cliente: unknown) => superarSegundoFactorSembrado(cliente),
}));

const { iniciarSesion } = await import('./acciones');

const CREDENCIALES = { correo: 'ana@psicogestion.test', contrasena: 'psico1234' };

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword.mockResolvedValue({ error: null });
  superarSegundoFactorSembrado.mockResolvedValue('superado');
});

describe('iniciarSesion · modo local del segundo factor', () => {
  it('con el modo apagado no intenta el pase y redirige a /pacientes', async () => {
    segundoFactorAutomaticoActivo.mockReturnValue(false);

    await expect(iniciarSesion(CREDENCIALES)).rejects.toMatchObject({ destino: '/pacientes' });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(superarSegundoFactorSembrado).not.toHaveBeenCalled();
  });

  it('con el modo encendido intenta el pase DESPUÉS de iniciar sesión y redirige a /pacientes', async () => {
    segundoFactorAutomaticoActivo.mockReturnValue(true);

    await expect(iniciarSesion(CREDENCIALES)).rejects.toMatchObject({ destino: '/pacientes' });
    expect(superarSegundoFactorSembrado).toHaveBeenCalledTimes(1);
    expect(signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      superarSegundoFactorSembrado.mock.invocationCallOrder[0],
    );
  });

  it.each(['fallo', 'sin_factor_sembrado'])(
    'con el pase en «%s» redirige igual a /pacientes (la guardia manda a /primera-vez) y usa el cliente que inició sesión',
    async (resultado) => {
      segundoFactorAutomaticoActivo.mockReturnValue(true);
      superarSegundoFactorSembrado.mockResolvedValue(resultado);

      await expect(iniciarSesion(CREDENCIALES)).rejects.toMatchObject({ destino: '/pacientes' });
      const [cliente] = superarSegundoFactorSembrado.mock.calls[0];
      expect(cliente).toMatchObject({ auth: { signInWithPassword } });
    },
  );

  it('con el modo encendido y credenciales malas no intenta el pase', async () => {
    segundoFactorAutomaticoActivo.mockReturnValue(true);
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });

    const estado = await iniciarSesion(CREDENCIALES);
    expect(estado.mensaje).toBe(t('acceso.credencialesNoValidas'));
    expect(superarSegundoFactorSembrado).not.toHaveBeenCalled();
  });

  it('si el modo está mal configurado lanza ANTES de crear ninguna sesión', async () => {
    const fallo = new Error('Supabase no es local');
    segundoFactorAutomaticoActivo.mockImplementation(() => {
      throw fallo;
    });

    await expect(iniciarSesion(CREDENCIALES)).rejects.toBe(fallo);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
