// Envoltorio tipado del registro de accesos a la historia clínica (ADR-037). El algoritmo
// —una apertura, N vistas dentro de la ventana del desbloqueo— vive en la base, en
// `registrar_acceso_historia()`, y no aquí: depende del id del desbloqueo vigente, y ese
// id no sale de Postgres. Mensajes literales en castellano — lib/cuentas/ no importa
// lib/i18n/.
import type { Database } from '../supabase/tipos-bd';

import type { ResultadoCuentas, Sesion } from './tipos';

export type PestanaHistoria = Database['public']['Enums']['pestana_historia'];

export type AccesoRegistrado = {
  /** Id de la fila de `accesos_historia` de ESTA ventana, no de esta llamada. */
  accesoId: number;
  /** Contador leído de `accesos_historia_resumen`; empieza en 1, no en 0. */
  vistas: number;
  /** Cierto solo la primera vez dentro de la ventana. Las demás son vistas. */
  apertura: boolean;
};

/**
 * Registra que alguien ABRE contenido clínico de un paciente, y devuelve el contador de
 * la ventana. Se llama desde la Server Action de apertura, **nunca desde el renderizado**
 * (ADR-037): un componente de servidor que registra convierte cada recarga en una
 * escritura, y cada esqueleto de `<Suspense>` en un acceso que nadie hizo.
 *
 * Quien llama tiene que comprobar `ok` y **no enseñar nada si es falso**. No es una
 * cortesía: el registro es lo que hace lícita la lectura, así que una lectura que no se
 * pudo registrar es una lectura que no debe ocurrir. La base ya lo impone por su lado
 * —sin desbloqueo vigente levanta 42501 y no escribe—, y esto es la otra mitad.
 *
 * Nunca lanza.
 */
export async function registrarAccesoHistoria(
  sesion: Sesion,
  pacienteId: string,
  pestana: PestanaHistoria,
  contexto: { ip?: string | null; agente?: string | null } = {},
): Promise<ResultadoCuentas<AccesoRegistrado>> {
  const { data, error } = await sesion.supabase.rpc('registrar_acceso_historia', {
    p_paciente_id: pacienteId,
    p_pestana: pestana,
    p_agente: contexto.agente ?? undefined,
    p_ip: contexto.ip ?? undefined,
  });

  if (error) {
    // 42501 lo levantan las dos guardias de la función —sin desbloqueo vigente, o el
    // paciente no es de quien llama— y no se distinguen desde aquí a propósito: el
    // mensaje que ve el usuario no debe revelar si ese paciente existe.
    console.error('registrarAccesoHistoria: la base rechazó el registro', error);
    return error.code === '42501'
      ? { ok: false, motivo: 'denegado', mensaje: 'No se puede abrir esta historia.' }
      : { ok: false, motivo: 'error', mensaje: 'No se pudo registrar el acceso.' };
  }

  const fila = data?.[0];
  if (!fila) {
    // La función devuelve siempre una fila o levanta. Si no hay ninguna, algo cambió
    // debajo y lo seguro es no abrir.
    console.error('registrarAccesoHistoria: registrar_acceso_historia() no devolvió fila');
    return { ok: false, motivo: 'error', mensaje: 'No se pudo registrar el acceso.' };
  }

  return { ok: true, accesoId: fila.acceso_id, vistas: fila.vistas, apertura: fila.apertura };
}
