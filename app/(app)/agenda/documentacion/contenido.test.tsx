import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  cargarContexto: vi.fn(),
  leerPendientes: vi.fn(),
  leerNombresPacientes: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('../datos', () => ({ cargarContexto: m.cargarContexto }));
vi.mock('@/lib/citas/agenda', () => ({
  leerPendientes: m.leerPendientes,
  leerNombresPacientes: m.leerNombresPacientes,
}));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('../acciones-alertas', () => ({ resolverAlerta: vi.fn() }));
vi.mock('./buscador', () => ({
  Buscador: ({ children, tipo, nivel }: { children: React.ReactNode; tipo: string | null; nivel: number | null }) => (
    <div data-buscador data-tipo={tipo ?? ''} data-nivel={nivel ?? ''}>
      {children}
    </div>
  ),
}));

import { ContenidoDocumentacion } from './contenido';

const ANA = '22222222-2222-4222-8222-222222222222';

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function alerta(parcial: Record<string, unknown> = {}) {
  return {
    id: id(500),
    pacienteId: ANA,
    tipo: 'nota_sin_firmar',
    fechaReferencia: '2026-09-20',
    creadaEn: '2026-09-20T10:00:00Z',
    nivel: 1,
    origenTabla: 'citas',
    origenId: 'cita-1',
    ...parcial,
  };
}

function contexto(rol: string | null) {
  return { ok: true, sesion: { usuario: { id: 'u1' } }, rol, hoy: '2026-10-01' };
}

async function pintar(
  parametros: Record<string, string | string[] | undefined>,
  rol: string | null,
  alertas: unknown[],
  extra: { recortada?: boolean; total?: number } = {},
) {
  m.cargarContexto.mockResolvedValue(contexto(rol));
  m.leerPendientes.mockResolvedValue({
    ok: true,
    alertas,
    total: extra.total ?? alertas.length,
    recortada: extra.recortada ?? false,
  });
  m.leerNombresPacientes.mockImplementation(async (_s: unknown, ids: string[]) => ({
    ok: true,
    nombres: new Map(ids.map((i) => [i, { nombre: `Nombre${i.slice(-3)}`, apellidos: 'Apellido' }])),
  }));
  return render(await ContenidoDocumentacion({ searchParams: Promise.resolve(parametros) }));
}

function muchos(n: number) {
  return Array.from({ length: n }, (_, i) => alerta({ id: id(1000 + i), pacienteId: id(i + 1) }));
}

describe('ContenidoDocumentacion: lectura', () => {
  beforeEach(() => vi.clearAllMocks());

  it('al administrador le pide solo las propias y sin filtro de tipo; los filtros del usuario solo estrechan', async () => {
    await pintar({ tipo: 'informe_pendiente', nivel: '2' }, 'administrador', [alerta()]);
    expect(m.leerPendientes).toHaveBeenCalledWith(expect.anything(), {
      soloPropias: true,
      tipos: ['informe_pendiente'],
      nivel: 2,
      pacienteId: undefined,
    });
  });

  it('al técnico: un tipo fuera de su lista da lista vacía, nunca una ampliación', async () => {
    await pintar({ tipo: 'nota_sin_firmar' }, 'tecnico_administrativo', []);
    expect(m.leerPendientes).toHaveBeenCalledWith(expect.anything(), {
      soloPropias: false,
      tipos: [],
      nivel: undefined,
      pacienteId: undefined,
    });
  });

  it('?profesional no se lee', async () => {
    await pintar({ profesional: ANA }, 'profesional_sanitario', [alerta()]);
    expect(JSON.stringify(m.leerPendientes.mock.calls[0][1])).not.toContain(ANA);
  });

  it('con ?paciente lo pasa al lector', async () => {
    await pintar({ paciente: ANA }, 'profesional_sanitario', [alerta()]);
    expect(m.leerPendientes.mock.calls[0][1].pacienteId).toBe(ANA);
  });

  it('pide los nombres solo de la página (20), no de toda la bandeja', async () => {
    await pintar({}, 'profesional_sanitario', muchos(45));
    expect(m.leerNombresPacientes.mock.calls[0][1]).toHaveLength(20);
  });
});

