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
  listarNotasDelPaciente,
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
  /** Las columnas del `select`, tal cual: lo que se pide a la base es parte del contrato (B.1.1). */
  columnas?: string;
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
    encadenar('select', (c, o) => {
      llamada.columnas = typeof c === 'string' ? c : undefined;
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
    // R4-H2: nada explica las cero filas. Mata el mutante `sin_causa → bloqueada`.
    ['la fila se ve, propia y con el testigo igual → error', { data: { id: N, paciente_id: P, autor_id: A, borrador_actualizado_en: TESTIGO } }, 'error'],
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

  it('cero filas y la fila se ve, propia y de este paciente (sin testigo que cotejar) → error, no bloqueada (R4-H2)', async () => {
    const { sesion } = clienteSimulado((l) => {
      if (l.op === 'update') return { data: [] };
      if (l.tabla === 'notas_clinicas') {
        return { data: { id: N, paciente_id: P, autor_id: A, borrador_actualizado_en: TESTIGO } };
      }
      return undefined;
    });
    expect(await fijarCoprofesional(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
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

// ---------------------------------------------------------------------------------------
// Ronda de correcciones de la revisión (R2-H2 … R2-H8)
// ---------------------------------------------------------------------------------------

const E2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; // un episodio en el que el paciente solo participa
const ACCESO_OK = { data: [{ acceso_id: 1, vistas: 1, apertura: true }] };
const CITA_PROPIA = {
  id: C,
  paciente_id: P,
  profesional_id: A,
  inicio: '2026-10-02T08:50:00Z',
  fin: '2026-10-02T09:40:00Z',
  zona_horaria: 'Europe/Madrid',
  centro_id: 'cen',
};
const ERROR_LECTURA = { error: { code: '57014', message: 'lectura rota' } };

describe('firmarNota · un error de lectura no es «no hay dato» (R2-H2, R2-H7)', () => {
  const entrada = { pacienteId: P, notaId: N, testigo: TESTIGO, alcance: 'individual' as const, motivo: null };
  const pareja: Responder = (l) =>
    l.tabla === 'episodios_asistenciales'
      ? { data: { modalidad_relacional: 'pareja', centro_id: 'cen', abierto_en: '2026-09-01T00:00:00Z' } }
      : undefined;

  it('si falla la lectura del margen del centro, no sella con el de la organización', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'centros' ? ERROR_LECTURA : undefined)),
    );
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('si falla la lectura del margen de la organización, no sella', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'organizacion' ? ERROR_LECTURA : undefined)),
    );
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('si falla la lectura de la cita, no sella', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'citas' ? ERROR_LECTURA : undefined)),
    );
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('si falla la lectura del episodio, no rebaja una conjunta a individual', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'episodios_asistenciales' ? ERROR_LECTURA : undefined)),
    );
    expect(await firmarNota(sesion, { ...entrada, alcance: 'conjunta' })).toEqual({ ok: false, motivo: 'error' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('si falla el recuento de participantes, no rebaja una conjunta a individual', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'episodio_participantes' ? ERROR_LECTURA : pareja(l))),
    );
    expect(await firmarNota(sesion, { ...entrada, alcance: 'conjunta' })).toEqual({ ok: false, motivo: 'error' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('si falla el recuento de versiones, no firma como v1 ni como v2', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) =>
        l.tabla === 'notas_clinicas_versiones' && l.op === 'select' && (l.opciones as { head?: boolean })?.head
          ? ERROR_LECTURA
          : undefined,
      ),
    );
    expect(await firmarNota(sesion, { ...entrada, motivo: 'Corrijo' })).toEqual({ ok: false, motivo: 'error' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('un 23514 del desfase de reloj (abierta_en > firmada_en) es «vuelve a intentarlo», no conflicto', async () => {
    const { sesion } = clienteSimulado(
      firmaFeliz((l) =>
        l.tabla === 'notas_clinicas_versiones' && l.op === 'insert'
          ? { error: { code: '23514', message: 'abierta_en no puede ser posterior a firmada_en (ADR-046)' } }
          : undefined,
      ),
    );
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
  });
});

