// T-012 · Pruebas de `lib/notas/servidor.ts` con un cliente simulado que captura cada consulta.
//
// Lo que se prueba aquí es lo que NO puede probar el banco SQL: que la aplicación firma lo
// GUARDADO (no lo recibido), que sin motivo no llega a insertar, que el testigo viaja como la
// cadena que dio la base, y que cada rama de «cero filas» y de SQLSTATE dice lo que dice el
// §1.5 del diseño. El camino de punta a punta lo cierra `scripts/t012-nota.ts`.
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Sesion } from '@/lib/cuentas/tipos';
import type { Database } from '@/lib/supabase/tipos-bd';

import {
  abrirEditorDeNota,
  empezarModificacion,
  fijarCoprofesional,
  firmarNota,
  guardarBorrador,
} from './servidor';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // el usuario
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // otro profesional
const P = '99999999-9999-4999-8999-999999999999'; // paciente
const E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; // episodio
const N = '11111111-1111-4111-8111-111111111111'; // nota
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // cita
const TESTIGO = '2026-10-02T09:00:00.123456+00:00';
const CONTEXTO = { ip: null, agente: null };

type Llamada = {
  tabla: string;
  op: 'select' | 'insert' | 'update' | 'rpc';
  filtros: [string, unknown][];
  payload?: unknown;
  opciones?: unknown;
};
type Respuesta = { data?: unknown; error?: { code?: string; message: string } | null; count?: number | null };
type Responder = (l: Llamada) => Respuesta | undefined;

