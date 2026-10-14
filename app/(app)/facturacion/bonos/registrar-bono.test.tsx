import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';

// El formulario se sustituye: aquí se prueba el diálogo, el foco, el aviso y las claves.
const claves: string[] = [];
vi.mock('./formulario-bono', () => ({
  FormularioBono: ({
    alRegistrar,
    alCambiarEnvio,
    claveDeEnvio,
    pacienteFijo,
  }: {
    alRegistrar: (huella: string, aviso: string) => void;
    alCambiarEnvio: (enviando: boolean) => void;
    claveDeEnvio: (huella: string) => string;
    pacienteFijo?: { id: string; nombre: string };
  }) => (
    <>
      <span>{pacienteFijo ? `fijo:${pacienteFijo.nombre}` : 'lista'}</span>
      <button type="button" onClick={() => claves.push(claveDeEnvio('h'))}>
        pedir-clave
      </button>
      <button type="button" onClick={() => alRegistrar('h', t('bonos.bonoRegistrado'))}>
        enviar-de-pega
      </button>
      <button type="button" onClick={() => alCambiarEnvio(true)}>
        empieza-de-pega
      </button>
      <button type="button" onClick={() => alCambiarEnvio(false)}>
        acaba-de-pega
      </button>
    </>
  ),
}));

const { RegistrarBono } = await import('./registrar-bono');

describe('RegistrarBono', () => {
  it('la región de estado existe, vacía, desde el montaje', () => {
    render(<RegistrarBono pacientes={[]} hoy="2026-10-14" />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('con pacientes null: el aviso, ningún disparador ni diálogo, y la región montada', () => {
    render(<RegistrarBono pacientes={null} hoy="2026-10-14" />);
    expect(screen.getByText(t('bonos.errorPacientes'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('bonos.registrarBono') })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('abre el diálogo; al registrar se cierra, el foco vuelve al botón y se anuncia', async () => {
    render(<RegistrarBono pacientes={[]} hoy="2026-10-14" />);
    const boton = screen.getByRole('button', { name: t('bonos.registrarBono') });
    expect(boton.className).toMatch(/min-h-11/);
    boton.focus();
    fireEvent.click(boton);
    expect(screen.getByRole('dialog', { name: t('bonos.registrarBono') })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'enviar-de-pega' }));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(boton);
    expect(screen.getByRole('status')).toHaveTextContent(t('bonos.bonoRegistrado'));
  });

  it('cerrar sin registrar no anuncia nada', () => {
    render(<RegistrarBono pacientes={[]} hoy="2026-10-14" />);
    fireEvent.click(screen.getByRole('button', { name: t('bonos.registrarBono') }));
    fireEvent.click(screen.getByRole('button', { name: t('interfaz.cerrar') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('con un envío en vuelo Escape no cierra el diálogo; al acabar sí', () => {
    render(<RegistrarBono pacientes={[]} hoy="2026-10-14" />);
    fireEvent.click(screen.getByRole('button', { name: t('bonos.registrarBono') }));
    fireEvent.click(screen.getByRole('button', { name: 'empieza-de-pega' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'acaba-de-pega' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('la clave de envío sobrevive a cerrar y reabrir, y un éxito la olvida', async () => {
    claves.length = 0;
    render(<RegistrarBono pacientes={[]} hoy="2026-10-14" />);
    const abrir = () => fireEvent.click(screen.getByRole('button', { name: t('bonos.registrarBono') }));

    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'pedir-clave' }));
    fireEvent.click(screen.getByRole('button', { name: t('interfaz.cerrar') }));
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'pedir-clave' }));
    expect(claves[1]).toBe(claves[0]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'enviar-de-pega' }));
    });
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'pedir-clave' }));
    expect(claves[2]).not.toBe(claves[0]);
  });

  it('con paciente fijo se monta sin lista y le pasa el paciente al formulario', () => {
    render(<RegistrarBono pacienteFijo={{ id: 'p', nombre: 'Ana Ruiz' }} hoy="2026-10-14" />);
    fireEvent.click(screen.getByRole('button', { name: t('bonos.registrarBono') }));
    expect(screen.getByText('fijo:Ana Ruiz')).toBeInTheDocument();
  });
});
