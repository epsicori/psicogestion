// T-012 · `firmarVersionNota` conserva el SQLSTATE del fallo de la base: la Server Action
// tiene que distinguir un 42501 (candado/permiso) de un 23514 (cabecera cambiada) y de un
// 23505 (otra firma entró antes), y con un `Error` a secas esa información se perdía.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/supabase/tipos-bd';

import { ErrorFirmaVersion, firmarVersionNota } from './firmar';
import type { EntradaFirma } from './sobre';

const ID = '11111111-1111-4111-8111-111111111111';

function entrada(): EntradaFirma {
  return {
    notaId: ID,
    pacienteId: ID,
    episodioId: ID,
    fechaSesion: '2026-10-02',
    coprofesionalId: null,
    autorId: ID,
    cuerpo: { texto: 'hola' },
    anotacionesReservadas: null,
    motivoCambio: null,
    alcance: 'individual',
    citaId: null,
    ventanaCita: null,
    margenMinutos: null,
    abiertaEn: new Date('2026-10-02T09:00:00.000Z'),
    ahora: new Date('2026-10-02T09:10:00.000Z'),
  };
}

function clienteQueFalla(error: { code?: string; message: string }) {
  const single = vi.fn().mockResolvedValue({ data: null, error });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { cliente: { from } as unknown as SupabaseClient<Database>, insert };
}

describe('firmarVersionNota · errores', () => {
  it.each(['42501', '23514', '23505'])(
    'un fallo %s llega como ErrorFirmaVersion con su código',
    async (code) => {
      const { cliente } = clienteQueFalla({ code, message: 'rechazado por la base' });
      const intento = firmarVersionNota(cliente, entrada());
      await expect(intento).rejects.toBeInstanceOf(ErrorFirmaVersion);
      await expect(intento).rejects.toMatchObject({ codigo: code });
    },
  );

  it('mantiene el prefijo del mensaje y el código nulo si la base no manda ninguno', async () => {
    const { cliente } = clienteQueFalla({ message: 'sin código' });
    const intento = firmarVersionNota(cliente, entrada());
    await expect(intento).rejects.toThrow(/^No se pudo firmar la versión de la nota: sin código/);
    await expect(intento).rejects.toMatchObject({ codigo: null });
  });
});
