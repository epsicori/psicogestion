import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ListaAvisos } from './lista-avisos';

type Fila = { id: string; tipo: string; detalle: string; creado_en: string; leida_en: string | null };

function sesionFingida(
  filas: Fila[],
  zona: string | null = 'Europe/Madrid',
  errorLectura: { code: string } | null = null,
) {
  const consultas: { tabla: string; columnas?: string; en?: [string, string[]]; orden?: unknown; limite?: number }[] = [];
  const from = vi.fn((tabla: string) => {
    const consulta: (typeof consultas)[number] = { tabla };
    consultas.push(consulta);
    if (tabla === 'organizacion') {
      return {
        select: () => ({ maybeSingle: async () => ({ data: zona === null ? null : { zona_horaria: zona }, error: null }) }),
      };
    }
    const cadena = {
      select(columnas: string) {
        consulta.columnas = columnas;
        return cadena;
      },
      in(columna: string, valores: string[]) {
        consulta.en = [columna, valores];
        return cadena;
      },
      order(columna: string, opciones: unknown) {
        consulta.orden = [columna, opciones];
        return cadena;
      },
      async limit(n: number) {
        consulta.limite = n;
        return errorLectura ? { data: null, error: errorLectura } : { data: filas, error: null };
      },
    };
    return cadena;
  });
  return { sesion: { supabase: { from } } as never, consultas };
}

const LEIDA: Fila = {
  id: '1',
  tipo: 'codigos_regenerados',
  detalle: 'Se han generado códigos nuevos.',
  creado_en: '2026-10-03T10:15:00+00:00',
  leida_en: '2026-10-03T11:00:00+00:00',
};
const SIN_LEER: Fila = {
  id: '2',
  tipo: 'regeneracion_codigos_bloqueada',
  detalle: 'Intentos agotados.',
  creado_en: '2026-10-02T21:30:00+00:00',
  leida_en: null,
};

describe('ListaAvisos (T-038)', () => {
  it('lee solo los cuatro tipos de seguridad, del más reciente al más antiguo, con tope de 50', async () => {
    const { sesion, consultas } = sesionFingida([LEIDA]);

    render(await ListaAvisos({ sesion }));

    const lectura = consultas.find((c) => c.tabla === 'notificaciones')!;
    expect(lectura.columnas).toBe('id, tipo, detalle, creado_en, leida_en');
    expect(lectura.en).toEqual([
      'tipo',
      ['codigos_regenerados', 'regeneracion_codigos_bloqueada', 'totp_repuesto', 'pin_bloqueado'],
    ]);
    expect(lectura.orden).toEqual(['creado_en', { ascending: false }]);
    expect(lectura.limite).toBe(50);
  });

  it('enseña los avisos LEÍDOS igual que los no leídos, con tipo, detalle y fecha en la zona de la organización', async () => {
    const { sesion } = sesionFingida([LEIDA, SIN_LEER]);

    render(await ListaAvisos({ sesion }));

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Códigos de recuperación nuevos');
    expect(items[0]).toHaveTextContent('Se han generado códigos nuevos.');
    // 10:15 UTC → 12:15 en Madrid (CEST).
    expect(items[0]).toHaveTextContent('12:15');
    expect(items[1]).toHaveTextContent('Regeneración de códigos bloqueada');
    // 21:30 UTC del día 2 → 23:30 del mismo día en Madrid.
    expect(items[1]).toHaveTextContent('23:30');
  });

  it('con la zona de la organización nula usa Europe/Madrid', async () => {
    const { sesion } = sesionFingida([LEIDA], null);

    render(await ListaAvisos({ sesion }));

    expect(screen.getByRole('listitem')).toHaveTextContent('12:15');
  });

  it('el encabezado tiene el id que recibe el foco tras «Ya los he guardado» y es enfocable por programa', async () => {
    const { sesion } = sesionFingida([LEIDA]);

    render(await ListaAvisos({ sesion }));

    const titulo = screen.getByRole('heading', { name: 'Avisos de seguridad' });
    expect(titulo).toHaveAttribute('id', 'avisos-seguridad-titulo');
    expect(titulo).toHaveAttribute('tabindex', '-1');
  });

  it('sin avisos dice que no hay y no pinta lista vacía', async () => {
    const { sesion } = sesionFingida([]);

    render(await ListaAvisos({ sesion }));

    expect(screen.getByText('No hay avisos de seguridad.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('B-H3 · un fallo de lectura se dice como fallo, nunca como lista vacía', async () => {
    const { sesion } = sesionFingida([], 'Europe/Madrid', { code: 'XX000' });
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(await ListaAvisos({ sesion }));

    expect(
      screen.getByText('No se han podido cargar los avisos. Recarga la página para intentarlo de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No hay avisos de seguridad.')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    consola.mockRestore();
  });

  it('B-H11 · el no leído lleva una marca visible «Sin leer», el leído no', async () => {
    const { sesion } = sesionFingida([LEIDA, SIN_LEER]);

    render(await ListaAvisos({ sesion }));

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(screen.getAllByText('Sin leer')).toHaveLength(1);
    expect(within(items[1]).getByText('Sin leer')).toBeInTheDocument();
    expect(within(items[0]).queryByText('Sin leer')).toBeNull();
  });

  it('B-H5 · la hora sale en la zona de la organización (Canarias, no Madrid)', async () => {
    const { sesion } = sesionFingida([{ ...LEIDA, creado_en: '2026-10-03T10:00:00+00:00' }], 'Atlantic/Canary');

    render(await ListaAvisos({ sesion }));

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('11:00');
    expect(item).not.toHaveTextContent('12:00');
  });

  it('no escribe nada: no marca como leído (eso es de la campana)', async () => {
    const { sesion } = sesionFingida([SIN_LEER]);

    render(await ListaAvisos({ sesion }));

    expect(screen.queryByRole('button')).toBeNull();
  });
});
