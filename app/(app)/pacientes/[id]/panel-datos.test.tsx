import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatosDeCabecera } from './datos';

// T-032, criterios 7, 13 y 15. `PanelDatos` es un Server Component asíncrono: se ejecuta
// como función y se pinta lo que devuelve.
//
// `cargarIdentificacion` y `cargarSaludBasica` son las REALES de `./datos`: lo que se
// sustituye está debajo (la sesión con su cliente de Supabase, el rol y el descifrado). Así
// la prueba cubre la unión entre las piezas —el `catch` de `datos.ts` que convierte un
// descifrado fallido en `no-legible`, y la pregunta de asignación que decide si la salud
// básica se pinta—, no solo qué frase pinta el componente para un estado ya simulado (H5
// de la segunda revisión).

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

type Respuesta = { data: unknown; error: unknown };

const base = {
  rol: 'profesional_sanitario' as string | null,
  leerIdentificacion: { data: [], error: null } as Respuesta,
  esProfesionalAsignado: { data: true, error: null } as Respuesta,
  saludBasica: { data: null, error: null } as Respuesta,
  consultasSaludBasica: [] as string[][],
};

const rpc = vi.fn(async (nombre: string) => {
  if (nombre === 'leer_identificacion') return base.leerIdentificacion;
  if (nombre === 'es_profesional_asignado') return base.esProfesionalAsignado;
  throw new Error(`rpc inesperada: ${nombre}`);
});

// El constructor de consultas de PostgREST, reducido a lo que usa `cargarSaludBasica`: cada
// eslabón se anota para poder comprobar que se pide la ÚLTIMA fila y no una cualquiera.
function from(tabla: string) {
  if (tabla !== 'pacientes_salud_basica') throw new Error(`tabla inesperada: ${tabla}`);
  const eslabones: string[][] = [];
  const consulta = {
    select: (...a: unknown[]) => (eslabones.push(['select', ...a.map(String)]), consulta),
    eq: (...a: unknown[]) => (eslabones.push(['eq', ...a.map(String)]), consulta),
    order: (col: string, o: { ascending: boolean }) => (
      eslabones.push(['order', col, String(o.ascending)]), consulta
    ),
    limit: (n: number) => (eslabones.push(['limit', String(n)]), consulta),
    maybeSingle: async () => {
      base.consultasSaludBasica.push(...eslabones);
      return base.saludBasica;
    },
  };
  return consulta;
}

const descifrarIdentificacion = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/sesion', () => ({
  exigirSesion: async () => ({ supabase: { rpc, from }, usuario: { id: 'pro-1' } }),
}));
vi.mock('@/lib/cuentas/candado', () => ({
  estadoDeCuenta: async () => (base.rol ? { rol: base.rol } : null),
}));
vi.mock('@/lib/cifrado/identificacion', () => ({
  descifrarIdentificacion: (...a: unknown[]) => descifrarIdentificacion(...a),
}));

vi.mock('./datos', async (importOriginal) => {
  const real = await importOriginal<typeof import('./datos')>();
  return {
    ...real,
    cargarPaciente: async () => PACIENTE,
    cargarNombreDeProfesional: async () => 'Ana López',
    cargarRepresentantes: async () => [],
  };
});

const { PanelDatos } = await import('./panel-datos');

async function pintar() {
  render(await PanelDatos({ pacienteId: 'p1' }));
}

const FILA_CIFRADA = { dni_cifrado: 'AAAA', dni_nonce: 'BBBB', dni_etiqueta: 'CCCC' };

beforeEach(() => {
  base.rol = 'profesional_sanitario';
  base.leerIdentificacion = { data: [], error: null };
  base.esProfesionalAsignado = { data: true, error: null };
  base.saludBasica = { data: null, error: null };
  base.consultasSaludBasica = [];
  rpc.mockClear();
  descifrarIdentificacion.mockReset();
});

