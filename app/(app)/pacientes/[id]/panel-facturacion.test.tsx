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
vi.mock('./acciones-facturacion', () => ({ prepararBorradorEnProveedor: vi.fn() }));

const { PanelFacturacion, EstadoBorrador, TONO_DE_ESTADO } = await import('./panel-facturacion');

const PROGRAMA = {
  ficha: { id: 'holded', nombre: 'Programa X', disponible: true, enlaceDeBorrador: (d: string) => `https://x.test/${d}` },
  crear: vi.fn(),
};

const ok = (data: unknown) => ({ data, error: null });

function escenario(
  estado: string,
  profesional = 'pro-1',
  extra: { ambiguo?: boolean; anotaciones?: string[] } = {},
) {
  tablas.datos = {
    borradores_factura: ok([{ id: 'b1', profesional_id: profesional, creado_en: '2026-10-01T10:00:00Z' }]),
    borradores_factura_estado: ok([{ borrador_id: 'b1', estado, envio_ambiguo: extra.ambiguo ?? false }]),
    borradores_factura_envios: ok(
      estado === 'enviado' || estado === 'facturado'
        ? [{ borrador_id: 'b1', proveedor_documento_id: 'doc9' }]
        : [],
    ),
    facturas_espejo: ok(
      estado === 'facturado'
        ? [
            {
              borrador_id: 'b1',
              numero: 'F-12',
              fecha_expedicion: '2026-10-05',
              total: 121,
              url_proveedor: 'https://x.test/factura/12',
            },
          ]
        : [],
    ),
    facturas_anotaciones: ok((extra.anotaciones ?? []).map((tipo) => ({ borrador_id: 'b1', tipo }))),
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

  it('facturado enseña «Emitida en {programa}», número, fecha y total, y un enlace a la factura', async () => {
    activo.valor = PROGRAMA;
    escenario('facturado');
    await pintar('administrador');
    expect(screen.getByText('Emitida en Programa X')).toBeInTheDocument();
    expect(screen.getByText(/nº F-12 · 05\/10\/2026 · 121,00/)).toBeInTheDocument();
    const enlace = screen.getByRole('link', { name: 'Ver en Programa X' });
    expect(enlace).toHaveAttribute('href', 'https://x.test/factura/12');
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('facturado sin programa lo dice sin nombrarlo y conserva número y enlace', async () => {
    escenario('facturado');
    await pintar('administrador');
    expect(screen.getByText('Emitida en el programa de facturación')).toBeInTheDocument();
    expect(screen.getByText(/nº F-12/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver en el programa de facturación' })).toHaveAttribute(
      'href',
      'https://x.test/factura/12',
    );
  });

  it('fallido dice que no se pudo preparar y ofrece Preparar', async () => {
    activo.valor = PROGRAMA;
    escenario('fallido');
    await pintar('administrador');
    expect(screen.getByText('No se pudo preparar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preparar borrador en Programa X' })).toBeInTheDocument();
  });

  it('fallido ambiguo avisa de comprobar en el programa antes de volver a preparar, y deja preparar', async () => {
    activo.valor = PROGRAMA;
    escenario('fallido', 'pro-1', { ambiguo: true });
    await pintar('administrador');
    expect(
      screen.getByText('Comprueba en Programa X si el borrador llegó antes de volver a prepararlo'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No se pudo preparar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Preparar borrador en Programa X' })).toBeInTheDocument();
  });

  it('descartado se dice y no ofrece Preparar', async () => {
    activo.valor = PROGRAMA;
    escenario('descartado');
    await pintar('administrador');
    expect(screen.getByText('Descartado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    ['borrado_sin_aprobar', 'Borrador borrado en Programa X', 'enviado'],
    ['rectificado', 'Rectificada en Programa X', 'facturado'],
    ['anulado', 'Anulada en Programa X', 'facturado'],
  ] as const)('la anotación %s sale como pastilla', async (tipo, texto, estado) => {
    activo.valor = PROGRAMA;
    escenario(estado, 'pro-1', { anotaciones: [tipo] });
    await pintar('administrador');
    expect(screen.getByText(texto).className).toContain('rounded-full');
  });

  it('las anotaciones se ven también sin programa conectado', async () => {
    escenario('enviado', 'pro-1', { anotaciones: ['borrado_sin_aprobar'] });
    await pintar('administrador');
    expect(screen.getByText('Borrador borrado en el programa de facturación')).toBeInTheDocument();
  });

  it('un borrador borrado sin aprobar no ofrece abrirlo en el programa', async () => {
    activo.valor = PROGRAMA;
    escenario('enviado', 'pro-1', { anotaciones: ['borrado_sin_aprobar'] });
    await pintar('administrador');
    expect(screen.queryByRole('link')).toBeNull();
  });

  const CABECERA = {
    facturas_espejo_cabecera: ok([
      {
        id: 'f1',
        numero: 'F-12',
        fecha_expedicion: '2026-10-05',
        total: 121,
        url_proveedor: 'https://x.test/factura/12',
      },
    ]),
    borradores_factura: { data: null, error: { code: 'XX' } },
  };

  it('el técnico solo lee la copia emitida y nunca consulta borradores', async () => {
    activo.valor = PROGRAMA;
    tablas.datos = CABECERA;
    await pintar('tecnico_administrativo');
    expect(screen.getByText('Emitidas en Programa X')).toBeInTheDocument();
    expect(screen.getByText('nº F-12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver en Programa X' })).toHaveAttribute(
      'href',
      'https://x.test/factura/12',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('el técnico sin programa ve «Emitidas», no «Borradores»', async () => {
    tablas.datos = CABECERA;
    await pintar('tecnico_administrativo');
    expect(screen.getByText('Emitidas')).toBeInTheDocument();
    expect(screen.queryByText('Borradores')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver en el programa de facturación' })).toBeInTheDocument();
  });

  it('un fallo de lectura enseña el aviso y no rompe la ficha', async () => {
    tablas.datos = { borradores_factura: { data: null, error: { code: 'XX000' } } };
    await pintar('administrador');
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar la facturación');
  });
});