describe('abrirEditorDeNota · lecturas que fallan al armar el modelo (R2-H6)', () => {
  const porNota = { pacienteId: P, citaId: null, notaId: N, episodioId: null };
  const base = (extra: Responder): Responder =>
    firmaFeliz((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      return extra(l);
    });

  it('la apertura feliz por nota devuelve abierta (la línea base de las dos de abajo)', async () => {
    const { sesion } = clienteSimulado(base(() => undefined));
    expect((await abrirEditorDeNota(sesion, porNota, CONTEXTO)).estado).toBe('abierta');
  });

  it('si falla la lectura de las versiones no se pinta una nota firmada como borrador', async () => {
    const { sesion } = clienteSimulado(
      base((l) =>
        l.tabla === 'notas_clinicas_versiones' && !(l.opciones as { head?: boolean } | undefined)?.head
          ? ERROR_LECTURA
          : undefined,
      ),
    );
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('si falla la lectura de los nombres, el autor de las versiones no sale vacío', async () => {
    const version = {
      numero_version: 1,
      cuerpo: '{"texto":"v"}',
      anotaciones_reservadas: null,
      autor_id: A,
      creada_en: '2026-10-01T10:00:00Z',
      motivo_cambio: null,
      alcance: 'individual',
      contenido_canonico: '{}',
      huella: '\\xab',
    };
    const { sesion } = clienteSimulado(
      base((l) => {
        if (l.tabla === 'notas_clinicas_versiones' && !(l.opciones as { head?: boolean } | undefined)?.head) {
          return { data: [version] };
        }
        if (l.tabla === 'directorio_perfiles') return ERROR_LECTURA;
        return undefined;
      }),
    );
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });
});

describe('abrirEditorDeNota · «no se pudo leer» no es «no está disponible» (R2-H14, R2-H15)', () => {
  const porNota = { pacienteId: P, citaId: null, notaId: N, episodioId: null };
  const porCita = { pacienteId: P, citaId: C, notaId: null, episodioId: null };
  const sinHead = (l: Llamada) => !(l.opciones as { head?: boolean } | undefined)?.head;
  const base = (extra: Responder): Responder =>
    firmaFeliz((l) => (l.tabla === 'rpc:registrar_acceso_historia' ? ACCESO_OK : extra(l)));
  const pareja: Responder = (l) =>
    l.tabla === 'episodios_asistenciales'
      ? { data: { modalidad_relacional: 'pareja', centro_id: 'cen', abierto_en: '2026-09-01T00:00:00Z' } }
      : undefined;

  /** Falla solo la lectura número `n` (1, 2…) de la tabla; las demás responden como siempre. */
  const fallaLaNesima = (tabla: string, n: number, resto: Responder = () => undefined): Responder => {
    let vistas = 0;
    return base((l) => {
      if (l.tabla === tabla && sinHead(l)) {
        vistas += 1;
        if (vistas === n) return ERROR_LECTURA;
      }
      return resto(l);
    });
  };

  it('la cabecera que se relee al armar el modelo y falla es error', async () => {
    const { sesion } = clienteSimulado(fallaLaNesima('notas_clinicas', 2));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('la cabecera que se relee y ya no se ve sigue siendo no_disponible (la gemela)', async () => {
    let lecturas = 0;
    const { sesion } = clienteSimulado(
      base((l) => {
        if (l.tabla === 'notas_clinicas' && l.op === 'select') {
          lecturas += 1;
          if (lecturas === 2) return { data: null };
        }
        return undefined;
      }),
    );
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'no_disponible' });
  });

  it('la cabecera que falla al abrir por nota es error, no no_disponible', async () => {
    const { sesion } = clienteSimulado(fallaLaNesima('notas_clinicas', 1));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('recién creada la cabecera, una lectura que falla es error, no no_disponible', async () => {
    const { sesion } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'citas') return { data: CITA_PROPIA };
      if (l.tabla === 'rpc:episodio_para_nota') return { data: E };
      if (l.tabla === 'notas_clinicas' && l.op === 'insert') return { data: { id: N } };
      if (l.tabla === 'notas_clinicas' && l.op === 'select') {
        return l.filtros.some(([f]) => f === 'eq:cita_id') ? { data: null } : { data: cabecera() };
      }
      if (l.tabla === 'notas_clinicas_versiones' && sinHead(l)) return ERROR_LECTURA;
      return firmaFeliz()(l);
    });
    expect(await abrirEditorDeNota(sesion, porCita, CONTEXTO)).toEqual({ estado: 'error' });
  });

  // R2-H15 · una prueba por guarda de cargarModelo.
  it('guarda del episodio: si falla SOLO la lectura directa del episodio, error', async () => {
    const { sesion } = clienteSimulado(fallaLaNesima('episodios_asistenciales', 1, pareja));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('guarda de «puede ser conjunta»: si falla SOLO la lectura del episodio dentro del recuento, error', async () => {
    const { sesion } = clienteSimulado(fallaLaNesima('episodios_asistenciales', 2, pareja));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('guarda de los participantes: si falla su recuento, el modelo no sale con puedeSerConjunta indefinido', async () => {
    const { sesion } = clienteSimulado(
      base((l) => (l.tabla === 'episodio_participantes' ? ERROR_LECTURA : pareja(l))),
    );
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('guarda de la cita: si falla su lectura, error y no una zona de otra parte', async () => {
    const { sesion } = clienteSimulado(base((l) => (l.tabla === 'citas' ? ERROR_LECTURA : undefined)));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('guarda de la zona: sin cita, si falla la lectura de la organización, error', async () => {
    const { sesion } = clienteSimulado(
      base((l) => {
        if (l.tabla === 'notas_clinicas' && l.op === 'select') return { data: cabecera({ cita_id: null }) };
        if (l.tabla === 'organizacion') return ERROR_LECTURA;
        return undefined;
      }),
    );
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });
});

describe('abrirEditorDeNota · la lista de episodios es la regla que obliga a elegir (R2-H3)', () => {
  it('trae también los episodios en los que el paciente solo participa, y solo los del profesional', async () => {
    const { sesion, llamadas } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'citas') return { data: CITA_PROPIA };
      if (l.tabla === 'notas_clinicas') return { data: null };
      if (l.tabla === 'rpc:episodio_para_nota') return { error: { code: 'EP001', message: 'elige' } };
      if (l.tabla === 'episodio_participantes') return { data: [{ episodio_id: E2 }] };
      if (l.tabla === 'episodios_asistenciales') {
        const porId = l.filtros.some(([f]) => f === 'in:id');
        return porId
          ? { data: [{ id: E2, modalidad_relacional: 'pareja', abierto_en: '2026-09-10T00:00:00Z' }] }
          : { data: [{ id: E, modalidad_relacional: 'individual', abierto_en: '2026-09-01T00:00:00Z' }] };
      }
      return undefined;
    });
    const r = await abrirEditorDeNota(sesion, { pacienteId: P, citaId: C, notaId: null, episodioId: null }, CONTEXTO);
    expect(r).toMatchObject({ estado: 'elegir_episodio' });
    const ids = (r as { episodios: { id: string }[] }).episodios.map((e) => e.id).sort();
    expect(ids).toEqual([E, E2].sort());
    // Todas las consultas de episodios se acotan al profesional y a los abiertos.
    for (const l of llamadas.filter((x) => x.tabla === 'episodios_asistenciales')) {
      expect(l.filtros).toContainEqual(['eq:profesional_id', A]);
      expect(l.filtros).toContainEqual(['is:cerrado_en', null]);
    }
    // R2-H13: la consulta de participaciones es del paciente que se abre y solo de las que siguen
    // en alta. Sin el primer filtro la RLS devolvería las de todos los episodios del profesional;
    // sin el segundo, la lista ofrecería un episodio del que el paciente ya salió.
    const participaciones = llamadas.filter((x) => x.tabla === 'episodio_participantes');
    expect(participaciones).toHaveLength(1);
    expect(participaciones[0].filtros).toContainEqual(['eq:paciente_id', P]);
    expect(participaciones[0].filtros).toContainEqual(['is:baja_en', null]);
  });

  it('si el paciente solo participa en dos episodios, la lista no llega vacía', async () => {
    const { sesion } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'citas') return { data: CITA_PROPIA };
      if (l.tabla === 'notas_clinicas') return { data: null };
      if (l.tabla === 'rpc:episodio_para_nota') return { error: { code: 'EP001', message: 'elige' } };
      if (l.tabla === 'episodio_participantes') return { data: [{ episodio_id: E }, { episodio_id: E2 }] };
      if (l.tabla === 'episodios_asistenciales') {
        return l.filtros.some(([f]) => f === 'in:id')
          ? {
              data: [
                { id: E, modalidad_relacional: 'grupo', abierto_en: '2026-09-01T00:00:00Z' },
                { id: E2, modalidad_relacional: 'pareja', abierto_en: '2026-09-10T00:00:00Z' },
              ],
            }
          : { data: [] };
      }
      return undefined;
    });
    const r = await abrirEditorDeNota(sesion, { pacienteId: P, citaId: C, notaId: null, episodioId: null }, CONTEXTO);
    expect((r as { episodios: unknown[] }).episodios).toHaveLength(2);
  });
});

describe('abrirEditorDeNota · la búsqueda por cita es del paciente que se abre (R2-H8)', () => {
  it('filtra por paciente_id: no devuelve la nota de otro paciente con el cita_id de esta cita', async () => {
    const { sesion, llamadas } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'citas') return { data: CITA_PROPIA };
      if (l.tabla === 'rpc:episodio_para_nota') return { data: E };
      if (l.tabla === 'notas_clinicas' && l.op === 'insert') return { data: { id: N } };
      if (l.tabla === 'notas_clinicas' && l.op === 'select') {
        // Solo «encuentra» una nota si la búsqueda NO acota por paciente (el defecto).
        const acotada = l.filtros.some(([f, v]) => f === 'eq:paciente_id' && v === P);
        if (l.filtros.some(([f]) => f === 'eq:cita_id')) return acotada ? { data: null } : { data: { id: 'otra-nota' } };
        return { data: cabecera({ id: N }) };
      }
      return undefined;
    });
    await abrirEditorDeNota(sesion, { pacienteId: P, citaId: C, notaId: null, episodioId: null }, CONTEXTO);
    const busquedas = llamadas.filter(
      (l) => l.tabla === 'notas_clinicas' && l.op === 'select' && l.filtros.some(([f]) => f === 'eq:cita_id'),
    );
    expect(busquedas.length).toBeGreaterThan(0);
    for (const b of busquedas) expect(b.filtros).toContainEqual(['eq:paciente_id', P]);
    // Y por tanto se creó la nota buena en vez de abrir la ajena.
    expect(llamadas.some((l) => l.tabla === 'notas_clinicas' && l.op === 'insert')).toBe(true);
  });
});

