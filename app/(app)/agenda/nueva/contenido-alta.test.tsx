import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CENTRO = '33333333-3333-4333-8333-333333333333';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const OTRO_PROFESIONAL = '66666666-6666-4666-8666-666666666666';
const ASIGNADO = '77777777-7777-4777-8777-777777777777';
const PACIENTE = '11111111-1111-4111-8111-111111111111';

const m = vi.hoisted(() => ({
  cargarContexto: vi.fn(),
  cargarVistaAlta: vi.fn(),
  relojDelCentro: vi.fn(),
  tablas: {} as Record<string, { data: unknown; error: unknown }>,
  consultas: [] as { tabla: string; filtros: [string, unknown][] }[],
}));

vi.mock('../datos', () => ({ cargarContexto: m.cargarContexto }));
vi.mock('./estado-alta', () => ({
  DURACION_INICIAL: 50,
  cargarVistaAlta: m.cargarVistaAlta,
  relojDelCentro: m.relojDelCentro,
}));
vi.mock('./formulario-navegable', () => ({ FormularioNavegable: () => null }));

import { ContenidoAlta } from './contenido-alta';

function constructor(tabla: string) {
  const consulta = { tabla, filtros: [] as [string, unknown][] };
  m.consultas.push(consulta);
  const cadena: Record<string, unknown> = {};
  const devolver = () => cadena;
  cadena.select = devolver;
  cadena.order = devolver;
  cadena.in = (columna: string, valor: unknown) => (consulta.filtros.push([columna, valor]), cadena);
  cadena.eq = (columna: string, valor: unknown) => (consulta.filtros.push([columna, valor]), cadena);
  cadena.maybeSingle = () => Promise.resolve(m.tablas[tabla]);
  cadena.then = (alResolver: (v: unknown) => unknown) => Promise.resolve(m.tablas[tabla]).then(alResolver);
  return cadena;
}

function contexto(rol: string) {
  return {
    ok: true,
    sesion: { usuario: { id: USUARIO }, supabase: { from: constructor } },
    rol,
    centros: [{ id: CENTRO, nombre: 'Centro Sur' }],
    centro: CENTRO,
    zona: 'Europe/Madrid',
    hoy: '2026-10-04',
    ahora: new Date('2026-10-04T10:00:00Z'),
  };
}

const VISTA = { calendario: {}, modo: 'enFrio', tarjetas: [], errorSugerencias: false };

/** El elemento que devuelve el componente asíncrono, ya resuelto. */
async function resolver(sp: Record<string, string> = {}): Promise<ReactElement<Record<string, unknown>>> {
  return (await ContenidoAlta({ searchParams: Promise.resolve(sp), modo: 'dialogo' })) as ReactElement<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.consultas.length = 0;
  m.tablas = {
    tipos_terapia: { data: [{ id: 't1', nombre: 'Individual', duracion_minutos: 50 }], error: null },
    directorio_perfiles: { data: [{ id: OTRO_PROFESIONAL, nombre_completo: 'Ana Ruiz', centro_id: CENTRO }], error: null },
    pacientes: { data: { id: PACIENTE, nombre: 'Ana', apellidos: 'Pérez' }, error: null },
  };
  m.cargarContexto.mockResolvedValue(contexto('administrador'));
  m.relojDelCentro.mockResolvedValue({ ok: true, zona: 'Europe/Madrid', hoy: '2026-10-04' });
  m.cargarVistaAlta.mockResolvedValue({ ok: true, vista: VISTA });
});

