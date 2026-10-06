import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  cargarContexto: vi.fn(),
  leerPendientes: vi.fn(),
  leerNombresPacientes: vi.fn(),
}));

vi.mock('./datos', () => ({ cargarContexto: m.cargarContexto }));
vi.mock('@/lib/citas/agenda', () => ({
  leerPendientes: m.leerPendientes,
  leerNombresPacientes: m.leerNombresPacientes,
}));
vi.mock('./acciones-alertas', () => ({ resolverAlerta: vi.fn() }));

import { Documentacion } from './documentacion';

function contexto(rol: string | null) {
  return { ok: true, sesion: { usuario: { id: 'u1' } }, rol, hoy: '2026-10-01' };
}

const VACIA = { ok: true, alertas: [], total: 0, recortada: false };

describe('Documentacion (bandeja de la agenda)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.leerPendientes.mockResolvedValue(VACIA);
    m.leerNombresPacientes.mockResolvedValue({ ok: true, nombres: new Map() });
  });

  // Revisión SQL H2: la bandeja no puede ser global ni para el administrador (choque 2).
  it('al administrador le pide solo las alertas propias y de todos los tipos (sin filtro de tipo)', async () => {
    m.cargarContexto.mockResolvedValue(contexto('administrador'));
    await Documentacion({ centroParametro: null });
    const criterio = m.leerPendientes.mock.calls[0][1];
    expect(criterio.soloPropias).toBe(true);
    expect(criterio.tipos).toBeUndefined();
  });

  it('gemela: al profesional sanitario no se le recorta nada más de lo que ya hace la RLS', async () => {
    m.cargarContexto.mockResolvedValue(contexto('profesional_sanitario'));
    await Documentacion({ centroParametro: null });
    const criterio = m.leerPendientes.mock.calls[0][1];
    expect(criterio.soloPropias).toBe(false);
    expect(criterio.tipos).toBeUndefined();
  });

  // Decisión del propietario (01-10-2026): lista blanca del técnico, solo el consentimiento.
  it('al técnico solo le pide consentimiento_pendiente', async () => {
    m.cargarContexto.mockResolvedValue(contexto('tecnico_administrativo'));
    await Documentacion({ centroParametro: null });
    expect(m.leerPendientes).toHaveBeenCalledWith(expect.anything(), {
      soloPropias: false,
      tipos: ['consentimiento_pendiente'],
    });
  });

  // Revisión A2: sin rol conocido se cierra, no se abre; y con la misma lista blanca del técnico.
  it('con el rol sin leer pide solo las propias y solo consentimiento_pendiente', async () => {
    m.cargarContexto.mockResolvedValue(contexto(null));
    await Documentacion({ centroParametro: null });
    expect(m.leerPendientes).toHaveBeenCalledWith(expect.anything(), {
      soloPropias: true,
      tipos: ['consentimiento_pendiente'],
    });
  });
});

const ANA = '22222222-2222-4222-8222-222222222222';

function alerta(parcial: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    pacienteId: ANA,
    tipo: 'nota_sin_firmar',
    // Hace 30 días: con el cálculo viejo por días saldría «Más de 72 h» siempre.
    fechaReferencia: '2026-09-01',
    creadaEn: '2026-09-01T10:00:00Z',
    nivel: null,
    origenTabla: 'citas',
    origenId: 'cita-1',
    ...parcial,
  };
}

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function nombres(entradas: Record<string, [string, string]>) {
  return {
    ok: true,
    nombres: new Map(Object.entries(entradas).map(([k, [nombre, apellidos]]) => [k, { nombre, apellidos }])),
  };
}

async function pintar(
  rol: string | null,
  alertas: unknown[],
  extra: { total?: number; recortada?: boolean; nombres?: unknown } = {},
) {
  m.cargarContexto.mockResolvedValue(contexto(rol));
  m.leerPendientes.mockResolvedValue({
    ok: true,
    alertas,
    total: extra.total ?? alertas.length,
    recortada: extra.recortada ?? false,
  });
  m.leerNombresPacientes.mockResolvedValue(extra.nombres ?? nombres({ [ANA]: ['Ana', 'Prueba'] }));
  return render((await Documentacion({ centroParametro: null }))!);
}