function clienteSimulado(responder: Responder) {
  const llamadas: Llamada[] = [];

  function constructor(tabla: string) {
    const llamada: Llamada = { tabla, op: 'select', filtros: [] };
    const resolver = () => {
      llamadas.push(llamada);
      const r = responder(llamada) ?? { data: null };
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
    };
    const b: Record<string, unknown> = {};
    const encadenar = (nombre: string, f?: (...a: unknown[]) => void) => {
      b[nombre] = (...a: unknown[]) => {
        f?.(...a);
        return b;
      };
    };
    encadenar('select', (_c, o) => {
      llamada.opciones = o;
    });
    encadenar('insert', (p) => {
      llamada.op = 'insert';
      llamada.payload = p;
    });
    encadenar('update', (p) => {
      llamada.op = 'update';
      llamada.payload = p;
    });
    for (const f of ['eq', 'is', 'neq', 'in']) {
      encadenar(f, (col, val) => llamada.filtros.push([`${f}:${String(col)}`, val]));
    }
    for (const f of ['order', 'limit']) encadenar(f);
    b.maybeSingle = resolver;
    b.single = resolver;
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => resolver().then(ok, ko);
    return b;
  }

  const cliente = {
    from: (tabla: string) => constructor(tabla),
    rpc: (nombre: string, args: unknown) => {
      const llamada: Llamada = { tabla: `rpc:${nombre}`, op: 'rpc', filtros: [], payload: args };
      llamadas.push(llamada);
      const r = responder(llamada) ?? { data: null };
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  } as unknown as SupabaseClient<Database>;

  const sesion: Sesion = { supabase: cliente, usuario: { id: A } as User };
  return { sesion, llamadas };
}

const cabecera = (extra: Record<string, unknown> = {}) => ({
  id: N,
  paciente_id: P,
  episodio_id: E,
  autor_id: A,
  fecha_sesion: '2026-10-02',
  cita_id: C,
  coprofesional_id: null,
  borrador_contenido: { texto: 'Se trabajó la ansiedad.', reservadas: '' },
  borrador_actualizado_en: TESTIGO,
  borrador_abierta_en: '2026-10-02T08:55:00.000001+00:00',
  ...extra,
});

/** Responde a todo lo que firmarNota necesita; cada prueba sobreescribe lo suyo. */
function firmaFeliz(sobrescribe: Responder = () => undefined, opciones: { versiones?: number } = {}): Responder {
  const versiones = opciones.versiones ?? 0;
  return (l) => {
    const propio = sobrescribe(l);
    if (propio) return propio;
    if (l.tabla === 'notas_clinicas' && l.op === 'select') return { data: cabecera() };
    if (l.tabla === 'citas') {
      return {
        data: {
          inicio: '2026-10-02T08:50:00.000Z',
          fin: '2026-10-02T09:40:00.000Z',
          centro_id: 'cen',
          zona_horaria: 'Europe/Madrid',
        },
      };
    }
    if (l.tabla === 'centros') return { data: { margen_sesion_minutos: null, zona_horaria: null } };
    if (l.tabla === 'organizacion') return { data: { margen_sesion_minutos: 15, zona_horaria: 'Europe/Madrid' } };
    if (l.tabla === 'notas_clinicas_versiones' && l.op === 'select') {
      return l.opciones && (l.opciones as { head?: boolean }).head
        ? { count: versiones }
        : { data: [] };
    }
    if (l.tabla === 'episodios_asistenciales') {
      return { data: { modalidad_relacional: 'individual', centro_id: 'cen', abierto_en: '2026-09-01T00:00:00Z' } };
    }
    if (l.tabla === 'episodio_participantes') return { count: 1 };
    if (l.tabla === 'notas_clinicas_versiones' && l.op === 'insert') {
      return { data: { id: 'v1', numero_version: versiones + 1, posicion_cadena: 1, huella: '\\xabcdef' } };
    }
    if (l.tabla === 'rpc:prolongar_desbloqueo') return { data: '2026-10-02T10:00:00Z' };
    return undefined;
  };
}

const inserciones = (llamadas: Llamada[]) =>
  llamadas.filter((l) => l.tabla === 'notas_clinicas_versiones' && l.op === 'insert');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('firmarNota · lo que decide antes de insertar', () => {
  const entrada = { pacienteId: P, notaId: N, testigo: TESTIGO, alcance: 'individual' as const, motivo: null };

  it('sin motivo y con versiones previas devuelve falta_motivo y NO inserta (criterio 5)', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz(() => undefined, { versiones: 1 }));
    const r = await firmarNota(sesion, entrada);
    expect(r).toEqual({ ok: false, motivo: 'falta_motivo' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('con motivo y versiones previas inserta una versión con ese motivo', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz(() => undefined, { versiones: 1 }));
    const r = await firmarNota(sesion, { ...entrada, motivo: 'Corrijo la fecha' });
    expect(r.ok).toBe(true);
    const [ins] = inserciones(llamadas);
    expect((ins!.payload as { motivo_cambio: string }).motivo_cambio).toBe('Corrijo la fecha');
  });

  it('en la v1 el motivo se ignora aunque llegue: motivo_cambio es null', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz());
    await firmarNota(sesion, { ...entrada, motivo: 'no debería constar' });
    const [ins] = inserciones(llamadas);
    expect((ins!.payload as { motivo_cambio: unknown }).motivo_cambio).toBeNull();
  });

  it('el mismo borrador en NFD y en NFC produce el mismo contenido_canonico (criterio 6)', async () => {
    const nfc = 'Cuéntame más de la niñez';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);

    const capturar = async (texto: string) => {
      const { sesion, llamadas } = clienteSimulado(
        firmaFeliz((l) =>
          l.tabla === 'notas_clinicas' && l.op === 'select'
            ? { data: cabecera({ borrador_contenido: { texto, reservadas: '' } }) }
            : undefined,
        ),
      );
      // El mismo instante en las dos: la huella depende de `creada_en`.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-02T09:10:00.000Z'));
      try {
        await firmarNota(sesion, entrada);
      } finally {
        vi.useRealTimers();
      }
      return (inserciones(llamadas)[0]!.payload as { contenido_canonico: string }).contenido_canonico;
    };

    expect(await capturar(nfd)).toBe(await capturar(nfc));
  });

  it('firma lo GUARDADO: el texto sellado es el del borrador releído', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz());
    await firmarNota(sesion, entrada);
    const canonico = (inserciones(llamadas)[0]!.payload as { contenido_canonico: string }).contenido_canonico;
    expect(JSON.parse(canonico).cuerpo).toEqual({ texto: 'Se trabajó la ansiedad.' });
  });

  it('reservadas vacías se sellan como null y las no vacías, tal cual (criterio 7)', async () => {
    const con = clienteSimulado(
      firmaFeliz((l) =>
        l.tabla === 'notas_clinicas' && l.op === 'select'
          ? { data: cabecera({ borrador_contenido: { texto: 'x', reservadas: 'sólo yo' } }) }
          : undefined,
      ),
    );
    await firmarNota(con.sesion, entrada);
    expect(JSON.parse((inserciones(con.llamadas)[0]!.payload as { contenido_canonico: string }).contenido_canonico).anotaciones_reservadas).toBe('sólo yo');

    const sin = clienteSimulado(firmaFeliz());
    await firmarNota(sin.sesion, entrada);
    expect(JSON.parse((inserciones(sin.llamadas)[0]!.payload as { contenido_canonico: string }).contenido_canonico).anotaciones_reservadas).toBeNull();
  });

  it('alcance conjunta se rebaja a individual si el episodio no admite conjunta', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz());
    await firmarNota(sesion, { ...entrada, alcance: 'conjunta' });
    expect((inserciones(llamadas)[0]!.payload as { alcance: string }).alcance).toBe('individual');
  });

  it('alcance conjunta se respeta si la modalidad no es individual y hay más de un participante', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'episodios_asistenciales') {
          return { data: { modalidad_relacional: 'pareja', centro_id: 'cen', abierto_en: '2026-09-01T00:00:00Z' } };
        }
        if (l.tabla === 'episodio_participantes') return { count: 2 };
        return undefined;
      }),
    );
    await firmarNota(sesion, { ...entrada, alcance: 'conjunta' });
    expect((inserciones(llamadas)[0]!.payload as { alcance: string }).alcance).toBe('conjunta');
  });

  it.each([
    ['sin fila (candado o sin acceso)', () => ({ data: null }), 'bloqueada'],
    ['de otro autor', () => ({ data: cabecera({ autor_id: B }) }), 'no_autor'],
    ['de otro paciente', () => ({ data: cabecera({ paciente_id: B }) }), 'no_disponible'],
    ['sin borrador (doble pulsación tras firmar)', () => ({ data: cabecera({ borrador_contenido: null }) }), 'sin_borrador'],
    ['con testigo distinto', () => ({ data: cabecera({ borrador_actualizado_en: '2026-10-02T09:00:00.999999+00:00' }) }), 'conflicto'],
    ['con texto en blanco', () => ({ data: cabecera({ borrador_contenido: { texto: '  \n ', reservadas: '' } }) }), 'vacia'],
  ])('cabecera %s → %s, sin insertar', async (_nombre, cab, motivo) => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'notas_clinicas' && l.op === 'select' ? cab() : undefined)),
    );
    const r = await firmarNota(sesion, entrada);
    expect(r).toEqual({ ok: false, motivo });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('una cita que no se puede leer ABORTA (no firma como si no hubiera cita)', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'citas' ? { data: null } : undefined)),
    );
    const r = await firmarNota(sesion, entrada);
    expect(r).toEqual({ ok: false, motivo: 'cita_ilegible' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('un margen que no se puede leer ABORTA', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'organizacion' ? { data: null } : undefined)),
    );
    const r = await firmarNota(sesion, entrada);
    expect(r).toEqual({ ok: false, motivo: 'cita_ilegible' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('usa el margen del centro si lo tiene y el de la organización si no', async () => {
    const conCentro = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'centros' ? { data: { margen_sesion_minutos: 30 } } : undefined)),
    );
    await firmarNota(conCentro.sesion, entrada);
    expect(
      JSON.parse((inserciones(conCentro.llamadas)[0]!.payload as { contenido_canonico: string }).contenido_canonico)
        .margen_sesion_minutos,
    ).toBe(30);

    const heredado = clienteSimulado(firmaFeliz());
    await firmarNota(heredado.sesion, entrada);
    expect(
      JSON.parse((inserciones(heredado.llamadas)[0]!.payload as { contenido_canonico: string }).contenido_canonico)
        .margen_sesion_minutos,
    ).toBe(15);
  });

  it('mantiene la microsegundos del abierta_en: se manda como Date (ms) y nunca después del original', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz());
    await firmarNota(sesion, entrada);
    const canonico = JSON.parse((inserciones(llamadas)[0]!.payload as { contenido_canonico: string }).contenido_canonico);
    expect(canonico.abierta_en).toBe('2026-10-02T08:55:00.000Z');
  });
});

