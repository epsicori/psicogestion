import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

// T-040 · P2-a: la segunda lista, la de las notas que solo admiten copia por motivo.
describe('ListaDeNotas · otras notas (solo copia por motivo)', () => {
  const nota = {
    id: '1',
    fechaSesion: '15/01/2024',
    estado: 'firmada' as const,
    versiones: 1,
    autor: 'Dra. García',
    conjunta: false,
    href: '/pacientes/p/historia/notas?nota=1',
  };
  const paraCopia = {
    id: '9',
    fechaSesion: '02/02/2024',
    autor: 'Dr. Ruiz',
    versiones: 2,
    href: '/pacientes/p/historia/notas?nota=9',
  };

  it('pinta la segunda lista con su encabezado, fecha, autor y versiones, enlazando por ?nota=', () => {
    render(<ListaDeNotas notas={[nota]} paraCopia={[paraCopia]} />);
    expect(screen.getByRole('heading', { name: t('exportaciones.lista.otras') })).toBeInTheDocument();
    const enlace = screen.getByRole('link', { name: /02\/02\/2024/ });
    expect(enlace).toHaveAttribute('href', '/pacientes/p/historia/notas?nota=9');
    expect(enlace).toHaveTextContent('Dr. Ruiz');
    expect(enlace).toHaveTextContent(tCon('exportaciones.motivo.versiones.varias', { n: 2 }));
  });

  it('con solo notas para copia no pinta el estado vacío', () => {
    render(<ListaDeNotas notas={[]} paraCopia={[paraCopia]} />);
    expect(screen.queryByText(t('notas.lista.vacia'))).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('el estado vacío solo aparece si las dos listas están vacías', () => {
    render(<ListaDeNotas notas={[]} paraCopia={[]} />);
    expect(screen.getByText(t('notas.lista.vacia'))).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t('exportaciones.lista.otras') })).not.toBeInTheDocument();
  });

  it('sin notas para copia (lista vacía) no hay segunda lista ni aviso', () => {
    render(<ListaDeNotas notas={[nota]} paraCopia={[]} />);
    expect(screen.queryByRole('heading', { name: t('exportaciones.lista.otras') })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Revisión B-H1: `null` es una lectura fallida, no «no hay»: ni silencio ni el estado vacío.
  it('si la lectura de las notas para copia falló, avisa con un reintento y no dice que no hay notas', async () => {
    const alReintentar = vi.fn();
    render(<ListaDeNotas notas={[]} paraCopia={null} alReintentarCopias={alReintentar} />);
    expect(screen.queryByText(t('notas.lista.vacia'))).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(t('exportaciones.lista.noSePudoLeer'));
    await userEvent.click(screen.getByRole('button', { name: t('notas.aviso.reintentar') }));
    expect(alReintentar).toHaveBeenCalledTimes(1);
  });

  it('con notas propias y la lectura de copias fallida, pinta las propias y el aviso', () => {
    render(<ListaDeNotas notas={[nota]} paraCopia={null} alReintentarCopias={() => {}} />);
    expect(screen.getByRole('link', { name: /15\/01\/2024/ })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(t('exportaciones.lista.noSePudoLeer'));
  });
});
