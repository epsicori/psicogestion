import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialogo } from '@/components/ui/dialogo';
import type { BloqueAlta } from '@/lib/citas/alta';

import { ListaDia } from '../lista-dia';
import { RejillaSemana } from '../rejilla-semana';
import { construirCalendarioAlta } from './vista-alta';

function bloque(fecha: string, horaLocal: string): BloqueAlta {
  const [h, m] = horaLocal.split(':').map(Number);
  const inicio = new Date(`${fecha}T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return { fecha, horaLocal, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(), estado: 'libre' };
}

const calendario = construirCalendarioAlta({
  fechaFoco: '2026-10-06',
  zona: 'Europe/Madrid',
  hoy: '2026-10-04',
  sugerencias: { modo: 'habitual', sugerencias: [] },
  bloques: [bloque('2026-10-06', '10:00'), bloque('2026-10-06', '12:00')],
});
const seleccion = { huecos: calendario.huecos, elegido: null, alElegir: () => {} };

// H20: el dialogo del alta se cierra con Escape, pero Escape sobre un hueco solo vuelve al dia.
describe('Escape sobre un hueco dentro del Dialogo (H20)', () => {
  it('la rejilla: vuelve al dia y el dialogo no se cierra', () => {
    const alCerrar = vi.fn();
    render(
      <Dialogo abierto alCerrar={alCerrar} titulo="Nueva cita" ancho="amplio">
        <RejillaSemana titulo={calendario.titulo} dias={calendario.dias} eje={calendario.eje} diaInicial={1} seleccion={seleccion} />
      </Dialogo>,
    );
    const hueco = document.querySelector<HTMLElement>('[data-hueco="2026-10-06T10:00"]') as HTMLElement;
    hueco.focus();

    fireEvent.keyDown(hueco, { key: 'Escape' });

    expect((document.activeElement as HTMLElement).getAttribute('data-dia')).toBe('2026-10-06');
    expect(alCerrar).not.toHaveBeenCalled();
  });

  it('la lista: vuelve al dia y el dialogo no se cierra', () => {
    const alCerrar = vi.fn();
    render(
      <Dialogo abierto alCerrar={alCerrar} titulo="Nueva cita" ancho="amplio">
        <ListaDia dias={calendario.dias} diaInicial={1} seleccion={seleccion} />
      </Dialogo>,
    );
    const hueco = document.querySelector<HTMLElement>('[data-hueco="2026-10-06T10:00"]') as HTMLElement;
    hueco.focus();

    fireEvent.keyDown(hueco, { key: 'Escape' });

    expect((document.activeElement as HTMLElement).getAttribute('data-dia')).toBe('2026-10-06');
    expect(alCerrar).not.toHaveBeenCalled();
  });

  it('Escape en un campo cualquiera del dialogo sigue cerrandolo', () => {
    const alCerrar = vi.fn();
    render(
      <Dialogo abierto alCerrar={alCerrar} titulo="Nueva cita">
        <input aria-label="campo" />
      </Dialogo>,
    );

    fireEvent.keyDown(document.querySelector('input') as HTMLElement, { key: 'Escape' });

    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});
