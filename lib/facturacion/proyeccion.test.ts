import { describe, expect, it } from 'vitest';

import { conceptoGenerico } from './conceptos';
import { PROYECCION_VERSION, proyectarBorrador } from './proyeccion';
import type { FilaReclamada } from './cola';

function fila(extra: Record<string, unknown> = {}, lineas: unknown[] | null = null): FilaReclamada {
  return {
    evento_id: 'e1',
    borrador_id: 'b1',
    version_id: 'v1',
    numero_version: 1,
    destinatario_nombre: 'Ana Uno',
    destinatario_nif_cifrado: null,
    destinatario_nif_nonce: null,
    destinatario_nif_etiqueta: null,
    destinatario_nif_clave_version: null,
    lineas: (lineas ?? [
      {
        cantidad: 2,
        precio_unitario_centimos: 6000,
        regimen_iva: 'exento_sanitario',
        tipo_iva_centesimas: 0,
      },
      {
        cantidad: 1,
        precio_unitario_centimos: 10000,
        regimen_iva: 'general',
        tipo_iva_centesimas: 2100,
      },
    ]) as FilaReclamada['lineas'],
    fecha_documento: '2026-10-14',
    ya_enviado_documento_id: null,
    ...extra,
  } as FilaReclamada;
}

describe('proyectarBorrador', () => {
  it('la versión de la proyección es 1', () => {
    expect(PROYECCION_VERSION).toBe(1);
  });

  it('construye el borrador con el concepto genérico por régimen', () => {
    const p = proyectarBorrador(fila(), '12345678Z');
    expect(p).toEqual({
      destinatario: { nombre: 'Ana Uno', nif: '12345678Z' },
      fecha: '2026-10-14',
      lineas: [
        {
          concepto: conceptoGenerico('exento_sanitario'),
          cantidad: 2,
          precioUnitarioCentimos: 6000,
          regimenIva: 'exento_sanitario',
          tipoIvaCentesimas: 0,
        },
        {
          concepto: conceptoGenerico('general'),
          cantidad: 1,
          precioUnitarioCentimos: 10000,
          regimenIva: 'general',
          tipoIvaCentesimas: 2100,
        },
      ],
    });
    expect(conceptoGenerico('exento_sanitario')).toBe('Sesión de psicología');
    expect(conceptoGenerico('general')).toBe('Servicios profesionales de psicología');
  });

  it('un destinatario sin NIF lleva nif null', () => {
    expect(proyectarBorrador(fila(), null).destinatario.nif).toBeNull();
  });

  it('lista blanca: una entrada contaminada en la raíz y en las líneas no se cuela', () => {
    const sucia = fila(
      {
        cita_id: 'c-secreto',
        concepto: 'Terapia de ansiedad de Ana',
        diagnostico: 'F41.1',
        notas: 'texto clínico',
      },
      [
        {
          cantidad: 1,
          precio_unitario_centimos: 6000,
          regimen_iva: 'exento_sanitario',
          tipo_iva_centesimas: 0,
          concepto: 'Sesión 12 con Ana: ansiedad',
          cita_id: 'c-secreto',
          diagnostico: 'F41.1',
        },
      ],
    );
    const p = proyectarBorrador(sucia, null);
    expect(Object.keys(p).sort()).toEqual(['destinatario', 'fecha', 'lineas']);
    expect(Object.keys(p.destinatario).sort()).toEqual(['nif', 'nombre']);
    expect(Object.keys(p.lineas[0]).sort()).toEqual([
      'cantidad',
      'concepto',
      'precioUnitarioCentimos',
      'regimenIva',
      'tipoIvaCentesimas',
    ]);
    expect(p.lineas[0].concepto).toBe('Sesión de psicología');
    const texto = JSON.stringify(p);
    for (const prohibido of ['c-secreto', 'F41.1', 'ansiedad', 'texto clínico']) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it('no muta la entrada', () => {
    const entrada = fila();
    const antes = JSON.stringify(entrada);
    proyectarBorrador(entrada, null);
    expect(JSON.stringify(entrada)).toBe(antes);
  });

  it('sin líneas lanza', () => {
    expect(() => proyectarBorrador(fila({}, []), null)).toThrow();
  });

  it('una cantidad que no es entera positiva lanza', () => {
    for (const cantidad of [0, -1, 1.5]) {
      expect(() =>
        proyectarBorrador(
          fila({}, [
            {
              cantidad,
              precio_unitario_centimos: 100,
              regimen_iva: 'general',
              tipo_iva_centesimas: 2100,
            },
          ]),
          null,
        ),
      ).toThrow();
    }
  });

  it('un precio que no es un entero en céntimos lanza', () => {
    expect(() =>
      proyectarBorrador(
        fila({}, [
          {
            cantidad: 1,
            precio_unitario_centimos: 10.5,
            regimen_iva: 'general',
            tipo_iva_centesimas: 2100,
          },
        ]),
        null,
      ),
    ).toThrow();
  });

  it('un régimen desconocido lanza', () => {
    expect(() =>
      proyectarBorrador(
        fila({}, [
          {
            cantidad: 1,
            precio_unitario_centimos: 100,
            regimen_iva: 'raro',
            tipo_iva_centesimas: 0,
          },
        ]),
        null,
      ),
    ).toThrow();
  });
});
