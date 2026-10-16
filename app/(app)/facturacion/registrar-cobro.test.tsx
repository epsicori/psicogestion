import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { t, tCon } from '@/lib/i18n';

// El formulario se sustituye: aquí se prueba el diálogo, el foco y el aviso, no los campos.
const formulario = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('./formulario-cobro', () => ({
  FormularioCobro: (props: {
    alRegistrar: (huella: string, aviso: string) => void;
    alCambiarEnvio: (enviando: boolean) => void;
  }) => {
    formulario.props.push(props);
    const { alRegistrar, alCambiarEnvio } = props;
    return (
      <>
        <button type="button" onClick={() => alRegistrar('huella-de-pega', t('cobros.cobroRegistrado'))}>
          enviar-de-pega
        </button>
        <button type="button" onClick={() => alCambiarEnvio(true)}>
          empieza-de-pega
        </button>
        <button type="button" onClick={() => alCambiarEnvio(false)}>
          acaba-de-pega
        </button>
      </>
    );
  },
}));

const { RegistrarCobro } = await import('./registrar-cobro');

describe('RegistrarCobro', () => {
  it('B-H8: la región de estado existe, vacía, desde el montaje y sin empty:hidden', () => {
    render(<RegistrarCobro pacientes={[]} hoy="2026-10-06" />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(region.className).not.toContain('empty:hidden');
  });

  it('con pacientes null: el aviso de pacientes, ningún disparador, ningún diálogo y la región de estado montada', () => {
    render(<RegistrarCobro pacientes={null} hoy="2026-10-06" />);
    expect(screen.getByText(t('cobros.errorPacientes'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('cobros.registrarCobro') })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

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

  it('B-H11: con un envío en vuelo Escape no cierra el diálogo; al acabar sí', async () => {
    render(<RegistrarCobro pacientes={[]} hoy="2026-10-06" />);
    fireEvent.click(screen.getByRole('button', { name: t('cobros.registrarCobro') }));
    fireEvent.click(screen.getByRole('button', { name: 'empieza-de-pega' }));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'acaba-de-pega' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el aviso «Cobro registrado» es visible, no solo para lectores de pantalla', async () => {
    render(<RegistrarCobro pacientes={[]} hoy="2026-10-06" />);
    fireEvent.click(screen.getByRole('button', { name: t('cobros.registrarCobro') }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'enviar-de-pega' }));
    });
    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent(t('cobros.cobroRegistrado'));
    expect(aviso.className).not.toContain('sr-only');
  });

  describe('modo factura (T-023b)', () => {
    const FACTURA = { id: 'f0000000-0000-4000-8000-000000000001', numero: 'F-2026-0007', pacienteId: 'p1', paciente: 'Ruiz, Ana' };

    it('el disparador nombra la factura y el diálogo también; el formulario recibe la factura', () => {
      formulario.props.length = 0;
      render(<RegistrarCobro pacientes={[]} hoy="2026-10-06" factura={FACTURA} />);
      const boton = screen.getByRole('button', { name: tCon('cobros.facturas.registrarDeFactura', { numero: FACTURA.numero }) });
      fireEvent.click(boton);
      expect(
        screen.getByRole('dialog', { name: tCon('cobros.facturas.tituloRegistrar', { numero: FACTURA.numero }) }),
      ).toBeInTheDocument();
      expect(formulario.props.at(-1)?.factura).toEqual(FACTURA);
    });

    it('en modo factura no hace falta la lista de pacientes: con null sigue habiendo disparador', () => {
      render(<RegistrarCobro pacientes={null} hoy="2026-10-06" factura={FACTURA} />);
      expect(
        screen.getByRole('button', { name: tCon('cobros.facturas.registrarDeFactura', { numero: FACTURA.numero }) }),
      ).toBeInTheDocument();
    });
  });
});