describe('ContenidoDocumentacion: paginación', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pinta la página pedida y la navegación conserva los filtros sin ?paciente', async () => {
    await pintar({ pagina: '2', tipo: 'nota_sin_firmar', nivel: '1' }, 'profesional_sanitario', muchos(45));
    const nav = screen.getByRole('navigation', { name: 'Páginas de pendientes' });
    expect(within(nav).getByRole('link', { name: 'Anterior' }).getAttribute('href')).toBe(
      '/agenda/documentacion?tipo=nota_sin_firmar&nivel=1',
    );
    const actual = within(nav).getByRole('link', { name: 'Página 2 de 3' });
    expect(actual.getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Siguiente' }).getAttribute('href')).toBe(
      '/agenda/documentacion?tipo=nota_sin_firmar&nivel=1&pagina=3',
    );
    expect(screen.getAllByRole('link', { name: /^Nombre/ })).toHaveLength(20);
  });

  it('una sola página: sin navegación', async () => {
    await pintar({}, 'profesional_sanitario', muchos(20));
    expect(screen.queryByRole('navigation', { name: 'Páginas de pendientes' })).toBeNull();
  });

  it('página fuera de rango: redirige a la última, conservando filtros, fuera de cualquier try', async () => {
    await expect(pintar({ pagina: '9', tipo: 'nota_sin_firmar' }, 'profesional_sanitario', muchos(45))).rejects.toThrow(
      'NEXT_REDIRECT:/agenda/documentacion?tipo=nota_sin_firmar&pagina=3',
    );
  });

  it('con una sola página, la redirección es a la URL sin ?pagina', async () => {
    await expect(pintar({ pagina: '5' }, 'profesional_sanitario', muchos(3))).rejects.toThrow(
      'NEXT_REDIRECT:/agenda/documentacion',
    );
  });

  it('vacío con ?pagina=2: redirige a la URL sin ?pagina, no hay bucle', async () => {
    await expect(pintar({ pagina: '2' }, 'profesional_sanitario', [])).rejects.toThrow(
      'NEXT_REDIRECT:/agenda/documentacion',
    );
  });
});

