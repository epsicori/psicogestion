import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PanelDiferido } from './panel-diferido';

vi.mock('./panel-historia', () => ({ PanelHistoria: () => <p>historia montada</p> }));

const { FichaCliente } = await import('./ficha-cliente');

// T-032, H2. `cargar` hace aquí de la Server Function de `page.tsx` que ejecuta
// `PanelDatos` (y con él `leer_identificacion()`, su rastro y el descifrado). Lo que se
// prueba es que NO se llama mientras nadie abra la pestaña «Ficha del paciente».
function pintar(cargar: () => Promise<React.ReactNode>) {
  render(
    <StrictMode>
      <FichaCliente
        pacienteId="11111111-1111-4111-8111-111111111111"
        mostrarHistoria
        resumen={<p>bloque de resumen</p>}
        datos={<PanelDiferido cargar={cargar} />}
        documentos={<p>bloque de documentos</p>}
        facturacion={<p>bloque de facturación</p>}
      />
    </StrictMode>,
  );
}

describe('PanelDiferido dentro de la ficha', () => {
  it('no carga «Datos» mientras la pestaña esté cerrada; al abrirla, lo carga UNA vez', async () => {
    const cargar = vi.fn(async () => <p>12345678Z</p>);
    const usuario = userEvent.setup();
    pintar(cargar);

    expect(cargar).not.toHaveBeenCalled();
    expect(screen.queryByText('12345678Z')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('tab', { name: 'Ficha del paciente' }));

    expect(await screen.findByText('12345678Z')).toBeInTheDocument();
    // Una sola llamada pese al doble montaje de StrictMode.
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('mientras llega, enseña el esqueleto de carga', async () => {
    let resolver: (nodo: React.ReactNode) => void = () => {};
    const cargar = vi.fn(() => new Promise<React.ReactNode>((r) => (resolver = r)));
    const usuario = userEvent.setup();
    pintar(cargar);

    await usuario.click(screen.getByRole('tab', { name: 'Ficha del paciente' }));
    expect(screen.getByRole('status')).toBeInTheDocument();

    resolver(<p>listo</p>);
    expect(await screen.findByText('listo')).toBeInTheDocument();
  });

  it('si la carga falla, lo dice sin enseñar el motivo', async () => {
    const cargar = vi.fn(async () => {
      throw new Error('detalle interno');
    });
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const usuario = userEvent.setup();
    pintar(cargar);

    await usuario.click(screen.getByRole('tab', { name: 'Ficha del paciente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la ficha de este paciente.',
    );
    expect(screen.queryByText(/detalle interno/)).not.toBeInTheDocument();
    consola.mockRestore();
  });
});
