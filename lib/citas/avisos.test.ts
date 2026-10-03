import { describe, expect, it, vi } from 'vitest';

import { leerAvisos, leerNotificaciones, leerRecuentoNotas, leerSesionesPropias } from './avisos';
import type { Sesion } from './tipos';

/**
 * Doble mínimo del cliente de Supabase. No hay base aquí: la RLS de estas lecturas la prueban
 * `scripts/rls/22-avisos.sql` y `18-agenda-rango.sql`. Lo que se prueba es lo que hace cada
 * lector con un error: devolver `null`, nunca ceros ni listas vacías que parezcan «no hay nada»
 * (T-015, R2.1.2: el Route Handler responde 503 y el cliente conserva lo que tenía).
 */
type Respuesta = { data: unknown; error: unknown };

function consulta(respuesta: Respuesta) {
  const cadena: Record<string, unknown> = {};
  for (const metodo of ['select', 'is', 'not', 'order', 'limit', 'eq']) cadena[metodo] = vi.fn(() => cadena);
  cadena.maybeSingle = () => Promise.resolve(respuesta);
  cadena.then = (resolver: (r: Respuesta) => unknown) => Promise.resolve(respuesta).then(resolver);
  return cadena;
}

const OK_VACIO: Respuesta = { data: [], error: null };
const ERROR_BD: Respuesta = { data: null, error: { message: 'caída' } };

function sesionFalsa({
  noLeidas = OK_VACIO,
  leidas = OK_VACIO,
  organizacion = { data: { zona_horaria: 'Europe/Madrid' }, error: null },
  rpc = {},
}: {
  noLeidas?: Respuesta;
  leidas?: Respuesta;
  organizacion?: Respuesta;
  rpc?: Record<string, Respuesta>;
} = {}) {
  // `notificaciones` se consulta dos veces: la primera con `.is(...)` (no leídas) y la segunda
  // con `.not(...)` (leídas). El doble reparte por orden de llamada.
  let llamadasNotificaciones = 0;
  const from = vi.fn((tabla: string) => {
    if (tabla === 'organizacion') return consulta(organizacion);
    llamadasNotificaciones += 1;
    return consulta(llamadasNotificaciones === 1 ? noLeidas : leidas);
  });
  const llamadaRpc = vi.fn((nombre: string) => Promise.resolve(rpc[nombre] ?? { data: null, error: null }));
  const sesion = {
    supabase: { from, rpc: llamadaRpc } as unknown as Sesion['supabase'],
    usuario: { id: 'u1' } as unknown as Sesion['usuario'],
  };
  return sesion;
}

const AHORA = new Date('2026-10-01T10:00:00.000Z');

const FILA_CITA = {
  id: 'c1',
  paciente_id: 'p1',
  profesional_id: 'u1',
  centro_id: null,
  serie_id: null,
  inicio: '2026-10-01T09:30:00+00:00',
  fin: '2026-10-01T10:20:00+00:00',
  zona_horaria: 'Europe/Madrid',
  estado: 'programada',
  sala: null,
  desviada: false,
  motivo_desviacion: null,
  tipo_terapia_nombre: null,
  nota_operativa: null,
  paciente_nombre: 'Ana',
  paciente_apellidos: 'Pérez',
  profesional_nombre: null,
  centro_nombre: null,
  en_curso: true,
};

describe('leerNotificaciones', () => {
  it('da la lista, las no leídas primero', async () => {
    const noLeida = { id: 'n1', tipo: 't', titulo: null, detalle: 'a', creado_en: '2026-10-01T08:00:00Z', leida_en: null };
    const leida = { ...noLeida, id: 'n2', leida_en: '2026-10-01T09:00:00Z' };
    const r = await leerNotificaciones(
      sesionFalsa({ noLeidas: { data: [noLeida], error: null }, leidas: { data: [leida], error: null } }),
    );
    expect(r?.map((n) => [n.id, n.leida])).toEqual([
      ['n1', false],
      ['n2', true],
    ]);
  });

  it('una lista vacía legítima es [], no null', async () => {
    expect(await leerNotificaciones(sesionFalsa())).toEqual([]);
  });

  it('null si falla la lectura de las no leídas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await leerNotificaciones(sesionFalsa({ noLeidas: ERROR_BD }))).toBeNull();
  });

  it('null si falla la lectura de las leídas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await leerNotificaciones(sesionFalsa({ leidas: ERROR_BD }))).toBeNull();
  });
});

describe('leerRecuentoNotas', () => {
  it('da los tres niveles', async () => {
    const sesion = sesionFalsa({
      rpc: { recuento_notas_pendientes: { data: [{ nivel1: 1, nivel2: 2, nivel3: 3 }], error: null } },
    });
    expect(await leerRecuentoNotas(sesion)).toEqual({ nivel1: 1, nivel2: 2, nivel3: 3 });
  });

  it('null si la función falla (no ceros inventados)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sesion = sesionFalsa({ rpc: { recuento_notas_pendientes: ERROR_BD } });
    expect(await leerRecuentoNotas(sesion)).toBeNull();
  });

  it('null si no devuelve fila', async () => {
    const sesion = sesionFalsa({ rpc: { recuento_notas_pendientes: { data: [], error: null } } });
    expect(await leerRecuentoNotas(sesion)).toBeNull();
  });
});

describe('leerSesionesPropias', () => {
  it('da las sesiones propias no canceladas', async () => {
    const sesion = sesionFalsa({
      rpc: {
        agenda_citas_rango: {
          data: [
            FILA_CITA,
            { ...FILA_CITA, id: 'c2', estado: 'cancelada' },
            { ...FILA_CITA, id: 'c3', profesional_id: 'otro' },
          ],
          error: null,
        },
      },
    });
    const r = await leerSesionesPropias(sesion, AHORA);
    expect(r?.map((s) => s.citaId)).toEqual(['c1']);
  });

  it('null si la agenda falla', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sesion = sesionFalsa({ rpc: { agenda_citas_rango: ERROR_BD } });
    expect(await leerSesionesPropias(sesion, AHORA)).toBeNull();
  });
});

describe('leerAvisos', () => {
  it('junta las tres lecturas con el instante del servidor', async () => {
    const sesion = sesionFalsa({
      rpc: {
        agenda_citas_rango: { data: [FILA_CITA], error: null },
        recuento_notas_pendientes: { data: [{ nivel1: 0, nivel2: 1, nivel3: 0 }], error: null },
      },
    });
    const r = await leerAvisos(sesion, AHORA);
    expect(r.ahoraServidor).toBe('2026-10-01T10:00:00.000Z');
    expect(r.sesiones).toHaveLength(1);
    expect(r.recuento).toEqual({ nivel1: 0, nivel2: 1, nivel3: 0 });
    expect(r.notificaciones).toEqual([]);
  });

  it('deja pasar cada null tal cual: quien llama decide si es 503 o un valor por defecto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sesion = sesionFalsa({
      noLeidas: ERROR_BD,
      rpc: { agenda_citas_rango: ERROR_BD, recuento_notas_pendientes: ERROR_BD },
    });
    const r = await leerAvisos(sesion, AHORA);
    expect(r.sesiones).toBeNull();
    expect(r.recuento).toBeNull();
    expect(r.notificaciones).toBeNull();
  });
});
