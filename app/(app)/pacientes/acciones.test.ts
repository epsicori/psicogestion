import { describe, expect, it, vi, beforeEach } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const exigirSesion = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ exigirSesion: () => exigirSesion() }));

const cifrarIdentificacion = vi.fn();
vi.mock('@/lib/cifrado/identificacion', () => ({
  cifrarIdentificacion: (...args: unknown[]) => cifrarIdentificacion(...args),
}));

const { crearPaciente } = await import('./acciones');

// Lo que `cifrarIdentificacion` devuelve cuando no hay documento ni domicilio.
const COLUMNAS_VACIAS = {
  p_tipo_documento: null,
  p_dni_cifrado: null,
  p_dni_nonce: null,
  p_dni_etiqueta: null,
  p_dni_indice: null,
  p_domicilio_cifrado: null,
  p_domicilio_nonce: null,
  p_domicilio_etiqueta: null,
  p_clave_version: 1,
  p_indice_clave_version: 1,
};

// Lo que la acción debe mandar al RPC: `acciones.ts` traduce los `null` de arriba en
// `undefined`, porque el tipo generado de `alta_paciente` no admite `null` explícito.
const COLUMNAS_VACIAS_EN_EL_RPC = {
  p_tipo_documento: undefined,
  p_dni_cifrado: undefined,
  p_dni_nonce: undefined,
  p_dni_etiqueta: undefined,
  p_dni_indice: undefined,
  p_domicilio_cifrado: undefined,
  p_domicilio_nonce: undefined,
  p_domicilio_etiqueta: undefined,
  p_clave_version: 1,
  p_indice_clave_version: 1,
};

const DATOS_MINIMOS = { nombre: 'Lucía', apellidos: 'Márquez', fechaNacimiento: '1990-05-20' };

function crearSupabaseFalso(resultadoRpc: { data?: unknown; error?: unknown } = { data: 'uuid-1', error: null }) {
  return { rpc: vi.fn().mockResolvedValue(resultadoRpc) };
}

describe('crearPaciente', () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    exigirSesion.mockReset();
    cifrarIdentificacion.mockReset();
    cifrarIdentificacion.mockResolvedValue(COLUMNAS_VACIAS);
  });

  it('con una carga inválida (sin fecha de nacimiento) devuelve el error en el campo, sin tocar la base', async () => {
    const supabase = crearSupabaseFalso();
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: 'prof-1' } });

    const estado = await crearPaciente({ nombre: 'Lucía', apellidos: 'Márquez' });

    expect(estado.errores?.fechaNacimiento).toBeTruthy();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('con el alta mínima, llama al RPC con los seis opcionales en null', async () => {
    const supabase = crearSupabaseFalso();
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: 'prof-1' } });

    const estado = await crearPaciente(DATOS_MINIMOS);

    expect(cifrarIdentificacion).toHaveBeenCalledWith({ documento: undefined, domicilio: undefined });
    expect(supabase.rpc).toHaveBeenCalledWith('alta_paciente', {
      p_nombre: 'Lucía',
      p_apellidos: 'Márquez',
      p_fecha_nacimiento: '1990-05-20',
      p_sexo: undefined,
      p_telefono: undefined,
      ...COLUMNAS_VACIAS_EN_EL_RPC,
      p_alergias: undefined,
      p_medicacion_actual: undefined,
    });
    expect(estado).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith('/pacientes');
  });

  it('un 23505 del RPC se enseña como error del campo DNI, sin mensaje general', async () => {
    const supabase = crearSupabaseFalso({ data: null, error: { code: '23505', message: 'duplicate key' } });
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: 'prof-1' } });

    const estado = await crearPaciente({ ...DATOS_MINIMOS, dni: '12345678Z' });

    expect(estado.errores).toEqual({ dni: ['Ese documento ya está dado de alta'] });
    expect(estado.mensaje).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('cualquier otro error del RPC da un mensaje genérico, no el texto de Postgres', async () => {
    const supabase = crearSupabaseFalso({ data: null, error: { code: '42501', message: 'texto interno de Postgres' } });
    exigirSesion.mockResolvedValue({ supabase, usuario: { id: 'prof-1' } });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const estado = await crearPaciente(DATOS_MINIMOS);

    expect(estado.mensaje).toBe('No se pudo crear el paciente');
    expect(estado.mensaje).not.toContain('texto interno de Postgres');
    expect(estado.errores).toBeUndefined();
    consoleError.mockRestore();
  });
});
