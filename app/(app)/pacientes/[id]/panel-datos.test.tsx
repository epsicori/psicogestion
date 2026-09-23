import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatosDeCabecera, DatosDeIdentificacion, Legible } from './datos';

// T-032, criterios 13 y 15. `PanelDatos` es un Server Component asíncrono: se ejecuta
// como función y se pinta lo que devuelve. `./datos` se sustituye entero (arrastra
// `server-only` y Supabase); lo que se prueba es qué frase pinta la ficha para cada uno
// de los tres estados de `cargarIdentificacion()`.

const cargarIdentificacion = vi.fn<() => Promise<Legible<DatosDeIdentificacion> | null>>();

const PACIENTE: DatosDeCabecera = {
  id: 'p1',
  nombre: 'Carmen',
  apellidos: 'Ruiz',
  creadoEn: '2026-01-10T09:00:00Z',
  fechaNacimiento: '1988-03-14',
  telefono: null,
  sexo: null,
  centro: 'Madrid',
  profesionalId: 'pro-1',
  titularidad: 'organizacion',
};

vi.mock('./datos', () => ({
  cargarPaciente: async () => PACIENTE,
  cargarNombreDeProfesional: async () => 'Ana López',
  cargarRepresentantes: async () => [],
  cargarIdentificacion: () => cargarIdentificacion(),
  cargarSaludBasica: async () => null,
}));

const { PanelDatos } = await import('./panel-datos');

async function pintar() {
  render(await PanelDatos({ pacienteId: 'p1' }));
}

describe('PanelDatos · identificación', () => {
  beforeEach(() => {
    cargarIdentificacion.mockReset();
  });

  it('criterio 15: con estado no-legible dice «No se puede mostrar», nunca «sin documento»', async () => {
    cargarIdentificacion.mockResolvedValue({ estado: 'no-legible' });
    await pintar();

    expect(screen.getByText('No se puede mostrar')).toBeInTheDocument();
    expect(screen.queryByText('Sin documento registrado')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin domicilio registrado')).not.toBeInTheDocument();
    expect(screen.queryByText(/sin DNI/i)).not.toBeInTheDocument();
  });

  it('gemela: con estado sin-datos sí dice «Sin documento registrado», y no «No se puede mostrar»', async () => {
    cargarIdentificacion.mockResolvedValue({ estado: 'sin-datos' });
    await pintar();

    expect(screen.getByText('Sin documento registrado')).toBeInTheDocument();
    expect(screen.getByText('Sin domicilio registrado')).toBeInTheDocument();
    expect(screen.queryByText('No se puede mostrar')).not.toBeInTheDocument();
  });

  it('criterio 13: solo con domicilio pinta el domicilio y no un «DNI: —»', async () => {
    cargarIdentificacion.mockResolvedValue({
      estado: 'ok',
      datos: { documento: null, domicilio: 'Calle Mayor 1, 28013 Madrid' },
    });
    await pintar();

    expect(screen.getByText('Calle Mayor 1, 28013 Madrid')).toBeInTheDocument();
    expect(screen.getByText('Sin documento registrado')).toBeInTheDocument();
    expect(screen.queryByText(/DNI:\s*—/)).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('con documento y domicilio los pinta en claro', async () => {
    cargarIdentificacion.mockResolvedValue({
      estado: 'ok',
      datos: { documento: '12345678Z', domicilio: 'Calle Mayor 1' },
    });
    await pintar();

    expect(screen.getByText('12345678Z')).toBeInTheDocument();
    expect(screen.getByText('Calle Mayor 1')).toBeInTheDocument();
  });

  it('si la lectura falló (null) no pinta el bloque de identificación', async () => {
    cargarIdentificacion.mockResolvedValue(null);
    await pintar();

    expect(screen.queryByText('Identificación')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin documento registrado')).not.toBeInTheDocument();
  });
});
