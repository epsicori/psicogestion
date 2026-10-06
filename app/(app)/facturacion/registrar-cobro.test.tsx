import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

// El formulario se sustituye: aquí se prueba el diálogo, el foco y el aviso, no los campos.
vi.mock('./formulario-cobro', () => ({
  FormularioCobro: ({ alRegistrar }: { alRegistrar: () => void }) => (
    <button type="button" onClick={alRegistrar}>
      enviar-de-pega
    </button>
  ),
}));

const { RegistrarCobro } = await import('./registrar-cobro');

describe('RegistrarCobro', () => {
  it('abre el diálogo; al registrar se cierra, el foco vuelve al botón y se anuncia', async () => {
    render(<RegistrarCobro pacientes={[]} hoy="2026-10-06" />);
    const boton = screen.getByRole('button', { name: t('cobros.registrarCobro') });
    expect(boton.className).toMatch(/min-h-11/);

    boton.focus();
    fireEvent.click(boton);
    expect(screen.getByRole('dialog', { name: t('cobros.registrarCobro') })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'enviar-de-pega' }));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(boton);
    expect(screen.getByRole('status')).toHaveTextContent(t('cobros.cobroRegistrado'));
  });

  it('cerrar sin registrar no anuncia nada', () => {
    render(<RegistrarCobro pacientes={[]} hoy="2026-10-06" />);
    fireEvent.click(screen.getByRole('button', { name: t('cobros.registrarCobro') }));
    fireEvent.click(screen.getByRole('button', { name: t('interfaz.cerrar') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