// T-015 §1.7: la píldora sale del nivel que calcula la base, no de los días de calendario.
describe('Documentacion (nivel y resolver, T-015)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('nivel 1 o nulo: sin píldora aunque la fecha sea antigua', async () => {
    await pintar('profesional_sanitario', [alerta({ nivel: 1 }), alerta({ id: id(3) })]);
    expect(screen.queryByText('Atrasada')).toBeNull();
    expect(screen.queryByText('Muy atrasada')).toBeNull();
  });

  it('nivel 2: «Atrasada»; nivel 3: «Muy atrasada» (en el paciente y en el pendiente)', async () => {
    await pintar('profesional_sanitario', [
      alerta({ nivel: 2 }),
      alerta({ id: id(3), pacienteId: id(9), nivel: 3, fechaReferencia: '2026-10-01' }),
    ]);
    expect(screen.getAllByText('Atrasada').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Muy atrasada').length).toBeGreaterThan(0);
  });

  it('consentimiento_pendiente con rol profesional: aparece «Marcar como resuelta»', async () => {
    await pintar('profesional_sanitario', [alerta({ tipo: 'consentimiento_pendiente' })]);
    expect(
      screen.getByRole('button', { name: 'Marcar como resuelta: Consentimiento por firmar' }),
    ).toBeTruthy();
  });

  it('gemela: nota_sin_firmar con el mismo rol no lleva el botón', async () => {
    await pintar('profesional_sanitario', [alerta({ tipo: 'nota_sin_firmar' })]);
    expect(screen.queryByRole('button', { name: /Marcar como resuelta/ })).toBeNull();
  });

  // R4: el contenedor que recibe el foco y el aviso está en las tres ramas, dentro del marco.
  it('el bloque con su status y el título enfocable viven dentro del marco en la lista, el vacío y el error', async () => {
    const comprobar = () => {
      const bloque = document.querySelector('[data-bloque-pendientes]')!;
      expect(bloque).not.toBeNull();
      expect(bloque.hasAttribute('tabindex')).toBe(false);
      expect(bloque.getAttribute('role')).toBeNull();
      expect(bloque.closest('section')?.getAttribute('aria-labelledby')).toBe('agenda-documentacion');
      expect(bloque.querySelector('[data-estado-bloque][role="status"]')).not.toBeNull();
      const titulo = screen.getByRole('heading', { name: 'Documentación pendiente' });
      expect(titulo.id).toBe('agenda-documentacion');
      expect(titulo.getAttribute('tabindex')).toBe('-1');
    };

    const lista = await pintar('profesional_sanitario', [alerta({ tipo: 'consentimiento_pendiente' })]);
    comprobar();
    lista.unmount();

    const vacio = await pintar('profesional_sanitario', []);
    comprobar();
    vacio.unmount();

    m.leerPendientes.mockResolvedValue({ ok: false, mensaje: 'No se pudo' });
    render((await Documentacion({ centroParametro: null }))!);
    comprobar();
  });

  it('técnico: no aparece el botón de resolver en ningún tipo', async () => {
    await pintar('tecnico_administrativo', [
      alerta({ tipo: 'consentimiento_pendiente' }),
      alerta({ id: id(3), tipo: 'informe_pendiente' }),
    ]);
    expect(screen.queryByRole('button', { name: /Marcar como resuelta/ })).toBeNull();
  });
});

