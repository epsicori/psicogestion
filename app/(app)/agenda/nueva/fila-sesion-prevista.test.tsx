import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CuerpoSesionPrevista } from './fila-sesion-prevista';

type Estado = 'normal' | 'festivo' | 'ausencia' | 'ocupada' | 'cambioDeHora';

function pinta(estado: Estado, alternativa: string | null = null) {
  const { container } = render(
    <CuerpoSesionPrevista
      fecha="15 de enero"
      hora="10:00"
      estado={estado}
      alternativa={alternativa}
      horaResultante="11:00"
    />,
  );
  return container.textContent ?? '';
}

describe('fila-sesion-prevista', () => {
  it.each(['festivo', 'ausencia', 'ocupada'] as const)('un bloqueo (%s) no pinta la hora', (estado) => {
    expect(pinta(estado)).not.toContain('10:00');
  });

  it('un cambio de hora dice a qué hora queda', () => {
    expect(pinta('cambioDeHora')).toBe('15 de enero10:00Cambio de hora: queda a las 11:00');
  });

  it('una sesión normal es la fecha y la hora, sin aviso', () => {
    expect(pinta('normal')).toBe('15 de enero10:00');
  });

  it('los cinco estados dan cinco textos distintos entre sí', () => {
    const textos = (['normal', 'festivo', 'ausencia', 'ocupada', 'cambioDeHora'] as const).map((e) => pinta(e));
    expect(new Set(textos).size).toBe(5);
  });

  it('un bloqueo con alternativa la nombra; sin ella dice que queda fuera', () => {
    expect(pinta('festivo', 'martes 16 de enero')).toBe('15 de eneroFestivoAlternativa: martes 16 de enero');
    expect(pinta('ocupada')).toBe('15 de eneroHueco ocupadoSin alternativa: queda fuera');
  });
});
