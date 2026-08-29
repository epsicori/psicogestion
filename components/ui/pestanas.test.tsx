import { useId, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PanelDePestana, Pestanas } from './pestanas';

const PESTANAS = [
  { id: 'notas', etiqueta: 'Notas' },
  { id: 'evaluaciones', etiqueta: 'Evaluaciones' },
  { id: 'informes', etiqueta: 'Informes' },
];

function Montaje() {
  const prefijo = useId();
  const [activa, setActiva] = useState('notas');
  return (
    <>
      <Pestanas
        pestanas={PESTANAS}
        activa={activa}
        alCambiar={setActiva}
        etiqueta="Historia clínica"
        prefijo={prefijo}
      />
      <PanelDePestana id={activa} prefijo={prefijo}>
        Contenido de {activa}
      </PanelDePestana>
    </>
  );
}

describe('Pestanas', () => {
  it('solo la seleccionada es tabulable: dentro se anda con las flechas', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    const [notas, evaluaciones, informes] = screen.getAllByRole('tab');
    expect(notas).toHaveAttribute('tabindex', '0');
    expect(evaluaciones).toHaveAttribute('tabindex', '-1');
    expect(informes).toHaveAttribute('tabindex', '-1');

    // Un solo Tab entra al grupo, no recorre las tres.
    await usuario.tab();
    expect(document.activeElement).toBe(notas);
  });

  it('las flechas mueven el foco y cambian de pestaña, y el ciclo da la vuelta', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    await usuario.tab();
    await usuario.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Evaluaciones' }));
    expect(screen.getByRole('tab', { name: 'Evaluaciones' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await usuario.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Notas' }));

    await usuario.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Informes' }));

    await usuario.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Notas' }));

    await usuario.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Informes' }));
  });

  it('el panel y su pestaña se apuntan el uno al otro', async () => {
    const usuario = userEvent.setup();
    render(<Montaje />);

    const panel = screen.getByRole('tabpanel');
    const pestana = screen.getByRole('tab', { name: 'Notas' });

    expect(pestana).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', pestana.id);

    // Y el cruce se mantiene al cambiar: es donde se rompe cuando el id se genera dentro.
    await usuario.tab();
    await usuario.keyboard('{ArrowRight}');

    const panelNuevo = screen.getByRole('tabpanel');
    const pestanaNueva = screen.getByRole('tab', { name: 'Evaluaciones' });
    expect(pestanaNueva).toHaveAttribute('aria-controls', panelNuevo.id);
    expect(panelNuevo).toHaveAttribute('aria-labelledby', pestanaNueva.id);
  });
});
