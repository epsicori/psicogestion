import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PildoraDeEstado } from './estado-de-nota';
import { t } from '@/lib/i18n';

describe('PildoraDeEstado', () => {
  // Cada estado muestra su texto correspondiente
  it.each([
    { estado: 'borrador' as const, texto: t('notas.estado.borrador') },
    { estado: 'firmada' as const, texto: t('notas.estado.firmada') },
    { estado: 'modificada' as const, texto: t('notas.estado.modificada') },
    { estado: 'firmada_con_cambios' as const, texto: t('notas.estado.firmadaConCambios') },
  ])('muestra el texto correcto para el estado $estado', ({ estado, texto }) => {
    render(<PildoraDeEstado estado={estado} />);
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  // Los cuatro textos son distintos entre sí
  it('los cuatro textos de estado son distintos', () => {
    const textos = [
      t('notas.estado.borrador'),
      t('notas.estado.firmada'),
      t('notas.estado.modificada'),
      t('notas.estado.firmadaConCambios'),
    ];
    expect(new Set(textos).size).toBe(4);
  });
});