describe('ContenidoAlta', () => {
  it('pasa al formulario el catálogo de tipos con su duración, sin más', async () => {
    const elemento = await resolver();

    expect(elemento.props.tipos).toEqual([{ id: 't1', nombre: 'Individual', duracionMinutos: 50 }]);
    expect(elemento.props.vista).toBe(VISTA);
    const tipos = m.consultas.find((c) => c.tabla === 'tipos_terapia');
    expect(tipos?.filtros).toContainEqual(['activo', true]);
  });

  it('se ofrecen los activos del directorio, profesionales sanitarios y administradores (H1)', async () => {
    const elemento = await resolver();

    expect(elemento.props.profesionales).toEqual([{ id: OTRO_PROFESIONAL, nombre: 'Ana Ruiz', centroId: CENTRO }]);
    const directorio = m.consultas.find((c) => c.tabla === 'directorio_perfiles');
    expect(directorio?.filtros).toContainEqual(['rol', ['profesional_sanitario', 'administrador']]);
    expect(directorio?.filtros).toContainEqual(['estado', 'activo']);
  });

  // H2 (revisión del corte B): el profesional por defecto es el asignado al paciente, no el primero.
  it('por defecto entra el profesional asignado al paciente, aunque no sea el primero del directorio', async () => {
    m.tablas.directorio_perfiles = {
      data: [
        { id: OTRO_PROFESIONAL, nombre_completo: 'Ana Ruiz', centro_id: CENTRO },
        { id: ASIGNADO, nombre_completo: 'Luis Soto', centro_id: CENTRO },
      ],
      error: null,
    };
    m.tablas.pacientes = { data: { id: PACIENTE, nombre: 'Ana', apellidos: 'Pérez', profesional_id: ASIGNADO }, error: null };

    const elemento = await resolver({ paciente: PACIENTE });

    expect(elemento.props.inicial).toMatchObject({ profesionalId: ASIGNADO });
    expect(m.cargarVistaAlta.mock.calls[0][2]).toMatchObject({ profesionalId: ASIGNADO });
  });

  it('sin paciente, o con uno cuyo profesional no está en el centro, entra el primero en orden estable', async () => {
    m.tablas.directorio_perfiles = {
      data: [
        { id: ASIGNADO, nombre_completo: 'Luis Soto', centro_id: CENTRO },
        { id: OTRO_PROFESIONAL, nombre_completo: 'Ana Ruiz', centro_id: CENTRO },
      ],
      error: null,
    };

    const sinPaciente = await resolver();
    expect(sinPaciente.props.inicial).toMatchObject({ profesionalId: OTRO_PROFESIONAL });
    expect((sinPaciente.props.profesionales as { nombre: string }[]).map((p) => p.nombre)).toEqual(['Ana Ruiz', 'Luis Soto']);

    m.tablas.pacientes = { data: { id: PACIENTE, nombre: 'Ana', apellidos: 'Pérez', profesional_id: 'ajeno' }, error: null };
    const ajeno = await resolver({ paciente: PACIENTE });
    expect(ajeno.props.inicial).toMatchObject({ profesionalId: OTRO_PROFESIONAL });
  });

  it('el profesional agenda a su nombre: no consulta el directorio y el profesional es él', async () => {
    m.cargarContexto.mockResolvedValue(contexto('profesional_sanitario'));

    const elemento = await resolver();

    expect(elemento.props.inicial).toMatchObject({ profesionalId: USUARIO });
    expect(m.consultas.some((c) => c.tabla === 'directorio_perfiles')).toBe(false);
  });

  it('un paciente de la URL se vuelve a leer con la sesión de quien mira y entra elegido', async () => {
    const elemento = await resolver({ paciente: PACIENTE, inicio: '2026-10-06T17:00' });

    expect(elemento.props.inicial).toMatchObject({ paciente: { id: PACIENTE, nombre: 'Ana Pérez' }, clave: '2026-10-06T17:00' });
    expect(m.cargarVistaAlta.mock.calls[0][2]).toMatchObject({ pacienteId: PACIENTE, fechaFoco: '2026-10-06', duracionMinutos: 50 });
  });

  it('un paciente que la RLS no deja ver no entra', async () => {
    m.tablas.pacientes = { data: null, error: null };

    const elemento = await resolver({ paciente: PACIENTE });

    expect(elemento.props.inicial).toMatchObject({ paciente: null });
    expect(m.cargarVistaAlta.mock.calls[0][2]).toMatchObject({ pacienteId: null });
  });

  it('si el reloj del centro falla, lo dice en una alerta y no tumba el render', async () => {
    m.relojDelCentro.mockResolvedValue({ ok: false, motivo: 'no_autorizado', mensaje: 'Sin acceso al centro.' });

    const elemento = await resolver();

    expect(elemento.props.mensaje).toBe('Sin acceso al centro.');
    expect(m.cargarVistaAlta).not.toHaveBeenCalled();
  });

  it('sin centro asignado lo dice', async () => {
    m.cargarContexto.mockResolvedValue({ ...contexto('administrador'), centros: [], centro: null });

    const elemento = await resolver();

    expect(elemento.props.mensaje).toBe('No tienes ningún centro asignado.');
  });

  it('si fallan las sugerencias, el formulario sigue con su aviso (la vista lo lleva)', async () => {
    m.cargarVistaAlta.mockResolvedValue({ ok: true, vista: { ...VISTA, errorSugerencias: true } });

    const elemento = await resolver();

    expect((elemento.props.vista as typeof VISTA).errorSugerencias).toBe(true);
  });
});
