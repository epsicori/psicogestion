import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

const { prepararBorradorEnProveedor } = vi.hoisted(() => ({ prepararBorradorEnProveedor: vi.fn() }));
vi.mock('./acciones-facturacion', () => ({ prepararBorradorEnProveedor }));

import { BotonPreparar } from './boton-preparar';

const ID = '11111111-1111-4111-8111-111111111111';
const NOMBRE = 'Preparar borrador en Programa X';

describe('BotonPreparar', () => {
  beforeEach(() => {
    prepararBorradorEnProveedor.mockReset();
  });

  it('llama a la acción con el id y no muestra aviso si sale bien', async () => {
    prepararBorradorEnProveedor.mockResolvedValue({ ok: true });
    render(<BotonPreparar borradorId={ID} programa="Programa X" />);
    await userEvent.click(screen.getByRole('button', { name: NOMBRE }));
    await waitFor(() => expect(prepararBorradorEnProveedor).toHaveBeenCalledWith(ID));
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('la región de aviso está montada desde el principio', () => {
    render(<BotonPreparar borradorId={ID} programa="Programa X" />);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it.each(['sin_permiso', 'sin_programa', 'no_preparable', 'fallo'] as const)(
    'muestra el texto fijo del error %s',
    async (codigo) => {
      prepararBorradorEnProveedor.mockResolvedValue({ error: codigo });
      render(<BotonPreparar borradorId={ID} programa="Programa X" />);
      await userEvent.click(screen.getByRole('button', { name: NOMBRE }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(t(`facturacion.panel.errores.${codigo}`)),
      );
    },
  );

  it('no encola dos veces mientras la primera petición sigue en curso', async () => {
    let resolver: (v: { ok: true }) => void = () => {};
    prepararBorradorEnProveedor.mockReturnValue(
      new Promise((r) => {
        resolver = r;
      }),
    );
    render(<BotonPreparar borradorId={ID} programa="Programa X" />);
    const boton = screen.getByRole('button', { name: NOMBRE });
    await userEvent.click(boton);
    await waitFor(() => expect(boton).toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(boton);
    expect(prepararBorradorEnProveedor).toHaveBeenCalledTimes(1);
    resolver({ ok: true });
    await waitFor(() => expect(boton).not.toHaveAttribute('aria-disabled'));
  });

  it('borra el aviso anterior al reintentar', async () => {
    prepararBorradorEnProveedor.mockResolvedValueOnce({ error: 'fallo' }).mockResolvedValueOnce({ ok: true });
    render(<BotonPreparar borradorId={ID} programa="Programa X" />);
    await userEvent.click(screen.getByRole('button', { name: NOMBRE }));
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement());
    await userEvent.click(screen.getByRole('button', { name: NOMBRE }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeEmptyDOMElement());
  });
});
