import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase/administracion', () => ({ crearClienteAdministracion: vi.fn() }));

import { crearClienteAdministracion } from '../supabase/administracion';
import type { DatosInvitacion } from './esquemas';
import { invitarPerfil } from './invitar';
import type { Sesion } from './tipos';

/**
 * T-041 (diseño P4 y P12). Lo que decide la base —quién puede invitar, qué centro exige el
 * técnico, quién puede dar un alta— se prueba en `scripts/rls/`. Aquí, lo que decide este
 * fichero: el ORDEN de los pasos, que el centro principal de los metadatos sea el elegido y
 * no el primero de la lista, y que las altas adicionales vayan con la sesión del
 * administrador y nunca con la clave de servicio.
 */
const A = 'c0000000-0000-4000-8000-00000000000a';
const B = 'c0000000-0000-4000-8000-00000000000b';
const C = 'c0000000-0000-4000-8000-00000000000c';
const PERFIL = 'b0000000-0000-4000-8000-000000000001';

type Respuesta = { data?: unknown; error?: { code?: string; message?: string } | null };

function preparar(opciones: {
  preparar?: (args: { p_centro_id: string | null }) => Respuesta;
  darAlta?: (args: { p_centro_id: string }) => Respuesta;
  registrar?: () => Respuesta;
  /** Centros que la lectura de centros devuelve como cerrados (por defecto, ninguno). */
  cerrados?: string[];
} = {}) {
  const orden: string[] = [];
  const rpc = vi.fn(async (nombre: string, args: Record<string, unknown>) => {
    orden.push(`${nombre}:${String(args.p_centro_id ?? args.p_perfil_id ?? '')}`);
    let r: Respuesta = {};
    if (nombre === 'preparar_invitacion' && opciones.preparar) {
      r = opciones.preparar(args as { p_centro_id: string | null });
    }
    if (nombre === 'dar_alta_centro' && opciones.darAlta) {
      r = opciones.darAlta(args as { p_centro_id: string });
    }
    if (nombre === 'registrar_invitacion' && opciones.registrar) r = opciones.registrar();
    return { data: r.data ?? null, error: r.error ?? null };
  });
  // from('centros').select(...).in('id', ids): la comprobación de que siguen abiertos.
  const from = vi.fn((tabla: string) => ({
    select: () => ({
      in: async (_columna: string, ids: string[]) => {
        orden.push(`leer:${tabla}`);
        return {
          data: ids.map((id) => ({ id, activo: !(opciones.cerrados ?? []).includes(id) })),
          error: null,
        };
      },
    }),
  }));
  const sesion = { supabase: { rpc, from }, usuario: { id: 'adm' } } as unknown as Sesion;

  // El cliente de administración NO tiene `rpc`: si invitar.ts lo usara para dar un alta,
  // la prueba lanzaría en vez de pasar.
  const inviteUserByEmail = vi.fn(async () => {
    orden.push('inviteUserByEmail');
    return { data: { user: { id: PERFIL } }, error: null };
  });
  const adminRpc = vi.fn();
  vi.mocked(crearClienteAdministracion).mockReturnValue({
    auth: { admin: { inviteUserByEmail } },
    rpc: adminRpc,
  } as never);

  return { sesion, rpc, inviteUserByEmail, adminRpc, orden };
}

