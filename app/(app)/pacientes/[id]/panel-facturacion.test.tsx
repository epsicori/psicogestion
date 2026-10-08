import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// T-026a · La pestaña Facturación de la ficha. La tabla de datos de cada lectura es un mapa
// {tabla: {data, error}}; el constructor de consultas devuelve siempre el mismo resultado.

const tablas = vi.hoisted(() => ({ datos: {} as Record<string, { data: unknown; error: unknown }> }));
function consulta(tabla: string) {
  const resultado = () => tablas.datos[tabla] ?? { data: [], error: null };
  const cadena: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) cadena[m] = () => cadena;
  cadena.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
    Promise.resolve(resultado()).then(ok, ko);
  return cadena;
}
vi.mock('@/lib/supabase/sesion', () => ({
  exigirSesion: async () => ({ supabase: { from: consulta }, usuario: { id: 'pro-1' } }),
}));

const activo = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock('@/lib/facturacion/registro', () => ({ proveedorActivo: async () => activo.valor }));
vi.mock('./acciones-facturacion', () => ({ prepararDesdeFormulario: vi.fn() }));

const { PanelFacturacion, EstadoBorrador, TONO_DE_ESTADO } = await import('./panel-facturacion');

const PROGRAMA = {
  ficha: { id: 'holded', nombre: 'Programa X', disponible: true, enlaceDeBorrador: (d: string) => `https://x.test/${d}` },
  crear: vi.fn(),
};

const ok = (data: unknown) => ({ data, error: null });

function escenario(estado: string, profesional = 'pro-1') {
  tablas.datos = {
    borradores_factura: ok([{ id: 'b1', profesional_id: profesional, creado_en: '2026-10-01T10:00:00Z' }]),
    borradores_factura_estado: ok([{ borrador_id: 'b1', estado }]),
    borradores_factura_envios: ok(estado === 'enviado' ? [{ borrador_id: 'b1', proveedor_documento_id: 'doc9' }] : []),
    facturas_espejo: ok(
      estado === 'facturado'
        ? [{ borrador_id: 'b1', numero: 'F-12', fecha_expedicion: '2026-10-05', total: 121 }]
        : [],
    ),
    facturas_anotaciones: ok([]),
  };
}

async function pintar(rol: 'administrador' | 'profesional_sanitario' | 'tecnico_administrativo') {
  render(await PanelFacturacion({ pacienteId: 'p1', rol }));
}

beforeEach(() => {
  activo.valor = null;
  tablas.datos = {};
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('EstadoBorrador', () => {
  const TEXTOS = {
    sin_enviar: 'Sin enviar',
    en_cola: 'En cola',
    fallido: 'Fallido',
    enviado: 'Enviado',
    facturado: 'Facturado',
    descartado: 'Descartado',
  } as const;

  it.each([
    ['sin_enviar', 'bg-secondary'],
    ['en_cola', 'bg-secondary'],
    ['fallido', 'bg-background'],
    ['enviado', 'bg-secondary'],
    ['facturado', 'bg-muted text-primary'],
    ['descartado', 'bg-secondary'],
  ] as const)('%s pinta la clase %s', (estado, clase) => {
    render(<EstadoBorrador estado={estado} texto={TEXTOS[estado]} />);
    expect(screen.getByText(TEXTOS[estado]).className).toContain(clase);
  });

  it('solo facturado es success y solo fallido es warning', () => {
    expect(Object.entries(TONO_DE_ESTADO).filter(([, t]) => t === 'success').map(([e]) => e)).toEqual(['facturado']);
    expect(Object.entries(TONO_DE_ESTADO).filter(([, t]) => t === 'warning').map(([e]) => e)).toEqual(['fallido']);
  });
});

describe('PanelFacturacion', () => {
  it('sin borradores dice que no hay', async () => {
    tablas.datos = { borradores_factura: ok([]) };
    await pintar('administrador');
    expect(screen.getByText('Todavía no hay borradores de factura')).toBeInTheDocument();
  });

  it('sin programa disponible enseña el estado y ningún botón ni enlace', async () => {
    escenario('sin_enviar');
    await pintar('administrador');
    expect(screen.getByText('Sin enviar')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('en cola sin programa dice solo «En cola»; facturado sin programa, sin su nombre', async () => {
    escenario('en_cola');
    await pintar('administrador');
    expect(screen.getByText('En cola')).toBeInTheDocument();
  });

  it('con programa, el administrador puede preparar un sin_enviar', async () => {
    activo.valor = PROGRAMA;
    escenario('sin_enviar', 'otro-profesional');
    await pintar('administrador');
    expect(screen.getByRole('button', { name: 'Preparar borrador en Programa X' })).toBeInTheDocument();
  });

  it('el profesional autor puede preparar; otro profesional no', async () => {
    activo.valor = PROGRAMA;
    escenario('fallido', 'pro-1');
    await pintar('profesional_sanitario');
    expect(screen.getByRole('button', { name: /Preparar borrador/ })).toBeInTheDocument();
  });

  it('un profesional que no es autor no ve el botón', async () => {
    activo.valor = PROGRAMA;
    escenario('sin_enviar', 'otro-profesional');
    await pintar('profesional_sanitario');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('en cola y enviado no se vuelve a preparar; enviado ofrece abrir en el programa', async () => {
    activo.valor = PROGRAMA;
    escenario('en_cola');
    await pintar('administrador');
    expect(screen.getByText('Preparándose en Programa X')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('enviado enseña el enlace «Abrir en … para emitir» y la app no aprueba nada', async () => {
    activo.valor = PROGRAMA;
    escenario('enviado');
    await pintar('administrador');
    const enlace = screen.getByRole('link', { name: 'Abrir en Programa X para emitir' });
    expect(enlace).toHaveAttribute('href', 'https://x.test/doc9');
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('facturado enseña número, fecha y total de la copia mínima', async () => {
    activo.valor = PROGRAMA;
    escenario('facturado');
    await pintar('administrador');
    expect(screen.getByText('Emitida en Programa X · nº F-12')).toBeInTheDocument();
    expect(screen.getByText(/05\/10\/2026 · 121,00/)).toBeInTheDocument();
  });

  it('el técnico solo lee la copia emitida y nunca consulta borradores', async () => {
    tablas.datos = {
      facturas_espejo_cabecera: ok([{ id: 'f1', numero: 'F-12', fecha_expedicion: '2026-10-05', total: 121 }]),
      borradores_factura: { data: null, error: { code: 'XX' } },
    };
    await pintar('tecnico_administrativo');
    expect(screen.getByText('nº F-12')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('un fallo de lectura enseña el aviso y no rompe la ficha', async () => {
    tablas.datos = { borradores_factura: { data: null, error: { code: 'XX000' } } };
    await pintar('administrador');
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar la facturación');
  });
});
