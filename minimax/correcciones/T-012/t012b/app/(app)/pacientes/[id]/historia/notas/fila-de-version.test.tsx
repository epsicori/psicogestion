import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilaDeVersion } from './fila-de-version';
import { t, tCon } from '@/lib/i18n';

describe('FilaDeVersion', () => {
  const propsBase = {
    autor: 'Dra. García',
    firmadaEn: '12/10/2026 18:40',
    conjunta: false,
    sello: 'Escrita durante la sesión',
    huellaCorta: 'a1b2c3d4',
  };

  // La versión 1 sin motivo no muestra texto de motivo
  it('v1 sin motivo no muestra texto de motivo', () => {
    render(
      <ul>
        <FilaDeVersion
          {...propsBase}
          numero={1}
          motivo={null}
          vigente={false}
        />
      </ul>
    );
    expect(screen.queryByText(/^Motivo del cambio/)).not.toBeInTheDocument();
  });

  // Con motivo, muestra el texto con el motivo
  it('con motivo muestra el texto de motivo', () => {
    render(
      <ul>
        <FilaDeVersion
          {...propsBase}
          numero={2}
          motivo="Error tipográfico en diagnóstico"
          vigente={false}
        />
      </ul>
    );
    expect(
      screen.getByText(
        tCon('notas.version.motivo', { motivo: 'Error tipográfico en diagnóstico' })
      )
    ).toBeInTheDocument();
  });

  // Con vigente=true aparece la etiqueta de vigente
  it('con vigente=true muestra la etiqueta de vigente', () => {
    render(
      <ul>
        <FilaDeVersion
          {...propsBase}
          numero={1}
          motivo={null}
          vigente={true}
        />
      </ul>
    );
    expect(screen.getByText(`(${t('notas.version.vigente')})`)).toBeInTheDocument();
  });

  // Con vigente=false no aparece la etiqueta
  it('con vigente=false no muestra la etiqueta de vigente', () => {
    render(
      <ul>
        <FilaDeVersion
          {...propsBase}
          numero={1}
          motivo={null}
          vigente={false}
        />
      </ul>
    );
    expect(screen.queryByText(`(${t('notas.version.vigente')})`)).not.toBeInTheDocument();
  });

  // La huella está en un elemento con clase font-mono
  it('la huella está en un elemento con clase font-mono', () => {
    const { container } = render(
      <ul>
        <FilaDeVersion
          {...propsBase}
          numero={1}
          motivo={null}
          vigente={false}
        />
      </ul>
    );
    const huella = container.querySelector('.font-mono');
    expect(huella).toBeInTheDocument();
  });

  // conjunta=false no muestra el texto de conjunta
  it('conjunta=false no muestra el texto de nota conjunta', () => {
    render(
      <ul>
        <FilaDeVersion
          {...propsBase}
          numero={1}
          motivo={null}
          vigente={false}
          conjunta={false}
        />
      </ul>
    );
    expect(
      screen.queryByText(t('notas.version.conjunta'))
    ).not.toBeInTheDocument();
  });
});