describe('firmarNota · el SQLSTATE de la base', () => {
  const entrada = { pacienteId: P, notaId: N, testigo: TESTIGO, alcance: 'individual' as const, motivo: null };
  const fallaCon = (code: string): Responder =>
    firmaFeliz((l) =>
      l.tabla === 'notas_clinicas_versiones' && l.op === 'insert'
        ? { error: { code, message: 'rechazado' } }
        : undefined,
    );

  it('23514 → conflicto, y no se reintenta en silencio', async () => {
    const { sesion, llamadas } = clienteSimulado(fallaCon('23514'));
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'conflicto' });
    expect(inserciones(llamadas)).toHaveLength(1);
  });

  it('23505 → conflicto (otra firma entró antes)', async () => {
    const { sesion } = clienteSimulado(fallaCon('23505'));
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'conflicto' });
  });

  it('cualquier otro código → error', async () => {
    const { sesion } = clienteSimulado(fallaCon('XX000'));
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
  });

  it('42501 → si la cabecera ya no se ve, bloqueada; si se ve, no_disponible', async () => {
    let lecturas = 0;
    const respuestas = firmaFeliz((l) => {
      if (l.tabla === 'notas_clinicas_versiones' && l.op === 'insert') {
        return { error: { code: '42501', message: 'denegado' } };
      }
      if (l.tabla === 'notas_clinicas' && l.op === 'select') {
        lecturas += 1;
        return lecturas === 1 ? { data: cabecera() } : { data: null };
      }
      return undefined;
    });
    const a = clienteSimulado(respuestas);
    expect(await firmarNota(a.sesion, entrada)).toEqual({ ok: false, motivo: 'bloqueada' });

    const b = clienteSimulado(
      firmaFeliz((l) =>
        l.tabla === 'notas_clinicas_versiones' && l.op === 'insert'
          ? { error: { code: '42501', message: 'denegado' } }
          : undefined,
      ),
    );
    expect(await firmarNota(b.sesion, entrada)).toEqual({ ok: false, motivo: 'no_disponible' });
  });
});

