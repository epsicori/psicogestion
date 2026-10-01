import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { citaDePrueba } from './fixtures-cita';

vi.mock('./acciones', () => ({
  confirmarPropuestaAgenda: vi.fn(),
  descartarPropuestaAgenda: vi.fn(),
}));

const { PanelCita } = await import('./panel-cita');

function montar(extra: Parameters<typeof citaDePrueba>[0] = {}, alReprogramar = vi.fn()) {
  const ancla = document.createElement('button');
  document.body.append(ancla);
  render(<PanelCita cita={citaDePrueba(extra)} ancla={ancla} alCerrar={vi.fn()} alReprogramar={alReprogramar} />);
  return { alReprogramar };
}

const texto = () => screen.getByRole('dialog').textContent ?? '';

describe('PanelCita', () => {
  it('lleva el nombre como título y los campos en el orden del diseño', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Ana García López' })).toBeInTheDocument();
    const contenido = texto();
    const orden = [
      '17:00–17:50 · 50 min',
      'Terapia individual',
      'Lucía Márquez',
      'Centro Norte · sala 2',
      'Trae el informe',
      'Programada',
    ];
    const posiciones = orden.map((fragmento) => contenido.indexOf(fragmento));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it('omite el tipo y la nota operativa cuando son nulos', () => {
    montar({ tipoNombre: null, notaOperativa: null });
    expect(screen.queryByText('Tipo de terapia')).toBeNull();
    expect(screen.queryByText('Nota operativa')).toBeNull();
  });

  it('el estado «en curso» no late en el panel', () => {
    montar({ estado: 'en_curso', late: true });
    expect(screen.getByRole('dialog').querySelector('.latido-estado')).toBeNull();
    expect(screen.getByRole('dialog').querySelector('.halo-estado')).not.toBeNull();
  });

  it('una cita de serie desviada lo dice y da su motivo', () => {
    montar({ deSerie: true, desviada: true, motivoDesviacion: 'Movida a mano' });
    expect(texto()).toContain('Movida fuera de la serie');
    expect(texto()).toContain('Movida a mano');
  });

  it('una cita de serie sin desviar dice que es de una serie', () => {
    montar({ deSerie: true });
    expect(texto()).toContain('Cita de una serie');
  });

  it('una cita suelta no habla de serie', () => {
    montar();
    expect(screen.queryByText('Serie')).toBeNull();
  });

  it('con propuesta pendiente pinta Confirmar y Descartar, sin repetir el nombre', () => {
    montar({ propuestaPendiente: { id: 'p1', rango: '18:00–18:50' } });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
    expect(texto()).toContain('Propuesta: 18:00–18:50');
    expect(screen.getAllByText('Ana García López')).toHaveLength(1);
  });

  it('sin horario propuesto solo se puede descartar', () => {
    montar({ propuestaPendiente: { id: 'p1', rango: null } });
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
  });

  it.each([
    [0, 'pendiente desde hoy'],
    [1, 'pendiente desde hace 1 día'],
    [4, 'pendiente desde hace 4 días'],
  ])('nota pendiente %i días: informa y no bloquea', (dias, fragmento) => {
    montar({ notas: { mostrar: false, href: '', primario: false, diasPendiente: dias } });
    expect(texto()).toContain(fragmento);
  });

  it('sin nota pendiente no hay aviso', () => {
    montar();
    expect(texto()).not.toContain('obligatoria');
  });

  it('«Notas» solo si notas.mostrar, y apunta a la ruta', () => {
    montar({
      notas: { mostrar: true, href: '/pacientes/x/historia/notas?cita=y', primario: true, diasPendiente: null },
    });
    expect(screen.getByRole('link', { name: 'Notas' })).toHaveAttribute('href', '/pacientes/x/historia/notas?cita=y');
  });

  it('sin notas.mostrar no hay «Notas»', () => {
    montar();
    expect(screen.queryByRole('link', { name: 'Notas' })).toBeNull();
  });

  it('«Reprogramar» solo si es reprogramable y avisa a quien lo abre', async () => {
    const { alReprogramar } = montar();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reprogramar' }));
    expect(alReprogramar).toHaveBeenCalledTimes(1);
  });

  it('una cita no reprogramable no ofrece «Reprogramar»', () => {
    montar({ reprogramable: false });
    expect(screen.queryByRole('button', { name: 'Reprogramar' })).toBeNull();
  });
});
