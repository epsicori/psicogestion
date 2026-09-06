// T-005 · La cara de aplicación de la firma.
//
// NO lleva la directiva `"use server"` y no vive en `app/`: la pantalla de
// notas es fase 1 (territorio del carril de MiniMax). Este módulo es la
// función que la Server Action de esa fase envolverá en una línea. Lo que el
// ticket exige de la firma —canonizar, calcular, encadenar e insertar todo en
// una transacción— se cumple aquí (construcción del sobre) y en el
// disparador `fn_sellar_version_nota()` de la migración (cálculo, encadenado
// e inserción: un `insert` es su propia transacción).
//
// Este módulo no calcula ningún hash y no importa `node:crypto`: el SHA-256
// tiene una sola implementación en todo el sistema, pgcrypto, en la base.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/tipos-bd';

import { canonizar } from './jcs';
import { construirSobre, type EntradaFirma } from './sobre';

export interface ResultadoFirma {
  id: string;
  numeroVersion: number;
  posicionCadena: number;
  huellaHex: string;
}

/** PostgREST serializa `bytea` como texto hex con el prefijo `\x`. */
function hexDeBytea(valor: string): string {
  return valor.replace(/^\\x/i, '');
}

/** Construye el sobre, lo canoniza y lo inserta. El sellado lo hace la base. */
export async function firmarVersionNota(
  cliente: SupabaseClient<Database>,
  entrada: EntradaFirma,
): Promise<ResultadoFirma> {
  const sobre = construirSobre(entrada);
  const contenidoCanonico = canonizar(sobre);
  // El cuerpo también se guarda ya normalizado a NFC: es lo que sobre.cuerpo
  // contiene tras construirSobre(). La comprobación de coherencia del
  // disparador es de igualdad jsonb (semántica), no de bytes.
  const cuerpoCanonico = canonizar(sobre.cuerpo);

  // No se manda `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena`
  // ni `numero_version`: el disparador `fn_sellar_version_nota()` lanza si
  // llegan no nulos (§6 del diseño aprobado). El tipo `Insert` generado los
  // marca como obligatorios porque son NOT NULL sin DEFAULT en el esquema —el
  // generador no sabe que un disparador los rellena—, así que el payload real
  // (deliberadamente incompleto) se afirma contra ese tipo a propósito.
  const payload = {
    nota_id: entrada.notaId,
    cuerpo: cuerpoCanonico,
    anotaciones_reservadas: sobre.anotaciones_reservadas,
    contenido_canonico: contenidoCanonico,
    motivo_cambio: sobre.motivo_cambio,
    alcance: entrada.alcance,
    esquema_version: sobre.esquema_version,
    autor_id: sobre.autor_id,
    creada_en: sobre.creada_en,
  } as Database['public']['Tables']['notas_clinicas_versiones']['Insert'];

  const { data, error } = await cliente
    .from('notas_clinicas_versiones')
    .insert(payload)
    .select('id, numero_version, posicion_cadena, huella')
    .single();

  if (error) {
    throw new Error(`No se pudo firmar la versión de la nota: ${error.message}`);
  }

  return {
    id: data.id as string,
    numeroVersion: data.numero_version as number,
    posicionCadena: data.posicion_cadena as number,
    huellaHex: hexDeBytea(data.huella as unknown as string),
  };
}