describe('PanelDatos · identificación', () => {
  it('criterio 15: si el descifrado lanza, dice «No se puede mostrar», nunca «sin documento»', async () => {
    base.leerIdentificacion = { data: [FILA_CIFRADA], error: null };
    descifrarIdentificacion.mockRejectedValue(new Error('Unsupported state or unable to authenticate data'));
    await pintar();

    expect(descifrarIdentificacion).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No se puede mostrar')).toBeInTheDocument();
    expect(screen.queryByText('Sin documento registrado')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin domicilio registrado')).not.toBeInTheDocument();
    expect(screen.queryByText(/sin DNI/i)).not.toBeInTheDocument();
  });

  it('gemela: sin fila dice «Sin documento registrado», y no «No se puede mostrar»', async () => {
    base.leerIdentificacion = { data: [], error: null };
    await pintar();

    expect(descifrarIdentificacion).not.toHaveBeenCalled();
    expect(screen.getByText('Sin documento registrado')).toBeInTheDocument();
    expect(screen.getByText('Sin domicilio registrado')).toBeInTheDocument();
    expect(screen.queryByText('No se puede mostrar')).not.toBeInTheDocument();
  });

  it('criterio 13: solo con domicilio pinta el domicilio y no un «DNI: —»', async () => {
    base.leerIdentificacion = { data: [FILA_CIFRADA], error: null };
    descifrarIdentificacion.mockResolvedValue({ domicilio: 'Calle Mayor 1, 28013 Madrid' });
    await pintar();

    expect(screen.getByText('Calle Mayor 1, 28013 Madrid')).toBeInTheDocument();
    expect(screen.getByText('Sin documento registrado')).toBeInTheDocument();
    expect(screen.queryByText(/DNI:\s*—/)).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('con documento y domicilio los pinta en claro', async () => {
    base.leerIdentificacion = { data: [FILA_CIFRADA], error: null };
    descifrarIdentificacion.mockResolvedValue({ documento: '12345678Z', domicilio: 'Calle Mayor 1' });
    await pintar();

    expect(screen.getByText('12345678Z')).toBeInTheDocument();
    expect(screen.getByText('Calle Mayor 1')).toBeInTheDocument();
  });

  it('si la lectura falló no pinta el bloque de identificación', async () => {
    base.leerIdentificacion = { data: null, error: { message: 'fallo' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await pintar();

    expect(screen.queryByText('Identificación')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin documento registrado')).not.toBeInTheDocument();
  });
});

describe('PanelDatos · alergias y medicación (ADR-063)', () => {
  it('el profesional asignado ve las vigentes, pedidas como la última fila del paciente', async () => {
    base.saludBasica = { data: { alergias: 'Látex', medicacion_actual: null }, error: null };
    await pintar();

    expect(screen.getByText('Látex')).toBeInTheDocument();
    expect(screen.getByText('Sin medicación registrada')).toBeInTheDocument();
    expect(base.consultasSaludBasica).toContainEqual(['eq', 'paciente_id', 'p1']);
    expect(base.consultasSaludBasica).toContainEqual(['order', 'registrado_en', 'false']);
    expect(base.consultasSaludBasica).toContainEqual(['limit', '1']);
  });

  it('criterio 7: el administrador que no es el asignado no ve el bloque, ni «sin alergias»', async () => {
    base.rol = 'administrador';
    base.esProfesionalAsignado = { data: false, error: null };
    await pintar();

    expect(rpc).toHaveBeenCalledWith('es_profesional_asignado', { p_paciente_id: 'p1' });
    expect(base.consultasSaludBasica).toEqual([]);
    expect(screen.queryByText('Alergias y medicación')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin alergias registradas')).not.toBeInTheDocument();
  });

  it('gemela: el administrador asignado sí ve el bloque', async () => {
    base.rol = 'administrador';
    base.saludBasica = { data: { alergias: 'Penicilina', medicacion_actual: 'Sertralina' }, error: null };
    await pintar();

    expect(screen.getByText('Alergias y medicación')).toBeInTheDocument();
    expect(screen.getByText('Penicilina')).toBeInTheDocument();
  });

  it('el técnico administrativo no llega ni a preguntar', async () => {
    base.rol = 'tecnico_administrativo';
    await pintar();

    expect(rpc).not.toHaveBeenCalledWith('es_profesional_asignado', expect.anything());
    expect(screen.queryByText('Alergias y medicación')).not.toBeInTheDocument();
  });
});
