'use server';

import { headers } from 'next/headers';

import type { MotivoExportacion } from '@/lib/exportaciones/constantes';
import * as servidor from '@/lib/exportaciones/servidor';
import { exigirSesion } from '@/lib/supabase/sesion';

import { ipDeLaPeticion } from '../../peticion';
import { esquemaPedirCopia, esquemaRegistrarFichero } from './esquemas-copia';

/**
 * T-040 · Las Server Actions de la copia cifrada solo envuelven `lib/exportaciones/servidor.ts`:
 * sesión, Zod, servidor, en ese orden. **Ninguna recibe la contraseña**: el cifrado ocurre en el
 * navegador y aquí solo llegan los identificadores, el motivo y, después, la huella del fichero.
 */

export async function pedirCopiaDeNota(entrada: {
  pacienteId: string;
  notaId: string;
  motivo: MotivoExportacion | null;
  referencia: string | null;
}): Promise<servidor.ResultadoCopia> {
  const sesion = await exigirSesion();
  const validada = esquemaPedirCopia.safeParse(entrada);
  if (!validada.success) return { ok: false, motivo: 'error' };

  const cabeceras = await headers();
  return servidor.pedirCopiaDeNota(sesion, validada.data, {
    ip: ipDeLaPeticion(cabeceras),
    agente: cabeceras.get('user-agent'),
  });
}

export async function registrarFicheroDeCopia(entrada: {
  pacienteId: string;
  exportacionId: string;
  huellaHex: string;
}): Promise<servidor.ResultadoRegistroFichero> {
  const sesion = await exigirSesion();
  const validada = esquemaRegistrarFichero.safeParse(entrada);
  if (!validada.success) return { ok: false, motivo: 'error' };
  return servidor.registrarFichero(sesion, {
    exportacionId: validada.data.exportacionId,
    huellaHex: validada.data.huellaHex,
  });
}
