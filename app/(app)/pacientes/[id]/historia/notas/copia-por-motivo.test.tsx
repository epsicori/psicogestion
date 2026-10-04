import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { t, tCon } from '@/lib/i18n';

// T-040 · P2-a: lo que ve la administración de una nota que no lee. Fecha, autor, versiones y
// la explicación; nada del contenido. «Pedir copia por motivo» abre el diálogo en modo motivo.

vi.mock('./acciones-copia', () => ({ pedirCopiaDeNota: vi.fn(), registrarFicheroDeCopia: vi.fn() }));
vi.mock('@/lib/exportaciones/cifrar', () => ({ cifrarCopia: vi.fn() }));
vi.mock('@/lib/exportaciones/derivar-en-trabajador', () => ({ derivarEnTrabajador: vi.fn() }));

const { CopiaPorMotivo } = await import('./copia-por-motivo');

const P = '11111111-1111-4111-8111-111111111111';
const nota = { id: 'n9', fechaSesion: '02/02/2026', autor: 'Dr. Ruiz', versiones: 1, href: '/x' };

describe('CopiaPorMotivo', () => {
  it('enseña la fecha, el autor, las versiones y la explicación', () => {
    render(<CopiaPorMotivo pacienteId={P} nota={nota} />);
    expect(screen.getByText(/02\/02\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Ruiz/)).toBeInTheDocument();
    expect(screen.getByText(tCon('exportaciones.motivo.versiones.una', { n: 1 }))).toBeInTheDocument();
    expect(screen.getByText(t('exportaciones.motivo.explicacion'))).toBeInTheDocument();
  });

  it('«Pedir copia por motivo» abre el diálogo con el motivo, y Escape devuelve el foco al botón', async () => {
    const usuario = userEvent.setup();
    render(<CopiaPorMotivo pacienteId={P} nota={{ ...nota, versiones: 3 }} />);
    expect(screen.getByText(tCon('exportaciones.motivo.versiones.varias', { n: 3 }))).toBeInTheDocument();
    const boton = screen.getByRole('button', { name: t('exportaciones.boton.pedirPorMotivo') });
    await usuario.click(boton);
    expect(screen.getByRole('dialog', { name: t('exportaciones.dialogo.tituloMotivo') })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: t('exportaciones.dialogo.motivo') })).toBeInTheDocument();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });
});