describe('ContenidoDocumentacion: filtros', () => {
  beforeEach(() => vi.clearAllMocks());

  it('el profesional ve los dos grupos, con la opción vigente marcada y sin ?pagina en los enlaces', async () => {
    await pintar({ tipo: 'informe_pendiente', nivel: '3', pagina: '1' }, 'profesional_sanitario', [alerta()]);
    const tipo = screen.getByRole('group', { name: 'Tipo' });
    expect(within(tipo).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Todos',
      'Nota sin firmar',
      'Borrador sin terminar',
      'Consentimiento por firmar',
      'Informe pendiente',
      'Evaluación sin corregir',
    ]);
    expect(within(tipo).getByRole('link', { name: 'Informe pendiente' }).getAttribute('aria-current')).toBe('true');
    expect(within(tipo).getByRole('link', { name: 'Todos' }).getAttribute('href')).toBe('/agenda/documentacion?nivel=3');
    const nivel = screen.getByRole('group', { name: 'Nivel' });
    expect(within(nivel).getByRole('link', { name: 'Muy atrasada (nivel 3)' }).getAttribute('aria-current')).toBe('true');
    expect(within(nivel).getByRole('link', { name: 'Atrasada (nivel 2)' }).getAttribute('href')).toBe(
      '/agenda/documentacion?tipo=informe_pendiente&nivel=2',
    );
  });

  it('el técnico, con un solo tipo visible: sin grupo de tipo y sin grupo de nivel', async () => {
    await pintar({}, 'tecnico_administrativo', [alerta({ tipo: 'consentimiento_pendiente' })]);
    expect(screen.queryByRole('group', { name: 'Tipo' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Nivel' })).toBeNull();
  });

  it('los filtros llegan al buscador para que no se pierdan', async () => {
    await pintar({ tipo: 'nota_sin_firmar', nivel: '2' }, 'profesional_sanitario', [alerta()]);
    const b = document.querySelector('[data-buscador]')!;
    expect(b.getAttribute('data-tipo')).toBe('nota_sin_firmar');
    expect(b.getAttribute('data-nivel')).toBe('2');
  });
});

describe('ContenidoDocumentacion: vacíos, errores y ?paciente', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin filtros y sin pendientes: «Al día», sin enlace de quitar filtros', async () => {
    await pintar({}, 'profesional_sanitario', []);
    expect(screen.getByText('Al día')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Quitar los filtros' })).toBeNull();
  });

  it('con filtros y sin resultados: lo dice y ofrece quitarlos', async () => {
    await pintar({ nivel: '3' }, 'profesional_sanitario', []);
    expect(screen.getByText('Ningún pendiente con estos filtros')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Quitar los filtros' }).getAttribute('href')).toBe('/agenda/documentacion');
  });

  it('el envoltorio de lista con el status (hermano suyo) siempre montado: en lista, vacío y error', async () => {
    const a = await pintar({}, 'profesional_sanitario', [alerta()]);
    expect(document.querySelector('[data-bloque-pendientes] ~ [data-estado-bloque][role="status"]')).not.toBeNull();
    a.unmount();
    const b = await pintar({}, 'profesional_sanitario', []);
    expect(document.querySelector('[data-bloque-pendientes] ~ [data-estado-bloque][role="status"]')).not.toBeNull();
    b.unmount();
    m.leerPendientes.mockResolvedValue({ ok: false, mensaje: 'No se pudo' });
    render(await ContenidoDocumentacion({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('alert').textContent).toContain('No se pudo');
    expect(document.querySelector('[data-bloque-pendientes] ~ [data-estado-bloque][role="status"]')).not.toBeNull();
  });

  it('error al cargar el contexto: aviso, no excepción', async () => {
    m.cargarContexto.mockResolvedValue({ ok: false, mensaje: 'Sin sesión' });
    render(await ContenidoDocumentacion({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('alert').textContent).toContain('Sin sesión');
  });

  it('fallo al leer nombres: aviso', async () => {
    m.cargarContexto.mockResolvedValue(contexto('profesional_sanitario'));
    m.leerPendientes.mockResolvedValue({ ok: true, alertas: [alerta()], total: 1, recortada: false });
    m.leerNombresPacientes.mockResolvedValue({ ok: false, mensaje: 'Sin permiso' });
    render(await ContenidoDocumentacion({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('alert').textContent).toContain('Sin permiso');
  });

  it('con la lectura recortada lo declara', async () => {
    await pintar({}, 'profesional_sanitario', [alerta()], { recortada: true, total: 1500 });
    expect(screen.getByText('Se muestran los 1 más urgentes de 1500.')).toBeTruthy();
  });

  it('con ?paciente: modo completo, sin buscador, con «Quitar el filtro de paciente» que conserva tipo y nivel', async () => {
    await pintar({ paciente: ANA, tipo: 'nota_sin_firmar', nivel: '1' }, 'profesional_sanitario', [
      alerta(),
      alerta({ id: id(501) }),
    ]);
    expect(document.querySelector('[data-buscador]')).toBeNull();
    expect(screen.queryByRole('button', { name: /pendientes/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Quitar el filtro de paciente' }).getAttribute('href')).toBe(
      '/agenda/documentacion?tipo=nota_sin_firmar&nivel=1',
    );
  });

  it('sin ?paciente la lista va dentro del buscador; los ids llevan el prefijo «pagina»', async () => {
    await pintar({}, 'profesional_sanitario', [alerta()]);
    const b = document.querySelector('[data-buscador]')!;
    expect(b.querySelector('[data-bloque-pendientes]')).not.toBeNull();
    expect(document.getElementById(`pagina-paciente-${ANA}`)).not.toBeNull();
  });

  it('no hay animación ni almacenamiento en el HTML', async () => {
    const { container } = await pintar({}, 'profesional_sanitario', muchos(3));
    expect(container.innerHTML).not.toMatch(/animate-|latido/);
  });
});