describe('Documentacion (agrupada por paciente, T-048)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin pendientes: «Al día» con su explicación, sin pie', async () => {
    await pintar('profesional_sanitario', []);
    expect(screen.getByText('Al día')).toBeTruthy();
    expect(screen.getByText('Cuando falte una nota por firmar, aparecerá aquí.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Ver todos/ })).toBeNull();
  });

  it('un paciente con varios pendientes es una sola fila, con nombre y apellidos', async () => {
    await pintar('profesional_sanitario', [
      alerta({ nivel: 3, fechaReferencia: '2026-09-20' }),
      alerta({ id: id(3), tipo: 'informe_pendiente' }),
      alerta({ id: id(4), tipo: 'informe_pendiente' }),
    ]);
    expect(screen.getAllByRole('link', { name: 'Ana Prueba' })).toHaveLength(1);
    const boton = screen.getByRole('button', { name: 'Ana Prueba, 3 pendientes, 1 escalado' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('1 nota · 2 informes — el más antiguo, hace 30 días')).toBeTruthy();
  });

  it('sin fila de nombre (la RLS no la deja ver): la etiqueta genérica', async () => {
    await pintar('profesional_sanitario', [alerta()], { nombres: { ok: true, nombres: new Map() } });
    expect(screen.getByRole('link', { name: 'Paciente' }).getAttribute('href')).toBe(`/pacientes/${ANA}`);
  });

  it('ordena por urgencia entre pacientes, aunque la lectura venga desordenada', async () => {
    const A = id(1);
    const B = id(2);
    await pintar(
      'profesional_sanitario',
      [
        alerta({ id: id(11), pacienteId: A, nivel: 1 }),
        alerta({ id: id(12), pacienteId: B, nivel: 3 }),
      ],
      { nombres: nombres({ [A]: ['Ana', 'A'], [B]: ['Berta', 'B'] }) },
    );
    const enlaces = screen.getAllByRole('link', { name: /^(Ana A|Berta B)$/ }).map((e) => e.textContent);
    expect(enlaces).toEqual(['Berta B', 'Ana A']);
  });

  it('pinta como mucho 6 pacientes, pide solo sus nombres y enlaza al pie con los totales', async () => {
    const alertas = Array.from({ length: 8 }, (_, i) => alerta({ id: id(100 + i), pacienteId: id(i + 1) }));
    // Cada paciente con un pendiente más, salvo el último: 15 pendientes de 8 pacientes.
    const extra = Array.from({ length: 7 }, (_, i) => alerta({ id: id(200 + i), pacienteId: id(i + 1), tipo: 'informe_pendiente' }));
    await pintar('profesional_sanitario', [...alertas, ...extra], { total: 15 });

    expect(m.leerNombresPacientes).toHaveBeenCalledTimes(1);
    const pedidos = m.leerNombresPacientes.mock.calls[0][1] as string[];
    expect(pedidos).toHaveLength(6);

    const pie = screen.getByRole('link', { name: 'Ver todos: 15 pendientes de 8 pacientes' });
    expect(pie.getAttribute('href')).toBe('/agenda/documentacion');
    expect(screen.getAllByRole('link', { name: 'Paciente' })).toHaveLength(6);
  });

  it('con exactamente 6 pacientes y sin recorte no hay pie', async () => {
    const alertas = Array.from({ length: 6 }, (_, i) => alerta({ id: id(100 + i), pacienteId: id(i + 1) }));
    await pintar('profesional_sanitario', alertas);
    expect(screen.queryByRole('link', { name: /Ver todos/ })).toBeNull();
  });

  it('con la lectura recortada, lo declara y el pie dice «o más pacientes»', async () => {
    await pintar('profesional_sanitario', [alerta()], { total: 1500, recortada: true });
    expect(screen.getByText('Se muestran los 1 más urgentes de 1500.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver todos: 1500 pendientes de 1 o más pacientes' })).toBeTruthy();
  });

  it('un fallo al leer los nombres es un aviso, no una lista sin nombres', async () => {
    m.cargarContexto.mockResolvedValue(contexto('profesional_sanitario'));
    m.leerPendientes.mockResolvedValue({ ok: true, alertas: [alerta()], total: 1, recortada: false });
    m.leerNombresPacientes.mockResolvedValue({ ok: false, mensaje: 'Sin permiso' });
    render((await Documentacion({ centroParametro: null }))!);
    expect(within(screen.getByRole('alert')).getByText('Sin permiso')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Paciente' })).toBeNull();
  });

  it('el destino de la nota sin firmar depende del rol', async () => {
    await pintar('profesional_sanitario', [alerta()]);
    expect(
      screen.getByRole('link', { name: 'Nota sin firmar de Ana Prueba: abrir la nota' }).getAttribute('href'),
    ).toBe(`/pacientes/${ANA}/historia/notas?cita=cita-1`);
  });
});
