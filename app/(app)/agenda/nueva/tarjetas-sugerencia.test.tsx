import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ResultadoSugerencias } from '@/lib/agenda/sugerencias';

import { TarjetasSugerencia } from './tarjetas-sugerencia';
import { construirTarjetas } from './vista-alta';

const HABITUAL: ResultadoSugerencias = {
  modo: 'habitual',
  sugerencias: [
    { fecha: '2026-10-06', horaLocal: '12:00', motivo: { tipo: 'comoLasUltimas', n: 6 } },
    { fecha: '2026-10-13', horaLocal: '12:00', motivo: { tipo: 'diaHabitual', diaSemana: 2, hora: '12:00' } },
    { fecha: '2026-10-08', horaLocal: '10:00', motivo: { tipo: 'cadaIntervalo', dias: 14 } },
  ],
};

const EN_FRIO: ResultadoSugerencias = {
  modo: 'enFrio',
  sugerencias: [
    { fecha: '2026-10-06', horaLocal: '09:00', motivo: { tipo: 'primerHueco' } },
    { fecha: '2026-10-06', horaLocal: '10:00', motivo: { tipo: 'primerHueco' } },
    { fecha: '2026-10-07', horaLocal: '09:00', motivo: { tipo: 'primerHueco' } },
  ],
};

function pinta(resultado: ResultadoSugerencias, extra: Partial<Parameters<typeof TarjetasSugerencia>[0]> = {}) {
  const { modo, tarjetas } = construirTarjetas(resultado, 'Europe/Madrid');
  return render(
    <TarjetasSugerencia modo={modo} tarjetas={tarjetas} error={false} elegida={null} alElegir={() => {}} {...extra} />,
  );
}

describe('TarjetasSugerencia', () => {
  it('tres botones, el primero «como las seis últimas», y ninguna cifra de acierto ni estrella (ADR-049c)', () => {
    const { container } = pinta(HABITUAL);

    const botones = screen.getAllByRole('button');
    expect(botones).toHaveLength(3);
    expect(botones[0].textContent).toContain('Como las seis últimas');
    expect(container.textContent).not.toMatch(/\d+ ?%/);
    expect(container.textContent).not.toContain('★');
  });

  it('elegir una tarjeta avisa con su clave, y la elegida queda pulsada', () => {
    const alElegir = vi.fn();
    pinta(HABITUAL, { alElegir, elegida: '2026-10-13T12:00' });

    fireEvent.click(screen.getAllByRole('button')[2]);
    expect(alElegir).toHaveBeenCalledWith('2026-10-08T10:00');
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('sin citas: «Primeros huecos libres» y, fuera de la frase de ayuda, ningún motivo dice «habitual» (E17)', () => {
    const { container } = pinta(EN_FRIO);

    expect(screen.getByRole('heading', { name: 'Primeros huecos libres' })).toBeTruthy();
    const botones = screen.getAllByRole('button');
    expect(botones).toHaveLength(3);
    for (const b of botones) expect(b.textContent).not.toMatch(/habitual/i);
    const ayuda = container.querySelector('p');
    expect(ayuda?.textContent).toContain('hora habitual');
  });

  it('sin huecos libres dice que no hay, sin botones', () => {
    pinta({ modo: 'enFrio', sugerencias: [] });

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Sin huecos libres en las próximas cuatro semanas.')).toBeTruthy();
  });

  // Observacion del verificador (ronda 3): mientras se recalculan, «sin huecos» no es verdad todavia.
  it('mientras se calculan no dice que no hay huecos: dice que los busca', () => {
    pinta({ modo: 'enFrio', sugerencias: [] }, { cargando: true });

    expect(screen.queryByText('Sin huecos libres en las próximas cuatro semanas.')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Buscando huecos libres…');
  });

  it('con tarjetas anteriores a la vista, las deja mientras se recalcula', () => {
    pinta(HABITUAL, { cargando: true });

    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('si el cálculo falló, una alerta y no tarjetas', () => {
    render(<TarjetasSugerencia modo="habitual" tarjetas={[]} error elegida={null} alElegir={() => {}} />);

    expect(screen.getByRole('alert').textContent).toBe('No se han podido calcular las sugerencias.');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