describe('abrirEditorDeNota · apertura doble (R2-H5)', () => {
  /** Un mundo con una sola nota posible por (cita, autor): la segunda inserción da 23505. */
  function mundoConIndiceUnico() {
    let intentosDeInsertar = 0;
    let creada = false;
    const responder: Responder = (l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'citas') return { data: CITA_PROPIA };
      if (l.tabla === 'rpc:episodio_para_nota') return { data: E };
      if (l.tabla === 'rpc:prolongar_desbloqueo') return { data: '2026-10-02T10:00:00Z' };
      if (l.tabla === 'notas_clinicas' && l.op === 'insert') {
        intentosDeInsertar += 1;
        if (creada) return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        creada = true;
        return { data: { id: N } };
      }
      if (l.tabla === 'notas_clinicas' && l.op === 'select') {
        if (l.filtros.some(([f]) => f === 'eq:cita_id')) {
          // Las dos aperturas buscan ANTES de que ninguna haya insertado: el caso de la carrera.
          return intentosDeInsertar < 2 ? { data: null } : { data: { id: N } };
        }
        return { data: cabecera() };
      }
      if (l.tabla === 'notas_clinicas_versiones' && l.op === 'select') {
        return (l.opciones as { head?: boolean } | undefined)?.head ? { count: 0 } : { data: [] };
      }
      if (l.tabla === 'episodios_asistenciales') {
        return { data: { modalidad_relacional: 'individual', centro_id: 'cen', abierto_en: '2026-09-01T00:00:00Z' } };
      }
      if (l.tabla === 'episodio_participantes') return { count: 1 };
      return undefined;
    };
    return responder;
  }

  it('la segunda de dos aperturas simultáneas recibe 23505, relee y devuelve la nota de la primera', async () => {
    const { sesion, llamadas } = clienteSimulado(mundoConIndiceUnico());
    const entrada = { pacienteId: P, citaId: C, notaId: null, episodioId: null };
    const [a, b] = await Promise.all([
      abrirEditorDeNota(sesion, entrada, CONTEXTO),
      abrirEditorDeNota(sesion, entrada, CONTEXTO),
    ]);
    expect(llamadas.filter((l) => l.tabla === 'notas_clinicas' && l.op === 'insert')).toHaveLength(2);
    expect(a.estado).toBe('abierta');
    expect(b.estado).toBe('abierta');
    expect((a as { nota: { notaId: string } }).nota.notaId).toBe(N);
    expect((b as { nota: { notaId: string } }).nota.notaId).toBe(N);
  });

  it('un 23505 cuya relectura no encuentra nada es error, no abierta', async () => {
    const { sesion } = clienteSimulado((l) => {
      if (l.tabla === 'notas_clinicas' && l.op === 'insert') {
        return { error: { code: '23505', message: 'duplicate key' } };
      }
      if (l.tabla === 'notas_clinicas' && l.op === 'select') return { data: null };
      return mundoConIndiceUnico()(l);
    });
    const r = await abrirEditorDeNota(sesion, { pacienteId: P, citaId: C, notaId: null, episodioId: null }, CONTEXTO);
    expect(r).toEqual({ estado: 'error' });
  });
});

