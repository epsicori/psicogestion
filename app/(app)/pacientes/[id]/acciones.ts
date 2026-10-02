'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { registrarAccesoHistoria, type PestanaHistoria } from '@/lib/cuentas/accesos';
import { bloquearHistoria, estadoDeCuenta, prolongarDesbloqueo } from '@/lib/cuentas/candado';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { ipDeLaPeticion } from './peticion';
import { agruparPorEpisodio, type EpisodioDeVista, type NivelDeRiesgo } from './presentacion';

/**
 * La única puerta al contenido clínico de la ficha (ADR-056).
 *
 * Lo que hace en este orden, y el orden es el contrato:
 *   1. exige sesión — no se hereda del Proxy, que es una guardia optimista;
 *   2. valida el UUID y la pestaña, porque una Server Action es un punto de entrada
 *      público y el componente de cliente no es la única forma de llamarla;
 *   3. **registra el acceso**, que es lo que hace lícita la lectura;
 *   4. y solo si el registro salió bien, lee.
 *
 * Si el paso 3 falla, el paso 4 no ocurre: una lectura que no se pudo registrar es una
 * lectura que no debe ocurrir. No es una comprobación de permisos duplicada —RLS también
 * lo impediría— sino la garantía de la trazabilidad del art. 15 de la Ley 41/2002: en esta
 * pantalla, aparecer contenido clínico y existir la fila de acceso son lo mismo.
 */

const PESTANAS = [
  'historial_clinico',
  'notas_clinicas',
  'evaluaciones',
  'informes',
  'documentos',
] as const;

const esquemaApertura = z.object({
  pacienteId: z.uuid(),
  pestana: z.enum(PESTANAS),
});

export type ValoracionDeVista = {
  id: string;
  nivel: NivelDeRiesgo;
  valoradoEn: string;
  descripcion: string | null;
  planSeguridad: string | null;
};

export type ContenidoDelHistorial = {
  episodios: EpisodioDeVista[];
  valoraciones: ValoracionDeVista[];
};

export type ResultadoDeApertura =
  | {
      abierta: true;
      caducaEn: string | null;
      /** Veces que se ha abierto esta historia desde que se metió el PIN. */
      vistas: number;
      /** `historial_clinico` trae contenido; las otras tres todavía no tienen suyo. */
      historial: ContenidoDelHistorial | null;
    }
  | { abierta: false; mensaje: string };

export async function abrirPestanaDeHistoria(
  pacienteId: string,
  pestana: PestanaHistoria,
): Promise<ResultadoDeApertura> {
  const sesion = await exigirSesion();

  const validado = esquemaApertura.safeParse({ pacienteId, pestana });
  if (!validado.success) {
    return { abierta: false, mensaje: t('ficha.noSePudoAbrir') };
  }

  const cabeceras = await headers();
  const acceso = await registrarAccesoHistoria(sesion, validado.data.pacienteId, validado.data.pestana, {
    agente: cabeceras.get('user-agent'),
    ip: ipDeLaPeticion(cabeceras),
  });

  if (!acceso.ok) {
    return { abierta: false, mensaje: t('ficha.noSePudoAbrir') };
  }

  const estado = await estadoDeCuenta(sesion);

  return {
    abierta: true,
    caducaEn: estado?.desbloqueoCaducaEn ?? null,
    vistas: acceso.vistas,
    historial:
      validado.data.pestana === 'historial_clinico'
        ? await leerHistorial(sesion.supabase, validado.data.pacienteId)
        : null,
  };
}

type Cliente = Awaited<ReturnType<typeof exigirSesion>>['supabase'];

/**
 * Tres consultas y no un `select` anidado: `episodios_asistenciales`, `diagnosticos` y
 * `valoraciones_riesgo` tienen **tres políticas distintas**, y anidarlas haría que un
 * diagnóstico invisible se llevara por delante a su episodio.
 *
 * No hace falta comprobar el candado aquí: las tres políticas empiezan por
 * `historia_desbloqueada()`. Si la ventana se cerró entre el registro y esta lectura, lo
 * que vuelve son listas vacías — y eso es exactamente lo correcto.
 */
async function leerHistorial(supabase: Cliente, pacienteId: string): Promise<ContenidoDelHistorial> {
  const [episodios, diagnosticos, valoraciones] = await Promise.all([
    supabase
      .from('episodios_asistenciales')
      .select('id, motivo_consulta, modalidad_relacional, abierto_en, cerrado_en')
      .eq('paciente_id', pacienteId)
      .order('abierto_en', { ascending: false }),
    supabase
      .from('diagnosticos')
      .select('id, episodio_id, cie10es_codigo, cie10es_descripcion, principal, retirado_en')
      .eq('paciente_id', pacienteId),
    supabase
      .from('valoraciones_riesgo')
      .select('id, nivel, valorado_en, descripcion, plan_seguridad')
      .eq('paciente_id', pacienteId)
      .order('valorado_en', { ascending: false }),
  ]);

  if (episodios.error || diagnosticos.error || valoraciones.error) {
    console.error('leerHistorial: fallo al leer el historial clínico', {
      episodios: episodios.error,
      diagnosticos: diagnosticos.error,
      valoraciones: valoraciones.error,
    });
  }

  return {
    episodios: agruparPorEpisodio(episodios.data ?? [], diagnosticos.data ?? []),
    valoraciones: (valoraciones.data ?? []).map((v) => ({
      id: v.id,
      nivel: v.nivel,
      valoradoEn: v.valorado_en,
      descripcion: v.descripcion,
      planSeguridad: v.plan_seguridad,
    })),
  };
}

/** Cierra el candado de quien llama. No lleva paciente: el candado es de la persona. */
export async function cerrarHistoriaDelPaciente(): Promise<{ cerradas: number }> {
  const sesion = await exigirSesion();
  return { cerradas: await bloquearHistoria(sesion) };
}

/**
 * Amplía una ventana ya abierta. Cuelga de un botón y **nunca del renderizado** (ADR-026):
 * prolongar al pintar sería un candado que no se cierra mientras alguien tenga la pestaña
 * olvidada, que es justo lo que el candado existe para evitar.
 */
export async function ampliarLaVentana(): Promise<{ caducaEn: string | null }> {
  const sesion = await exigirSesion();
  return { caducaEn: await prolongarDesbloqueo(sesion) };
}