function entrada(datos: Partial<DatosInvitacion>): DatosInvitacion {
  return {
    correo: 'ana@ejemplo.es',
    nombreCompleto: 'Ana Pérez',
    rol: 'profesional_sanitario',
    centrosIds: [],
    centroPrincipalId: null,
    ...datos,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('invitarPerfil (T-041)', () => {
  it('(a) con [A, B] y principal B: valida A y B antes de invitar, B en metadatos, y un solo alta adicional (A) por la sesión', async () => {
    const { sesion, rpc, inviteUserByEmail, adminRpc, orden } = preparar();

    const r = await invitarPerfil(sesion, entrada({ centrosIds: [A, B], centroPrincipalId: B }));

    expect(r).toEqual({ ok: true, perfilId: PERFIL, altasSinDar: [] });
    expect(orden).toEqual([
      `preparar_invitacion:${A}`,
      `preparar_invitacion:${B}`,
      'leer:centros',
      'inviteUserByEmail',
      `registrar_invitacion:${PERFIL}`,
      `dar_alta_centro:${A}`,
    ]);
    expect(inviteUserByEmail).toHaveBeenCalledWith('ana@ejemplo.es', {
      data: { rol: 'profesional_sanitario', centro_id: B, nombre_completo: 'Ana Pérez' },
    });
    expect(rpc).toHaveBeenCalledWith('dar_alta_centro', { p_perfil_id: PERFIL, p_centro_id: A });
    expect(rpc.mock.calls.filter(([n]) => n === 'dar_alta_centro')).toHaveLength(1);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('(a, gemela) el centro de los metadatos es el principal elegido, no centrosIds[0]', async () => {
    const { sesion, inviteUserByEmail } = preparar();

    await invitarPerfil(sesion, entrada({ centrosIds: [A, B], centroPrincipalId: A }));

    expect(inviteUserByEmail).toHaveBeenCalledWith(
      'ana@ejemplo.es',
      expect.objectContaining({ data: expect.objectContaining({ centro_id: A }) }),
    );
  });

  it('(b) si preparar_invitacion falla en el segundo centro, no se envía la invitación', async () => {
    const { sesion, inviteUserByEmail, rpc } = preparar({
      preparar: ({ p_centro_id }) =>
        p_centro_id === B ? { error: { code: '23503', message: 'no existe' } } : {},
    });

    const r = await invitarPerfil(sesion, entrada({ centrosIds: [A, B], centroPrincipalId: A }));

    expect(r).toEqual({
      ok: false,
      motivo: 'preparacion',
      mensaje: 'No se pudo preparar la invitación. Revisa el rol y el centro.',
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(['preparar_invitacion', 'preparar_invitacion']);
  });

  it('(c) si dar_alta_centro falla, la invitación ya salió: ok con altasSinDar', async () => {
    const { sesion } = preparar({
      darAlta: () => ({ error: { code: '23514', message: 'El centro está cerrado.' } }),
    });

    const r = await invitarPerfil(sesion, entrada({ centrosIds: [A, B], centroPrincipalId: B }));

    expect(r).toEqual({ ok: true, perfilId: PERFIL, altasSinDar: [A] });
  });

  it('(c2) con dos altas adicionales y la primera fallando: se intenta la segunda y solo la primera queda sin dar', async () => {
    const { sesion, rpc } = preparar({
      darAlta: ({ p_centro_id }) =>
        p_centro_id === B ? { error: { code: '23514', message: 'El centro está cerrado.' } } : {},
    });

    const r = await invitarPerfil(sesion, entrada({ centrosIds: [A, B, C], centroPrincipalId: A }));

    expect(r).toEqual({ ok: true, perfilId: PERFIL, altasSinDar: [B] });
    expect(rpc.mock.calls.filter(([n]) => n === 'dar_alta_centro').map(([, a]) => a)).toEqual([
      { p_perfil_id: PERFIL, p_centro_id: B },
      { p_perfil_id: PERFIL, p_centro_id: C },
    ]);
  });

  it('(c3) con las dos adicionales fallando, las dos quedan sin dar', async () => {
    const { sesion } = preparar({ darAlta: () => ({ error: { code: '23514', message: 'cerrado' } }) });

    const r = await invitarPerfil(sesion, entrada({ centrosIds: [A, B, C], centroPrincipalId: A }));

    expect(r).toEqual({ ok: true, perfilId: PERFIL, altasSinDar: [B, C] });
  });

  it('B-H3: si registrar_invitacion falla, la cuenta existe y se devuelven las altas adicionales que no se dieron', async () => {
    const { sesion, rpc } = preparar({
      registrar: () => ({ error: { code: 'XX000', message: 'transitorio' } }),
    });

    const r = await invitarPerfil(sesion, entrada({ centrosIds: [A, B, C], centroPrincipalId: A }));

    expect(r).toEqual({
      ok: false,
      motivo: 'registro',
      mensaje: 'La cuenta se creó, pero no se pudo dejar constancia de la invitación.',
      altasSinDar: [B, C],
    });
    expect(rpc.mock.calls.some(([n]) => n === 'dar_alta_centro')).toBe(false);
  });

  it('B-H3 (gemela): sin centros adicionales, el fallo de registro no lista altas', async () => {
    const { sesion } = preparar({
      registrar: () => ({ error: { code: 'XX000', message: 'transitorio' } }),
    });

    const r = await invitarPerfil(sesion, entrada({ centrosIds: [A], centroPrincipalId: A }));

    expect(r).toMatchObject({ ok: false, motivo: 'registro', altasSinDar: [] });
  });

  it.each([
    ['el principal', [A, B], A, [A]],
    ['una adicional', [A, B], A, [B]],
  ])('B-H4: si %s se cerró entre la carga y el envío, no se crea la cuenta', async (_que, centrosIds, principal, cerrados) => {
    const { sesion, inviteUserByEmail, rpc } = preparar({ cerrados });

    const r = await invitarPerfil(sesion, entrada({ centrosIds, centroPrincipalId: principal }));

    expect(r).toEqual({
      ok: false,
      motivo: 'centro',
      mensaje: 'Un centro elegido ya no está abierto. Recarga la pantalla y revisa los centros.',
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(rpc.mock.calls.some(([n]) => n === 'dar_alta_centro')).toBe(false);
  });

  it('(d) con [] una sola preparar_invitacion con centro nulo y ningún dar_alta_centro', async () => {
    const { sesion, rpc, inviteUserByEmail } = preparar();

    const r = await invitarPerfil(sesion, entrada({ centrosIds: [], centroPrincipalId: null }));

    expect(r).toEqual({ ok: true, perfilId: PERFIL, altasSinDar: [] });
    const preparaciones = rpc.mock.calls.filter(([n]) => n === 'preparar_invitacion');
    expect(preparaciones).toEqual([
      ['preparar_invitacion', { p_rol: 'profesional_sanitario', p_centro_id: null }],
    ]);
    expect(rpc.mock.calls.some(([n]) => n === 'dar_alta_centro')).toBe(false);
    expect(inviteUserByEmail).toHaveBeenCalledWith(
      'ana@ejemplo.es',
      expect.objectContaining({ data: expect.objectContaining({ centro_id: null }) }),
    );
  });

  it('el técnico con un centro: preparar con ese centro y ninguna alta adicional', async () => {
    const { sesion, rpc } = preparar();

    const r = await invitarPerfil(
      sesion,
      entrada({ rol: 'tecnico_administrativo', centrosIds: [A], centroPrincipalId: A }),
    );

    expect(r).toEqual({ ok: true, perfilId: PERFIL, altasSinDar: [] });
    expect(rpc).toHaveBeenCalledWith('preparar_invitacion', {
      p_rol: 'tecnico_administrativo',
      p_centro_id: A,
    });
    expect(rpc.mock.calls.some(([n]) => n === 'dar_alta_centro')).toBe(false);
  });
});