describe('firmarNota · éxito', () => {
  it('devuelve el modelo, prolonga el desbloqueo y no pide texto', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz());
    const r = await firmarNota(sesion, {
      pacienteId: P,
      notaId: N,
      testigo: TESTIGO,
      alcance: 'individual',
      motivo: null,
    });
    expect(r.ok).toBe(true);
    expect(llamadas.some((l) => l.tabla === 'rpc:prolongar_desbloqueo')).toBe(true);
  });
});

describe('guardarBorrador · el testigo es una cadena opaca', () => {
  const entrada = { pacienteId: P, notaId: N, testigo: TESTIGO, texto: 'nuevo', reservadas: '' };

  it('lo manda tal cual a la condición del update (6 decimales, sin pasar por Date)', async () => {
    const { sesion, llamadas } = clienteSimulado((l) =>
      l.op === 'update' ? { data: [{ borrador_actualizado_en: '2026-10-02T09:01:00.654321+00:00' }] } : undefined,
    );
    const r = await guardarBorrador(sesion, entrada);
    const upd = llamadas.find((l) => l.op === 'update')!;
    expect(upd.filtros).toContainEqual(['eq:borrador_actualizado_en', TESTIGO]);
    expect(typeof TESTIGO).toBe('string');
    expect(r).toMatchObject({ ok: true, testigo: '2026-10-02T09:01:00.654321+00:00' });
    expect(upd.payload).toEqual({
      borrador_contenido: { texto: 'nuevo', reservadas: '' },
      borrador_autor_id: A,
    });
  });

  it('no registra acceso (hecho 14 del diseño)', async () => {
    const { sesion, llamadas } = clienteSimulado((l) =>
      l.op === 'update' ? { data: [{ borrador_actualizado_en: TESTIGO }] } : undefined,
    );
    await guardarBorrador(sesion, entrada);
    expect(llamadas.some((l) => l.tabla === 'rpc:registrar_acceso_historia')).toBe(false);
  });

  it.each([
    ['sin fila → bloqueada', { data: null }, 'bloqueada'],
    ['otro autor → no_autor', { data: { id: N, paciente_id: P, autor_id: B, borrador_actualizado_en: TESTIGO } }, 'no_autor'],
    ['otro paciente → no_disponible', { data: { id: N, paciente_id: B, autor_id: A, borrador_actualizado_en: TESTIGO } }, 'no_disponible'],
    ['sin borrador → sin_borrador', { data: { id: N, paciente_id: P, autor_id: A, borrador_actualizado_en: null } }, 'sin_borrador'],
    ['testigo distinto → conflicto', { data: { id: N, paciente_id: P, autor_id: A, borrador_actualizado_en: '2026-10-02T09:00:00.999999+00:00' } }, 'conflicto'],
  ])('cero filas, %s', async (_n, relectura, motivo) => {
    const { sesion } = clienteSimulado((l) => {
      if (l.op === 'update') return { data: [] };
      if (l.tabla === 'notas_clinicas' && l.op === 'select') return relectura as Respuesta;
      return undefined;
    });
    expect(await guardarBorrador(sesion, entrada)).toEqual({ ok: false, motivo });
  });

  it('un error de la base que no es cero filas es error', async () => {
    const { sesion } = clienteSimulado((l) =>
      l.op === 'update' ? { error: { code: 'XX000', message: 'rota' } } : undefined,
    );
    expect(await guardarBorrador(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
  });
});

describe('fijarCoprofesional', () => {
  const entrada = { pacienteId: P, notaId: N, coprofesionalId: B };

  it('traduce el 23514 de T-034 a coprofesional_invalido', async () => {
    const { sesion } = clienteSimulado((l) =>
      l.op === 'update' ? { error: { code: '23514', message: 'no puede' } } : undefined,
    );
    expect(await fijarCoprofesional(sesion, entrada)).toEqual({
      ok: false,
      motivo: 'coprofesional_invalido',
    });
  });

  it('traduce el 42501 de la congelación a ya_firmada', async () => {
    const { sesion } = clienteSimulado((l) =>
      l.op === 'update' ? { error: { code: '42501', message: 'congelada' } } : undefined,
    );
    expect(await fijarCoprofesional(sesion, entrada)).toEqual({ ok: false, motivo: 'ya_firmada' });
  });

  it('cero filas de un autor distinto → no_autor', async () => {
    const { sesion } = clienteSimulado((l) => {
      if (l.op === 'update') return { data: [] };
      if (l.tabla === 'notas_clinicas') return { data: { id: N, paciente_id: P, autor_id: B, borrador_actualizado_en: TESTIGO } };
      return undefined;
    });
    expect(await fijarCoprofesional(sesion, entrada)).toEqual({ ok: false, motivo: 'no_autor' });
  });
});

describe('empezarModificacion', () => {
  const entrada = { pacienteId: P, notaId: N };

  it('abre el borrador con el texto y las reservadas de la versión vigente, solo si no había borrador', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'notas_clinicas_versiones' && l.op === 'select' && !(l.opciones as { head?: boolean } | undefined)?.head) {
          return {
            data: [
              {
                numero_version: 1,
                cuerpo: JSON.stringify({ texto: 'vigente' }),
                anotaciones_reservadas: 'mías',
                autor_id: A,
                creada_en: '2026-10-01T10:00:00Z',
                motivo_cambio: null,
                alcance: 'individual',
                contenido_canonico: '{}',
                huella: '\\xabcdef0123456789abcdef',
              },
            ],
          };
        }
        if (l.op === 'update') return { data: [{ id: N }] };
        return undefined;
      }),
    );
    const r = await empezarModificacion(sesion, entrada);
    expect(r.ok).toBe(true);
    const upd = llamadas.find((l) => l.op === 'update')!;
    expect(upd.payload).toEqual({
      borrador_contenido: { texto: 'vigente', reservadas: 'mías' },
      borrador_autor_id: A,
    });
    expect(upd.filtros).toContainEqual(['is:borrador_contenido', null]);
  });

  it('si ya hay borrador no lo pisa: cero filas y devuelve el modelo tal cual', async () => {
    const { sesion } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'notas_clinicas_versiones' && l.op === 'select' && !(l.opciones as { head?: boolean } | undefined)?.head) {
          return { data: [{ numero_version: 1, cuerpo: '{"texto":"v"}', anotaciones_reservadas: null, autor_id: A, creada_en: '2026-10-01T10:00:00Z', motivo_cambio: null, alcance: 'individual', contenido_canonico: '{}', huella: '\\xab' }] };
        }
        if (l.op === 'update') return { data: [] };
        return undefined;
      }),
    );
    const r = await empezarModificacion(sesion, entrada);
    expect(r.ok).toBe(true);
  });

  it('una nota sin versiones no se modifica: se escribe, no se modifica', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz());
    const r = await empezarModificacion(sesion, entrada);
    expect(r).toEqual({ ok: false, motivo: 'no_disponible' });
    expect(llamadas.some((l) => l.op === 'update')).toBe(false);
  });
});

