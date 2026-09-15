import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// La Historia clínica se prueba entera en `panel-historia.test.tsx`. Aquí estorba: montarla
// dispararía su acción de apertura y lo que se mira es el reparto de pestañas.
vi.mock('./panel-historia', () => ({ PanelHistoria: () => <p>historia montada</p> }));

const { FichaCliente } = await import('./ficha-cliente');

function pintar(mostrarHistoria: boolean) {
  render(
    <FichaCliente
      pacienteId="11111111-1111-4111-8111-111111111111"
      mostrarHistoria={mostrarHistoria}
      resumen={<p>bloque de resumen</p>}
      datos={<p>bloque de datos</p>}
      documentos={<p>bloque de documentos</p>}
      facturacion={<p>bloque de facturación</p>}
    />,
  );
}

describe('FichaCliente', () => {
  it('con historia, cinco pestañas y la primera es Resumen', () => {
    pintar(true);

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Resumen',
      'Ficha del paciente',
      'Historia clínica',
      'Documentos y consentimientos',
      'Facturación',
    ]);
    expect(screen.getByText('bloque de resumen')).toBeInTheDocument();
  });

  it('sin historia, la pestaña NO existe: ni en gris ni deshabilitada', () => {
    // Es el criterio del técnico administrativo. Una pestaña deshabilitada sigue diciendo
    // que hay algo detrás; lo que no se puede ver, no se enseña apagado.
    pintar(false);

    const pestanas = screen.getAllByRole('tab');
    expect(pestanas).toHaveLength(4);
    expect(pestanas.map((t) => t.textContent)).not.toContain('Historia clínica');
    expect(screen.queryByText('Historia clínica')).not.toBeInTheDocument();
  });

  it('solo se monta el panel activo: una pestaña sin abrir no ejecuta su contenido', async () => {
    // No es ahorro: montar la Historia clínica es lo que dispara la apertura, así que
    // tenerla montada de fondo registraría accesos que nadie pidió.
    const usuario = userEvent.setup();
    pintar(true);

    expect(screen.queryByText('historia montada')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('tab', { name: 'Historia clínica' }));
    expect(screen.getByText('historia montada')).toBeInTheDocument();
    expect(screen.queryByText('bloque de resumen')).not.toBeInTheDocument();
  });

  it('la pestaña activa no viaja en la URL (ADR-056)', async () => {
    const usuario = userEvent.setup();
    const antes = window.location.href;
    pintar(true);

    await usuario.click(screen.getByRole('tab', { name: 'Facturación' }));

    expect(screen.getByText('bloque de facturación')).toBeInTheDocument();
    expect(window.location.href).toBe(antes);
  });
});