// ---------------------------------------------------------------------------------------
// Ronda 4 (R3-H1, R3-H2 y la misma clase): un error de lectura no es «no se ve» ni «no existe»
// ---------------------------------------------------------------------------------------

describe('un error de lectura no es ausencia (R3-H1, R3-H2 y el resto del fichero)', () => {
  const entrada = { pacienteId: P, notaId: N, testigo: TESTIGO, alcance: 'individual' as const, motivo: null };
  const porCita = { pacienteId: P, citaId: C, notaId: null, episodioId: null };
  const porNota = { pacienteId: P, citaId: null, notaId: N, episodioId: null };
  const sinHead = (l: Llamada) => !(l.opciones as { head?: boolean } | undefined)?.head;
  const esCabecera = (l: Llamada) => l.tabla === 'notas_clinicas' && l.op === 'select';
  const fallo42501 = (l: Llamada): Respuesta | undefined =>
    l.tabla === 'notas_clinicas_versiones' && l.op === 'insert'
      ? { error: { code: '42501', message: 'denegado' } }
      : undefined;

  // R3-H1 · firmarNota, paso 2.
  it('firmarNota: si falla la relectura de la cabecera es error, no bloqueada, y no inserta', async () => {
    const { sesion, llamadas } = clienteSimulado(firmaFeliz((l) => (esCabecera(l) ? ERROR_LECTURA : undefined)));
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
    expect(inserciones(llamadas)).toHaveLength(0);
  });

  it('firmarNota: la cabecera que no se ve (sin error) sigue siendo bloqueada (la gemela)', async () => {
    const { sesion } = clienteSimulado(firmaFeliz((l) => (esCabecera(l) ? { data: null } : undefined)));
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'bloqueada' });
  });

  // R3-H1 · firmarNota, relectura tras 42501.
  it('firmarNota 42501: si falla la relectura de la cabecera es error, no bloqueada', async () => {
    let lecturas = 0;
    const { sesion } = clienteSimulado(
      firmaFeliz((l) => {
        if (fallo42501(l)) return fallo42501(l);
        if (esCabecera(l)) {
          lecturas += 1;
          return lecturas === 1 ? { data: cabecera() } : ERROR_LECTURA;
        }
        return undefined;
      }),
    );
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'error' });
  });

  it('firmarNota 42501: la cabecera que ya no se ve sigue siendo bloqueada y la que se ve, no_disponible (gemelas)', async () => {
    let lecturas = 0;
    const a = clienteSimulado(
      firmaFeliz((l) => {
        if (fallo42501(l)) return fallo42501(l);
        if (esCabecera(l)) {
          lecturas += 1;
          return lecturas === 1 ? { data: cabecera() } : { data: null };
        }
        return undefined;
      }),
    );
    expect(await firmarNota(a.sesion, entrada)).toEqual({ ok: false, motivo: 'bloqueada' });
    const b = clienteSimulado(firmaFeliz(fallo42501));
    expect(await firmarNota(b.sesion, entrada)).toEqual({ ok: false, motivo: 'no_disponible' });
  });

  // R3-H2 · abrir desde una cita.
  it('abrir por cita: si falla la lectura de la cita es error, no no_disponible', async () => {
    const { sesion } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
        if (l.tabla === 'citas') return ERROR_LECTURA;
        return undefined;
      }),
    );
    expect(await abrirEditorDeNota(sesion, porCita, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('abrir por cita: la cita que no se ve (sin error) sigue siendo no_disponible (la gemela)', async () => {
    const { sesion } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
        if (l.tabla === 'citas') return { data: null };
        return undefined;
      }),
    );
    expect(await abrirEditorDeNota(sesion, porCita, CONTEXTO)).toEqual({ estado: 'no_disponible' });
  });

  // buscarPorCita: un error no es «no hay nota»; seguir llevaría a crear otra cabecera.
  it('abrir por cita: si falla la búsqueda de la nota de la cita es error y no crea nada', async () => {
    const { sesion, llamadas } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'citas') return { data: CITA_PROPIA };
      if (esCabecera(l) && l.filtros.some(([f]) => f === 'eq:cita_id')) return ERROR_LECTURA;
      return firmaFeliz()(l);
    });
    expect(await abrirEditorDeNota(sesion, porCita, CONTEXTO)).toEqual({ estado: 'error' });
    expect(llamadas.some((l) => l.tabla === 'notas_clinicas' && l.op === 'insert')).toBe(false);
    expect(llamadas.some((l) => l.tabla === 'rpc:episodio_para_nota')).toBe(false);
  });

  it('abrir por cita: la búsqueda que no encuentra nada (sin error) crea la cabecera (la gemela)', async () => {
    const { sesion, llamadas } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'citas') return { data: CITA_PROPIA };
      if (l.tabla === 'rpc:episodio_para_nota') return { data: E };
      if (l.tabla === 'notas_clinicas' && l.op === 'insert') return { data: { id: N } };
      if (esCabecera(l)) return l.filtros.some(([f]) => f === 'eq:cita_id') ? { data: null } : { data: cabecera() };
      return firmaFeliz()(l);
    });
    expect((await abrirEditorDeNota(sesion, porCita, CONTEXTO)).estado).toBe('abierta');
    expect(llamadas.some((l) => l.tabla === 'notas_clinicas' && l.op === 'insert')).toBe(true);
  });

  it('23505: si la relectura de la búsqueda falla es error (y nunca abierta)', async () => {
    let busquedas = 0;
    const { sesion } = clienteSimulado((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'citas') return { data: CITA_PROPIA };
      if (l.tabla === 'rpc:episodio_para_nota') return { data: E };
      if (l.tabla === 'notas_clinicas' && l.op === 'insert') {
        return { error: { code: '23505', message: 'duplicate key' } };
      }
      if (esCabecera(l) && l.filtros.some(([f]) => f === 'eq:cita_id')) {
        busquedas += 1;
        return busquedas === 1 ? { data: null } : ERROR_LECTURA;
      }
      return firmaFeliz()(l);
    });
    expect(await abrirEditorDeNota(sesion, porCita, CONTEXTO)).toEqual({ estado: 'error' });
  });

  // diagnosticarCeroFilas.
  it('cero filas + relectura que falla es error, no bloqueada (guardarBorrador y fijarCoprofesional)', async () => {
    const { sesion } = clienteSimulado((l) => {
      if (l.op === 'update') return { data: [] };
      if (esCabecera(l)) return ERROR_LECTURA;
      return undefined;
    });
    expect(
      await guardarBorrador(sesion, { pacienteId: P, notaId: N, testigo: TESTIGO, texto: 'x', reservadas: '' }),
    ).toEqual({ ok: false, motivo: 'error' });
    expect(await fijarCoprofesional(sesion, { pacienteId: P, notaId: N, coprofesionalId: null })).toEqual({
      ok: false,
      motivo: 'error',
    });
  });

  // empezarModificacion.
  it('empezarModificacion: si falla la lectura de la versión vigente es error, no no_disponible', async () => {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) => (l.tabla === 'notas_clinicas_versiones' && sinHead(l) ? ERROR_LECTURA : undefined)),
    );
    expect(await empezarModificacion(sesion, { pacienteId: P, notaId: N })).toEqual({ ok: false, motivo: 'error' });
    expect(llamadas.some((l) => l.op === 'update')).toBe(false);
  });

  it('empezarModificacion: cero filas y la relectura falla es error, no «ya había borrador» (ok)', async () => {
    const { sesion } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'notas_clinicas_versiones' && sinHead(l)) {
          return {
            data: [{ numero_version: 1, cuerpo: '{"texto":"v"}', anotaciones_reservadas: null }],
          };
        }
        if (l.op === 'update') return { data: [] };
        if (esCabecera(l)) return ERROR_LECTURA;
        return undefined;
      }),
    );
    expect(await empezarModificacion(sesion, { pacienteId: P, notaId: N })).toEqual({ ok: false, motivo: 'error' });
  });

  it('empezarModificacion: sin versiones (sin error) sigue siendo no_disponible (la gemela)', async () => {
    const { sesion } = clienteSimulado(firmaFeliz());
    expect(await empezarModificacion(sesion, { pacienteId: P, notaId: N })).toEqual({
      ok: false,
      motivo: 'no_disponible',
    });
  });

  // Candidatos a coprofesional.
  const abrirConCandidatos = (extra: Responder) =>
    clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
        return extra(l);
      }),
    );

  it('candidatos: si falla la lectura de perfiles_centros es error, no una lista vacía', async () => {
    const { sesion } = abrirConCandidatos((l) => (l.tabla === 'perfiles_centros' ? ERROR_LECTURA : undefined));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('candidatos: si falla la lectura del directorio es error, no una lista vacía', async () => {
    const { sesion } = abrirConCandidatos((l) => {
      if (l.tabla === 'perfiles_centros') return { data: [{ perfil_id: B }] };
      if (l.tabla === 'directorio_perfiles') return ERROR_LECTURA;
      return undefined;
    });
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('candidatos: sin error, la lista llega con quien corresponde (la gemela)', async () => {
    const { sesion } = abrirConCandidatos((l) => {
      if (l.tabla === 'perfiles_centros') return { data: [{ perfil_id: B }] };
      if (l.tabla === 'directorio_perfiles') {
        return { data: [{ id: B, nombre_completo: 'Otra Persona', rol: 'profesional', estado: 'activo' }] };
      }
      return undefined;
    });
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    expect(r).toMatchObject({ estado: 'abierta' });
    expect((r as { nota: { candidatosCoprofesional: unknown[] } }).nota.candidatosCoprofesional).toEqual([
      { id: B, nombre: 'Otra Persona' },
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// Corte B (B.1.1): lo que la pantalla necesita del servidor
// ---------------------------------------------------------------------------------------

describe('abrirEditorDeNota · un registro que falla por otra causa no es un candado cerrado (R4-H1)', () => {
  const porCita = { pacienteId: P, citaId: C, notaId: null, episodioId: null };
  const soloElRegistro = (llamadas: Llamada[]) => llamadas.filter((l) => l.tabla !== 'rpc:registrar_acceso_historia');

  it('57014 al registrar → error (no bloqueada) y ninguna llamada más', async () => {
    const { sesion, llamadas } = clienteSimulado((l) =>
      l.tabla === 'rpc:registrar_acceso_historia' ? { error: { code: '57014', message: 'tiempo agotado' } } : undefined,
    );
    expect(await abrirEditorDeNota(sesion, porCita, CONTEXTO)).toEqual({ estado: 'error' });
    expect(soloElRegistro(llamadas)).toHaveLength(0);
  });

  it('la función no devuelve fila → error y ninguna llamada más', async () => {
    const { sesion, llamadas } = clienteSimulado((l) =>
      l.tabla === 'rpc:registrar_acceso_historia' ? { data: [] } : undefined,
    );
    expect(await abrirEditorDeNota(sesion, porCita, CONTEXTO)).toEqual({ estado: 'error' });
    expect(soloElRegistro(llamadas)).toHaveLength(0);
  });

  it('42501 sigue siendo bloqueada (la gemela), también sin más llamadas', async () => {
    const { sesion, llamadas } = clienteSimulado((l) =>
      l.tabla === 'rpc:registrar_acceso_historia' ? { error: { code: '42501', message: 'sin desbloqueo' } } : undefined,
    );
    expect(await abrirEditorDeNota(sesion, porCita, CONTEXTO)).toEqual({ estado: 'bloqueada' });
    expect(soloElRegistro(llamadas)).toHaveLength(0);
  });
});

describe('abrirEditorDeNota · la apertura exige un plazo (B.2.3)', () => {
  const porNota = { pacienteId: P, citaId: null, notaId: N, episodioId: null };
  const conProlongar = (respuesta: Respuesta): Responder =>
    firmaFeliz((l) => {
      if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
      if (l.tabla === 'rpc:prolongar_desbloqueo') return respuesta;
      return undefined;
    });

  it('con plazo, abre y lo devuelve como cadena', async () => {
    const { sesion } = clienteSimulado(conProlongar({ data: '2026-10-02T10:00:00+00:00' }));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toMatchObject({
      estado: 'abierta',
      caducaEn: '2026-10-02T10:00:00+00:00',
    });
  });

  it('prolongar_desbloqueo devuelve nulo → error, no una apertura de plazo desconocido', async () => {
    const { sesion } = clienteSimulado(conProlongar({ data: null }));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('prolongar_desbloqueo falla → error', async () => {
    const { sesion } = clienteSimulado(conProlongar({ error: { code: 'XX000', message: 'rota' } }));
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });
});

describe('firmarNota · los mensajes de T-036 son conflicto (B0.5)', () => {
  const entrada = { pacienteId: P, notaId: N, testigo: TESTIGO, alcance: 'individual' as const, motivo: null };
  const fallaConMensaje = (message: string): Responder =>
    firmaFeliz((l) =>
      l.tabla === 'notas_clinicas_versiones' && l.op === 'insert' ? { error: { code: '23514', message } } : undefined,
    );

  it.each([
    [
      '6.24 · no es el borrador vigente',
      'Lo que se firma no es el borrador vigente de la cabecera: otra sesión lo cambió entretanto; hay que releerlo (T-036, R2-H1, ADR-036)',
    ],
    [
      '6.18 · el instante de apertura no es el de la base',
      'El instante de apertura del sobre no es el instante en que la base abrió el borrador (columna de la cabecera, truncada a milisegundos) (T-036, ADR-046)',
    ],
  ])('23514 con %s → conflicto', async (_nombre, mensaje) => {
    const { sesion } = clienteSimulado(fallaConMensaje(mensaje));
    expect(await firmarNota(sesion, entrada)).toEqual({ ok: false, motivo: 'conflicto' });
  });
});

describe('abrirEditorDeNota · lo que el sello le da a la pantalla (B.1.1.4)', () => {
  const porNota = { pacienteId: P, citaId: null, notaId: N, episodioId: null };
  const entrada = { pacienteId: P, notaId: N, testigo: TESTIGO, alcance: 'individual' as const, motivo: null };

  /** El `contenido_canonico` REAL que sellaría `firmarNota`, a la hora que se diga. */
  async function sobreFirmado(hora: string, cab: Record<string, unknown> = {}): Promise<string> {
    const { sesion, llamadas } = clienteSimulado(
      firmaFeliz((l) =>
        l.tabla === 'notas_clinicas' && l.op === 'select' ? { data: cabecera(cab) } : undefined,
      ),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date(hora));
    try {
      await firmarNota(sesion, entrada);
    } finally {
      vi.useRealTimers();
    }
    return (inserciones(llamadas)[0]!.payload as { contenido_canonico: string }).contenido_canonico;
  }

  const abrirConVersion = async (contenidoCanonico: string) => {
    const { sesion } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
        if (l.tabla === 'notas_clinicas_versiones' && !(l.opciones as { head?: boolean } | undefined)?.head) {
          return {
            data: [
              {
                numero_version: 1,
                cuerpo: '{"texto":"v"}',
                anotaciones_reservadas: null,
                autor_id: A,
                creada_en: '2026-10-02T09:10:00Z',
                motivo_cambio: null,
                alcance: 'individual',
                contenido_canonico: contenidoCanonico,
                huella: '\\xabcdef0123456789abcdef',
              },
            ],
          };
        }
        return undefined;
      }),
    );
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    if (r.estado !== 'abierta') throw new Error(`se esperaba abierta y salió ${r.estado}`);
    return r.nota.versiones[0]!;
  };

  it('firmada dentro de la cita: enSesion true y «Margen aplicado: 15 min»', async () => {
    const v = await abrirConVersion(await sobreFirmado('2026-10-02T09:10:00.000Z'));
    expect(v.enSesion).toBe(true);
    expect(v.margen).toBe('Margen aplicado: 15 min');
  });

  it('firmada al día siguiente: enSesion false, y el margen sigue constando (lleva cita)', async () => {
    const v = await abrirConVersion(await sobreFirmado('2026-10-03T09:10:00.000Z'));
    expect(v.enSesion).toBe(false);
    expect(v.margen).toBe('Margen aplicado: 15 min');
  });

  it('sin cita: enSesion false y margen null (no se pinta un margen que no se aplicó)', async () => {
    const v = await abrirConVersion(await sobreFirmado('2026-10-02T09:10:00.000Z', { cita_id: null }));
    expect(v.enSesion).toBe(false);
    expect(v.margen).toBeNull();
  });

  it('un canónico ilegible: enSesion null, margen null y la frase «Sello no legible»', async () => {
    const v = await abrirConVersion('{}');
    expect(v.enSesion).toBeNull();
    expect(v.margen).toBeNull();
    expect(v.sello).toBe('Sello no legible');
  });
});

describe('abrirEditorDeNota · el borrador de otro autor llega, para leerlo, solo si el lector lo leería firmado (P-1, B0-H3)', () => {
  const porNota = { pacienteId: P, citaId: null, notaId: N, episodioId: null };
  const version = {
    numero_version: 1,
    cuerpo: '{"texto":"v"}',
    anotaciones_reservadas: null,
    autor_id: B,
    creada_en: '2026-10-01T10:00:00Z',
    motivo_cambio: null,
    alcance: 'individual',
    contenido_canonico: '{}',
    huella: '\\xabcdef0123456789abcdef',
  };
  const abrir = (cab: Record<string, unknown>, conVersion: boolean, asignado = false) =>
    clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
        // B1-H6 · el simulador mira el argumento: solo es asignado respecto del paciente de la nota.
        if (l.tabla === 'rpc:es_profesional_asignado') {
          return { data: asignado && (l.payload as { p_paciente_id?: string })?.p_paciente_id === P };
        }
        if (l.tabla === 'notas_clinicas' && l.op === 'select') return { data: cabecera(cab) };
        if (l.tabla === 'notas_clinicas_versiones' && !(l.opciones as { head?: boolean } | undefined)?.head) {
          return { data: conVersion ? [version] : [] };
        }
        return undefined;
      }),
    );

  it('quien lee todas las versiones por RLS (profesional asignado) recibe el borrador, y el modelo dice que no es suyo', async () => {
    const { sesion } = abrir({ autor_id: B }, true, true);
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    expect(r).toMatchObject({
      estado: 'abierta',
      nota: {
        soyAutor: false,
        estado: 'firmada_con_cambios',
        borrador: { texto: 'Se trabajó la ansiedad.', reservadas: '', testigo: TESTIGO },
        borradorOculto: false,
      },
    });
  });

  it('B0-H3 · coprofesional con borrador individual (no figura como coprofesional): ni el texto ni las reservadas viajan', async () => {
    const { sesion } = abrir(
      { autor_id: B, coprofesional_id: null, borrador_contenido: { texto: 'Texto secreto', reservadas: 'Reservada secreta' } },
      true,
    );
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    expect(r).toMatchObject({ estado: 'abierta', nota: { soyAutor: false, borrador: null, borradorOculto: true } });
    const volcado = JSON.stringify(r);
    expect(volcado).not.toContain('secreto');
    expect(volcado).not.toContain(TESTIGO);
  });

  it('B1-H1 · coprofesional nombrado en la cabecera (el lector): tampoco recibe el borrador ajeno (la gemela invertida)', async () => {
    const { sesion } = abrir(
      { autor_id: B, coprofesional_id: A, borrador_contenido: { texto: 'Texto de la v2', reservadas: '' } },
      true,
    );
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    expect(r).toMatchObject({ estado: 'abierta', nota: { soyAutor: false, borrador: null, borradorOculto: true } });
    expect(JSON.stringify(r)).not.toContain('Texto de la v2');
  });

  it('B1-H1 · borrador con coprofesional_id de una tercera persona (ni autor, ni lector): no viaja', async () => {
    const { sesion } = abrir(
      { autor_id: B, coprofesional_id: C, borrador_contenido: { texto: 'Texto de la v2', reservadas: '' } },
      true,
    );
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    expect(r).toMatchObject({ estado: 'abierta', nota: { borrador: null, borradorOculto: true } });
    expect(JSON.stringify(r)).not.toContain('Texto de la v2');
  });

  it('B1-H6 · la RPC es_profesional_asignado recibe el id del paciente, no el del usuario', async () => {
    const { sesion, llamadas } = abrir({ autor_id: B }, true, true);
    await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    const rpc = llamadas.filter((l) => l.tabla === 'rpc:es_profesional_asignado');
    expect(rpc).toHaveLength(1);
    expect(rpc[0].payload).toEqual({ p_paciente_id: P });
  });

  it('B0-H3 · si falla la lectura de si es profesional asignado, es error y no se enseña el borrador', async () => {
    const { sesion } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
        if (l.tabla === 'rpc:es_profesional_asignado') return ERROR_LECTURA;
        if (l.tabla === 'notas_clinicas' && l.op === 'select') return { data: cabecera({ autor_id: B }) };
        return undefined;
      }),
    );
    expect(await abrirEditorDeNota(sesion, porNota, CONTEXTO)).toEqual({ estado: 'error' });
  });

  it('B0-H2 · quien solo lee como coprofesional: lecturaConjunta true; asignado y autor: false', async () => {
    const copro = abrir({ autor_id: B, coprofesional_id: A }, true, false);
    expect(await abrirEditorDeNota(copro.sesion, porNota, CONTEXTO)).toMatchObject({
      nota: { lecturaConjunta: true },
    });
    const asignado = abrir({ autor_id: B }, true, true);
    expect(await abrirEditorDeNota(asignado.sesion, porNota, CONTEXTO)).toMatchObject({
      nota: { lecturaConjunta: false },
    });
    const autor = abrir({ autor_id: A }, true, false);
    expect(await abrirEditorDeNota(autor.sesion, porNota, CONTEXTO)).toMatchObject({
      nota: { lecturaConjunta: false },
    });
  });

  it('B0-H3 · sin borrador no hay nada que ocultar: borradorOculto false', async () => {
    const { sesion } = abrir({ autor_id: B, borrador_contenido: null, borrador_actualizado_en: null }, true);
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    expect(r).toMatchObject({ estado: 'abierta', nota: { borrador: null, borradorOculto: false } });
  });

  it('el autor sigue recibiendo su borrador y puede editarlo (la gemela)', async () => {
    const { sesion } = abrir({ autor_id: A }, false);
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    expect(r).toMatchObject({ estado: 'abierta', nota: { soyAutor: true, estado: 'borrador', borrador: { testigo: TESTIGO }, borradorOculto: false } });
  });

  it('quien no ve la nota por RLS no recibe ni la cabecera ni el borrador: no_disponible', async () => {
    const { sesion } = clienteSimulado(
      firmaFeliz((l) => {
        if (l.tabla === 'rpc:registrar_acceso_historia') return ACCESO_OK;
        if (l.tabla === 'notas_clinicas' && l.op === 'select') return { data: null };
        return undefined;
      }),
    );
    const r = await abrirEditorDeNota(sesion, porNota, CONTEXTO);
    expect(r).toEqual({ estado: 'no_disponible' });
    expect(JSON.stringify(r)).not.toContain('ansiedad');
  });
});

describe('listarNotasDelPaciente (B.1.1.6)', () => {
  const N2 = '22222222-2222-4222-8222-222222222222';
  const filasNotas = [
    { id: N, autor_id: A, fecha_sesion: '2026-10-02', borrador_abierta_en: null },
    { id: N2, autor_id: B, fecha_sesion: '2026-09-20', borrador_abierta_en: '2026-09-20T09:00:00+00:00' },
  ];
  const filasVersiones = [
    { nota_id: N, numero_version: 1, alcance: 'individual' },
    { nota_id: N, numero_version: 2, alcance: 'conjunta' },
  ];
  const lista = (extra: Responder = () => undefined) =>
    clienteSimulado((l) => {
      const propio = extra(l);
      if (propio) return propio;
      if (l.tabla === 'notas_clinicas') return { data: filasNotas };
      if (l.tabla === 'notas_clinicas_versiones') return { data: filasVersiones };
      if (l.tabla === 'directorio_perfiles') {
        return { data: [{ id: A, nombre_completo: 'Ana Autora' }, { id: B, nombre_completo: 'Berta Autora' }] };
      }
      return undefined;
    });

  it('dos notas: la modificada (v2 conjunta) y la que solo tiene borrador, con href de ?nota=', async () => {
    const { sesion } = lista();
    const r = await listarNotasDelPaciente(sesion, P);
    expect(r).toEqual({
      ok: true,
      valor: [
        {
          id: N,
          fechaSesion: '02/10/2026',
          estado: 'modificada',
          versiones: 2,
          autor: 'Ana Autora',
          conjunta: true,
          href: `/pacientes/${P}/historia/notas?nota=${N}`,
        },
        {
          id: N2,
          fechaSesion: '20/09/2026',
          estado: 'borrador',
          versiones: 0,
          autor: 'Berta Autora',
          conjunta: false,
          href: `/pacientes/${P}/historia/notas?nota=${N2}`,
        },
      ],
    });
  });

  it('consulta por paciente_id y no pide ni el borrador ni el cuerpo ni las reservadas', async () => {
    const { sesion, llamadas } = lista();
    await listarNotasDelPaciente(sesion, P);
    const lecturas = llamadas.filter((l) => l.tabla === 'notas_clinicas' || l.tabla === 'notas_clinicas_versiones');
    expect(lecturas).toHaveLength(2);
    for (const l of lecturas) {
      expect(l.filtros).toContainEqual(['eq:paciente_id', P]);
      expect(l.columnas).toBeDefined();
      expect(l.columnas).not.toMatch(/borrador_contenido|cuerpo|anotaciones_reservadas|contenido_canonico/);
    }
  });

  it.each([
    ['las notas', 'notas_clinicas'],
    ['las versiones', 'notas_clinicas_versiones'],
    ['los nombres', 'directorio_perfiles'],
  ])('si falla la lectura de %s → {ok:false}, nunca una lista vacía', async (_n, tabla) => {
    const { sesion } = lista((l) => (l.tabla === tabla ? ERROR_LECTURA : undefined));
    expect(await listarNotasDelPaciente(sesion, P)).toEqual({ ok: false });
  });

  it('un paciente sin notas es ok con lista vacía (la gemela de las anteriores)', async () => {
    const { sesion } = lista((l) => (l.tabla === 'notas_clinicas' ? { data: [] } : undefined));
    expect(await listarNotasDelPaciente(sesion, P)).toEqual({ ok: true, valor: [] });
  });
});