describe('abrirEditorDeNota · el candado manda', () => {
  it('si registrar el acceso falla devuelve bloqueada SIN tocar ninguna tabla clínica (ADR-058.2)', async () => {
    const { sesion, llamadas } = clienteSimulado((l) =>
      l.tabla === 'rpc:registrar_acceso_historia' ? { error: { code: '42501', message: 'sin desbloqueo' } } : undefined,
    );
    const r = await abrirEditorDeNota(
      sesion,
      { pacienteId: P, citaId: C, notaId: null, episodioId: null },
      CONTEXTO,
    );
    expect(r).toEqual({ estado: 'bloqueada' });
    expect(llamadas.filter((l) => l.tabla !== 'rpc:registrar_acceso_historia')).toHaveLength(0);
  });

  it('cita de otro paciente → no_disponible, sin insertar', async () => {
    const { sesion, llamadas } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return { data: [{ acceso_id: 1, vistas: 1, apertura: true }] };
      if (l.tabla === 'citas') return { data: { id: C, paciente_id: B, profesional_id: A, inicio: '2026-10-02T08:50:00Z', fin: '2026-10-02T09:40:00Z', zona_horaria: 'Europe/Madrid' } };
      return undefined;
    });
    const r = await abrirEditorDeNota(sesion, { pacienteId: P, citaId: C, notaId: null, episodioId: null }, CONTEXTO);
    expect(r).toEqual({ estado: 'no_disponible' });
    expect(llamadas.some((l) => l.op === 'insert')).toBe(false);
  });

  it('cita de otro profesional → no_disponible', async () => {
    const { sesion } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return { data: [{ acceso_id: 1, vistas: 1, apertura: true }] };
      if (l.tabla === 'citas') return { data: { id: C, paciente_id: P, profesional_id: B, inicio: '2026-10-02T08:50:00Z', fin: '2026-10-02T09:40:00Z', zona_horaria: 'Europe/Madrid' } };
      return undefined;
    });
    const r = await abrirEditorDeNota(sesion, { pacienteId: P, citaId: C, notaId: null, episodioId: null }, CONTEXTO);
    expect(r).toEqual({ estado: 'no_disponible' });
  });

  it('cita y nota a la vez, o ninguna de las dos, no es una apertura válida', async () => {
    const { sesion } = clienteSimulado((l) =>
      l.tabla === 'rpc:registrar_acceso_historia' ? { data: [{ acceso_id: 1, vistas: 1, apertura: true }] } : undefined,
    );
    expect(await abrirEditorDeNota(sesion, { pacienteId: P, citaId: C, notaId: N, episodioId: null }, CONTEXTO)).toEqual({ estado: 'no_disponible' });
    expect(await abrirEditorDeNota(sesion, { pacienteId: P, citaId: null, notaId: null, episodioId: null }, CONTEXTO)).toEqual({ estado: 'no_disponible' });
  });

  it('EP001 de episodio_para_nota → elegir_episodio con los episodios propios abiertos', async () => {
    const { sesion, llamadas } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return { data: [{ acceso_id: 1, vistas: 1, apertura: true }] };
      if (l.tabla === 'citas') return { data: { id: C, paciente_id: P, profesional_id: A, inicio: '2026-10-02T08:50:00Z', fin: '2026-10-02T09:40:00Z', zona_horaria: 'Europe/Madrid' } };
      if (l.tabla === 'notas_clinicas') return { data: null };
      if (l.tabla === 'rpc:episodio_para_nota') return { error: { code: 'EP001', message: 'elige' } };
      if (l.tabla === 'episodios_asistenciales') {
        return { data: [{ id: E, modalidad_relacional: 'individual', abierto_en: '2026-09-01T00:00:00Z' }] };
      }
      return undefined;
    });
    const r = await abrirEditorDeNota(sesion, { pacienteId: P, citaId: C, notaId: null, episodioId: null }, CONTEXTO);
    expect(r).toMatchObject({ estado: 'elegir_episodio', episodios: [{ id: E }] });
    expect(llamadas.some((l) => l.op === 'insert')).toBe(false);
  });
});
