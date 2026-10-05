// T-040 · Pruebas de `lib/exportaciones/servidor.ts` con un cliente simulado que solo atiende `rpc`.
//
// Lo que se prueba aquí es lo que el banco 27 no puede ver: que cada 42501 se traduce por su
// FRAGMENTO (el candado no es «sin permiso»), que la respuesta pasa por Zod y por `proyectar`
// antes de salir, el nombre del fichero en la zona de la copia, y que ningún `console.*` recibe
// la respuesta, la copia ni el objeto de error entero (C5, regla de registros de §1.3).
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Sesion } from '@/lib/cuentas/tipos';
import type { Database } from '@/lib/supabase/tipos-bd';

import {
  ID_EXPORTACION,
  ID_NOTA,
  ID_PACIENTE,
  respuestaPacienteQueTraeDeMas,
  respuestaProfesional,
} from './fixtures-de-prueba';
import { notasParaCopia, pedirCopiaDeNota, registrarFichero } from './servidor';

const CONTEXTO = { ip: '203.0.113.7', agente: 'prueba' };
const ENTRADA = { pacienteId: ID_PACIENTE, notaId: ID_NOTA, motivo: null, referencia: null };
const HUELLA = 'ab'.repeat(32);

type Llamada = { funcion: string; args: unknown };
type Respuesta = { data?: unknown; error?: { code?: string; message: string; details?: string } | null };

