import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n';

import { leerBono } from './estado';
import {
  TAMANO_PAGINA_BONOS,
  filtrarBonos,
  ordenarBonos,
  paginarBonos,
  pildoraDeEstado,
  textoExcedidas,
  textoQuedan,
  type FilaDeBono,
} from './presentacion';

const HOY = '2026-10-14';
const PRO_A = 'a0000000-0000-4000-8000-000000000001';
const PRO_B = 'a0000000-0000-4000-8000-000000000002';

function fila(id: string, paciente: string, apellidos: string, totales: number, consumidas: number, extra: Partial<FilaDeBono> = {}): FilaDeBono {
  return {
    bonoId: id,
    pacienteId: paciente,
    nombre: 'N',
    apellidos,
    profesionalId: PRO_A,
    creadoEn: '2026-10-01T10:00:00Z',
    lectura: leerBono({ sesionesTotales: totales, sesionesConsumidas: consumidas, caducidad: null }, HOY),
    ...extra,
  };
}

describe('filtrarBonos', () => {
  const bonos = [
    fila('1', 'p1', 'Gil', 5, 2),
    fila('2', 'p2', 'Ruiz', 5, 5, { profesionalId: PRO_B }),
    fila('3', 'p1', 'Gil', 3, 1),
  ];

  it('sin filtro devuelve todo', () => {
    expect(filtrarBonos(bonos, { estado: null, profesional: null, paciente: null })).toHaveLength(3);
  });

  it('por estado, profesional y paciente, y combinados estrechan', () => {
    expect(filtrarBonos(bonos, { estado: 'agotado', profesional: null, paciente: null }).map((b) => b.bonoId)).toEqual(['2']);
    expect(filtrarBonos(bonos, { estado: null, profesional: PRO_B, paciente: null }).map((b) => b.bonoId)).toEqual(['2']);
    expect(filtrarBonos(bonos, { estado: null, profesional: null, paciente: 'p1' }).map((b) => b.bonoId)).toEqual(['1', '3']);
    expect(filtrarBonos(bonos, { estado: 'vigente', profesional: PRO_B, paciente: null })).toEqual([]);
  });
});

describe('ordenarBonos', () => {
  it('apellidos, nombre y, del mismo paciente, el más reciente primero', () => {
    const lista = [
      fila('1', 'p2', 'Ruiz', 5, 0),
      fila('2', 'p1', 'Álvarez', 5, 0, { creadoEn: '2026-09-01T10:00:00Z' }),
      fila('3', 'p1', 'Álvarez', 5, 0, { creadoEn: '2026-10-05T10:00:00Z' }),
    ];
    expect(ordenarBonos(lista).map((b) => b.bonoId)).toEqual(['3', '2', '1']);
  });
});

describe('paginarBonos', () => {
  const muchos = Array.from({ length: 120 }, (_, i) => i);

  it('50 por página, con el rango de la página', () => {
    expect(TAMANO_PAGINA_BONOS).toBe(50);
    const p2 = paginarBonos(muchos, 2);
    expect(p2).toMatchObject({ pagina: 2, ultima: 3, total: 120 });
    expect(p2.filas[0]).toBe(50);
    expect(p2.filas).toHaveLength(50);
  });

  it('una página que pasa de la última cae en la última; sin filas hay una página', () => {
    expect(paginarBonos(muchos, 999).filas).toHaveLength(20);
    expect(paginarBonos([], 5)).toMatchObject({ pagina: 1, ultima: 1, total: 0, filas: [] });
  });
});

describe('textos', () => {
  it('las píldoras: vigente verde, agotado info, caducado ámbar; ninguna roja', () => {
    expect(pildoraDeEstado('vigente')).toEqual({ tono: 'success', texto: t('bonos.estado.vigente') });
    expect(pildoraDeEstado('agotado')).toEqual({ tono: 'info', texto: t('bonos.estado.agotado') });
    expect(pildoraDeEstado('caducado')).toEqual({ tono: 'warning', texto: t('bonos.estado.caducado') });
  });

  it('quedan: plural, singular y ninguna', () => {
    expect(textoQuedan(3)).toBe('Quedan 3 sesiones');
    expect(textoQuedan(1)).toBe('Queda 1 sesión');
    expect(textoQuedan(0)).toBe('No quedan sesiones');
  });

  it('excedidas: nada con 0, singular y plural', () => {
    expect(textoExcedidas(0)).toBeNull();
    expect(textoExcedidas(1)).toBe('Se ha hecho 1 sesión más de las del bono.');
    expect(textoExcedidas(2)).toBe('Se han hecho 2 sesiones más de las del bono.');
  });
});
