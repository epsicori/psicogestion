import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

// T-033, criterio 7. `AvisoModoLocal` es un Server Component asíncrono: se ejecuta como
// función y se pinta lo que devuelve. Se finge `connection()` para comprobar que el modo
// se lee DESPUÉS de esperar a la petición (si se leyera antes, con Cache Components se
// decidiría en `next build`).

const orden: string[] = [];
const segundoFactorAutomaticoActivo = vi.fn();

vi.mock('next/server', () => ({
  connection: async () => {
    orden.push('connection');
  },
}));

vi.mock('@/lib/cuentas/modo-desarrollo', () => ({
  segundoFactorAutomaticoActivo: () => {
    orden.push('modo');
    return segundoFactorAutomaticoActivo();
  },
}));

const { AvisoModoLocal } = await import('./aviso-modo-local');

beforeEach(() => {
  orden.length = 0;
  segundoFactorAutomaticoActivo.mockReset();
});

describe('AvisoModoLocal', () => {
  it('con el modo apagado no pinta nada', async () => {
    segundoFactorAutomaticoActivo.mockReturnValue(false);
    expect(await AvisoModoLocal()).toBeNull();
  });

  it('con el modo encendido pinta el aviso del catálogo, y lee el modo tras connection()', async () => {
    segundoFactorAutomaticoActivo.mockReturnValue(true);
    render(await AvisoModoLocal());

    expect(screen.getByText(t('modoLocal.aviso'))).toBeInTheDocument();
    expect(orden).toEqual(['connection', 'modo']);
  });

  it('con el modo mal configurado la promesa rechaza con el error del modo', async () => {
    const fallo = new Error('Supabase no es local');
    segundoFactorAutomaticoActivo.mockImplementation(() => {
      throw fallo;
    });
    await expect(AvisoModoLocal()).rejects.toBe(fallo);
  });
});