function sesionSimulada(responder: (l: Llamada) => Respuesta) {
  const llamadas: Llamada[] = [];
  const supabase = {
    rpc: (funcion: string, args: unknown) => {
      const l = { funcion, args };
      llamadas.push(l);
      const r = responder(l);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
  const sesion = {
    supabase: supabase as unknown as SupabaseClient<Database>,
    usuario: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as User,
  } satisfies Sesion;
  return { sesion, llamadas };
}

/** Todo lo que se ha pasado a cualquier `console.*`, serializado. */
let registros: unknown[][] = [];
beforeEach(() => {
  registros = [];
  for (const m of ['error', 'warn', 'log', 'info', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      registros.push(a);
    });
  }
});
afterEach(() => vi.restoreAllMocks());

const textoDeRegistros = () => JSON.stringify(registros);
const MARCAS = ['MARCA-CUERPO', 'MARCA-RESERVADA', 'MARCA-MOTIVO', 'Lucía', 'Pérez Gómez', 'REF-SECRETA'];
function sinMarcasEnRegistros() {
  const texto = textoDeRegistros();
  for (const m of MARCAS) expect(texto).not.toContain(m);
}

describe('pedirCopiaDeNota', () => {
  it('llama a exportar_nota con la entrada y el contexto, y devuelve la copia proyectada y el nombre', async () => {
    const { sesion, llamadas } = sesionSimulada(() => ({ data: respuestaProfesional() }));
    const r = await pedirCopiaDeNota(sesion, ENTRADA, CONTEXTO);

    expect(llamadas).toEqual([
      {
        funcion: 'exportar_nota',
        args: {
          p_paciente_id: ID_PACIENTE,
          p_nota_id: ID_NOTA,
          p_ip: '203.0.113.7',
          p_agente: 'prueba',
        },
      },
    ]);
    if (!r.ok) throw new Error('esperaba ok');
    expect(r.exportacionId).toBe(ID_EXPORTACION);
    expect(r.copia.formato).toBe('psicogestion.copia-nota');
    expect(r.copia.versiones.map((v) => v.numero)).toEqual([1, 3]);
    // 08:15 UTC del 2 de octubre es las 10:15 en Madrid (verano): el nombre va en la zona de la copia.
    expect(r.nombreFichero).toBe('copia-de-nota-20261002-1015.html');
    expect(registros).toEqual([]);
  });

  it('con motivo manda p_motivo y p_referencia', async () => {
    const { sesion, llamadas } = sesionSimulada(() => ({ data: respuestaPacienteQueTraeDeMas() }));
    await pedirCopiaDeNota(
      sesion,
      { ...ENTRADA, motivo: 'peticion_paciente', referencia: 'REF-SECRETA' },
      { ip: null, agente: null },
    );
    expect(llamadas[0].args).toEqual({
      p_paciente_id: ID_PACIENTE,
      p_nota_id: ID_NOTA,
      p_motivo: 'peticion_paciente',
      p_referencia: 'REF-SECRETA',
    });
  });

  it('la copia del paciente sale sin reservadas ni canónico aunque la respuesta los traiga (proyectar)', async () => {
    const { sesion } = sesionSimulada(() => ({ data: respuestaPacienteQueTraeDeMas() }));
    const r = await pedirCopiaDeNota(sesion, { ...ENTRADA, motivo: 'peticion_paciente', referencia: 'REF' }, CONTEXTO);
    if (!r.ok) throw new Error('esperaba ok');
    expect(JSON.stringify(r.copia)).not.toContain('MARCA-RESERVADA');
    expect(JSON.stringify(r.copia)).not.toContain('contenido_canonico');
  });

  it.each([
    ['42501', 'La historia no está desbloqueada.', 'bloqueada'],
    ['42501', 'Falta el motivo de la copia.', 'falta_motivo'],
    ['42501', 'Sin acceso a esa nota.', 'sin_permiso'],
    ['42501', 'No puede exportar notas clínicas.', 'sin_permiso'],
    ['42501', 'Solo la administración pide copias con motivo.', 'sin_permiso'],
    ['42501', 'No hay sesión.', 'sin_permiso'],
    ['22023', 'La nota no tiene versiones firmadas.', 'sin_versiones'],
    ['22023', 'El motivo y la referencia van juntos.', 'error'],
    ['22023', 'Faltan el paciente o la nota.', 'error'],
    ['25006', 'La exportación exige una transacción de escritura.', 'error'],
    ['PGRST202', 'Could not find the function', 'error'],
    // El fragmento sin el código no basta: un 22023 con el texto del candado no es el candado.
    ['22023', 'La historia no está desbloqueada.', 'error'],
  ])('un %s «%s» se traduce a %s', async (code, message, motivo) => {
    const { sesion } = sesionSimulada(() => ({ error: { code, message, details: 'REF-SECRETA Lucía' } }));
    const r = await pedirCopiaDeNota(sesion, { ...ENTRADA, motivo: 'peticion_paciente', referencia: 'REF-SECRETA' }, CONTEXTO);
    expect(r).toEqual({ ok: false, motivo });
    // Solo el código, nunca el error entero (que puede llevar `details` con datos).
    expect(registros).toEqual([['exportaciones: exportar_nota falló', { code }]]);
    sinMarcasEnRegistros();
  });

  it('una respuesta que no cumple el contrato es error y no registra la respuesta ni el input de Zod', async () => {
    const mala = { ...respuestaProfesional(), cifrado: { formato_version: 2 } };
    const { sesion } = sesionSimulada(() => ({ data: mala }));
    const r = await pedirCopiaDeNota(sesion, ENTRADA, CONTEXTO);
    expect(r).toEqual({ ok: false, motivo: 'error' });
    expect(registros).toHaveLength(1);
    const [mensaje, datos] = registros[0] as [string, { problemas: { path: unknown[]; code: string }[] }];
    expect(mensaje).toBe('exportaciones: la respuesta no cumple el contrato');
    expect(Object.keys(datos)).toEqual(['problemas']);
    for (const p of datos.problemas) expect(Object.keys(p).sort()).toEqual(['code', 'path']);
    expect(datos.problemas.some((p) => p.path.join('.').startsWith('cifrado'))).toBe(true);
    sinMarcasEnRegistros();
  });

  it('sin datos y sin error es error', async () => {
    const { sesion } = sesionSimulada(() => ({ data: null }));
    expect(await pedirCopiaDeNota(sesion, ENTRADA, CONTEXTO)).toEqual({ ok: false, motivo: 'error' });
    sinMarcasEnRegistros();
  });
});

describe('registrarFichero', () => {
  it('llama a registrar_fichero_exportado con el id y la huella', async () => {
    const { sesion, llamadas } = sesionSimulada(() => ({ data: null }));
    const r = await registrarFichero(sesion, { exportacionId: ID_EXPORTACION, huellaHex: HUELLA });
    expect(r).toEqual({ ok: true });
    expect(llamadas).toEqual([
      { funcion: 'registrar_fichero_exportado', args: { p_exportacion_id: ID_EXPORTACION, p_huella_hex: HUELLA } },
    ]);
  });

  it.each([
    ['42501', 'Esa exportación no es tuya o ha caducado.', 'caducada'],
    ['42501', 'No puede exportar notas clínicas.', 'error'],
    ['23505', 'Esa copia ya tiene fichero registrado.', 'error'],
    ['22023', 'La huella del fichero no es válida.', 'error'],
  ])('un %s «%s» se traduce a %s', async (code, message, motivo) => {
    const { sesion } = sesionSimulada(() => ({ error: { code, message } }));
    const r = await registrarFichero(sesion, { exportacionId: ID_EXPORTACION, huellaHex: HUELLA });
    expect(r).toEqual({ ok: false, motivo });
    expect(registros).toEqual([['exportaciones: registrar_fichero_exportado falló', { code }]]);
  });
});

describe('notasParaCopia', () => {
  it('llama a notas_para_copia y da fecha legible, autor, versiones y enlace por ?nota=', async () => {
    const { sesion, llamadas } = sesionSimulada(() => ({
      data: [
        { nota_id: ID_NOTA, fecha_sesion: '2026-03-10', autor_nombre: 'Ana Martín', versiones: 2 },
      ],
    }));
    const r = await notasParaCopia(sesion, ID_PACIENTE);
    expect(llamadas).toEqual([{ funcion: 'notas_para_copia', args: { p_paciente_id: ID_PACIENTE } }]);
    expect(r).toEqual({
      ok: true,
      valor: [
        {
          id: ID_NOTA,
          fechaSesion: '10/03/2026',
          autor: 'Ana Martín',
          versiones: 2,
          href: `/pacientes/${ID_PACIENTE}/historia/notas?nota=${ID_NOTA}`,
        },
      ],
    });
  });

  it('cero filas es una lista vacía, y un fallo es { ok: false }, nunca una lista vacía', async () => {
    const vacia = sesionSimulada(() => ({ data: [] }));
    expect(await notasParaCopia(vacia.sesion, ID_PACIENTE)).toEqual({ ok: true, valor: [] });

    const fallo = sesionSimulada(() => ({ error: { code: '42501', message: 'x', details: 'Lucía' } }));
    expect(await notasParaCopia(fallo.sesion, ID_PACIENTE)).toEqual({ ok: false });
    expect(registros).toEqual([['exportaciones: notas_para_copia falló', { code: '42501' }]]);
  });
});
