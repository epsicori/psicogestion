import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CabeceraDeNota } from './cabecera-de-nota';
import { tCon } from '@/lib/i18n';

describe('CabeceraDeNota', () => {
  // Verifica que sin sesión no hay párrafo en el header
  it('no renderiza párrafo cuando sesion es null', () => {
    render(<CabeceraDeNota paciente="Juan Pérez" sesion={null} volverHref="/pacientes/1" />);
    const parrafos = document.querySelectorAll('header p');
    expect(parrafos).toHaveLength(0);
  });

  // Verifica que con sesión se renderiza el párrafo con el texto correcto
  it('renderiza párrafo con la sesión cuando se proporciona', () => {
    const sesion = '15 de enero de 2024 a las 10:00';
    render(<CabeceraDeNota paciente="Juan Pérez" sesion={sesion} volverHref="/pacientes/1" />);
    
    const parrafo = document.querySelector('header p');
    expect(parrafo).toBeInTheDocument();
    expect(parrafo?.textContent).toBe(sesion);
  });

  // Verifica que el enlace tiene el href correcto
  it('el enlace de volver tiene el href proporcionado', () => {
    const volverHref = '/pacientes/1/ficha';
    render(<CabeceraDeNota paciente="Juan Pérez" sesion={null} volverHref={volverHref} />);
    
    const enlace = screen.getByRole('link');
    expect(enlace).toHaveAttribute('href', volverHref);
  });

  // Verifica que hay un único heading de nivel 1 con el nombre del paciente
  it('renderiza un único h1 con el nombre del paciente', () => {
    const paciente = 'Ana Gómez';
    render(<CabeceraDeNota paciente={paciente} sesion={null} volverHref="/pacientes/1" />);
    
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe(tCon('notas.cabecera.titulo', { paciente }));
  });
});
