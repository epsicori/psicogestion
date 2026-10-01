import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListaDeNotas } from './lista-de-notas';
import { t, tCon } from '@/lib/i18n';

describe('ListaDeNotas', () => {
  // Verifica que con lista vacía se muestra el mensaje y no hay enlaces
  it('renderiza estado vacío cuando no hay notas', () => {
    render(<ListaDeNotas notas={[]} />);
    
    expect(screen.getByText(t('notas.lista.vacia'))).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  // Verifica que cada nota genera un enlace con el href correcto
  it('renderiza enlaces con href exacto para cada nota', () => {
    const notas = [
      {
        id: '1',
        fechaSesion: '15/01/2024',
        estado: 'firmada' as const,
        versiones: 1,
        autor: 'Dra. García',
        conjunta: false,
        href: '/pacientes/1/historia/notas/1',
      },
      {
        id: '2',
        fechaSesion: '20/01/2024',
        estado: 'modificada' as const,
        versiones: 2,
        autor: 'Dr. López',
        conjunta: false,
        href: '/pacientes/1/historia/notas/2',
      },
    ];
    
    render(<ListaDeNotas notas={notas} />);
    
    const enlaces = screen.getAllByRole('link');
    expect(enlaces).toHaveLength(2);
    expect(enlaces[0]).toHaveAttribute('href', '/pacientes/1/historia/notas/1');
    expect(enlaces[1]).toHaveAttribute('href', '/pacientes/1/historia/notas/2');
  });

  // Verifica que con una sola versión no se muestra el texto de versiones
  it('no muestra texto de versiones cuando versiones es 1', () => {
    const notas = [
      {
        id: '1',
        fechaSesion: '15/01/2024',
        estado: 'firmada' as const,
        versiones: 1,
        autor: 'Dra. García',
        conjunta: false,
        href: '/pacientes/1/historia/notas/1',
      },
    ];
    
    render(<ListaDeNotas notas={notas} />);
    
    const textoVersiones = tCon('notas.lista.versiones', { n: 1 });
    expect(screen.queryByText(textoVersiones)).not.toBeInTheDocument();
  });

  // Verifica que con más de una versión se muestra el texto de versiones
  it('muestra texto de versiones cuando hay más de una', () => {
    const notas = [
      {
        id: '1',
        fechaSesion: '15/01/2024',
        estado: 'firmada' as const,
        versiones: 3,
        autor: 'Dra. García',
        conjunta: false,
        href: '/pacientes/1/historia/notas/1',
      },
    ];
    
    render(<ListaDeNotas notas={notas} />);
    
    const textoVersiones = tCon('notas.lista.versiones', { n: 3 });
    expect(screen.getByText(textoVersiones)).toBeInTheDocument();
  });
});
