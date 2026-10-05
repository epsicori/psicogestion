import type { OpcionDesplegable } from '@/components/ui/desplegable';

import type { Sesion } from '@/lib/cuentas/tipos';
import { formatearFechaSinZona } from '@/lib/fechas/relativo';
import { t } from '@/lib/i18n';

import type { PersonaConAltas } from './gestion-altas';

const ZONA_POR_DEFECTO = 'Europe/Madrid';

const ETIQUETA_DE_ROL: Record<string, string> = {
  profesional_sanitario: t('roles.profesionalSanitario'),
  administrador: t('roles.administrador'),
};

type PerfilDelDirectorio = { id: string; nombre_completo: string; rol: string };
type AltaLeida = { perfil_id: string; centro_id: string; principal: boolean; desde: string };

/**
 * Las filas planas que baja la pantalla. `tienePrincipal` es «tiene un alta PRINCIPAL
 * vigente», no «tiene alguna alta»: tras retirar el principal (estado D5) le quedan otras
 * altas y la base hará principal la siguiente que se dé (P2a), así que la confirmación
 * tiene que avisarlo.
 */
export function construirPersonas(
  perfiles: PerfilDelDirectorio[],
  altas: AltaLeida[],
  nombreDeCentro: Map<string, string>,
  zona: string,
): PersonaConAltas[] {
  return perfiles.map((perfil) => {
    const suyas = altas.filter((alta) => alta.perfil_id === perfil.id);
    return {
      perfilId: perfil.id,
      nombre: perfil.nombre_completo,
      rol: ETIQUETA_DE_ROL[perfil.rol] ?? perfil.rol,
      tienePrincipal: suyas.some((alta) => alta.principal),
      altas: suyas
        .map((alta) => ({
          centroId: alta.centro_id,
          nombre: nombreDeCentro.get(alta.centro_id) ?? '',
          principal: alta.principal,
          // Un `date` se ancla al mediodía en la zona: el día que entra es el que sale.
          desde: formatearFechaSinZona(alta.desde, zona),
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    };
  });
}

export type CargaDeAltas =
  | { ok: true; personas: PersonaConAltas[]; centros: OpcionDesplegable[] }
  | { ok: false };

/**
 * Lee lo que pinta `/ajustes/centros`. Las personas salen de `directorio_perfiles` y no de
 * `perfiles`: la única política de `perfiles` es `perfiles_lectura_propia`, y el
 * administrador se vería solo a sí mismo. Un error de lectura es un error, no una lista
 * vacía: la ausencia decide el texto de la confirmación («será su centro principal»).
 */
export async function cargarAltas(supabase: Sesion['supabase']): Promise<CargaDeAltas> {
  const [perfiles, altas, centros, organizacion] = await Promise.all([
    supabase
      .from('directorio_perfiles')
      .select('id, nombre_completo, rol, estado, centro_id')
      .eq('estado', 'activo')
      .in('rol', ['profesional_sanitario', 'administrador'])
      .order('nombre_completo'),
    supabase
      .from('perfiles_centros')
      .select('id, perfil_id, centro_id, principal, desde')
      .is('hasta', null),
    // Todos los centros, para nombrar cualquier alta vigente; solo los abiertos se ofrecen.
    supabase.from('centros').select('id, nombre, activo').order('nombre'),
    supabase.from('organizacion').select('zona_horaria').maybeSingle(),
  ]);

  let fallo = false;
  for (const [que, resultado] of [
    ['directorio_perfiles', perfiles],
    ['perfiles_centros', altas],
    ['centros', centros],
  ] as const) {
    if (resultado.error) {
      console.error(`PaginaAltasDeCentro: fallo al leer ${que}`, resultado.error);
      fallo = true;
    }
  }
  if (fallo) return { ok: false };

  const zona = organizacion.data?.zona_horaria ?? ZONA_POR_DEFECTO;
  const nombreDeCentro = new Map((centros.data ?? []).map((c) => [c.id, c.nombre]));

  // La vista declara todas sus columnas como anulables; una fila sin id o sin nombre no es
  // una persona a la que se pueda dar un alta.
  const personasDelDirectorio = (perfiles.data ?? []).flatMap((p) =>
    p.id && p.nombre_completo && p.rol
      ? [{ id: p.id, nombre_completo: p.nombre_completo, rol: p.rol }]
      : [],
  );

  return {
    ok: true,
    personas: construirPersonas(personasDelDirectorio, altas.data ?? [], nombreDeCentro, zona),
    // `dar_alta_centro()` rechaza un centro cerrado con 23514: no se ofrece.
    centros: (centros.data ?? []).filter((c) => c.activo).map((c) => ({ valor: c.id, etiqueta: c.nombre })),
  };
}
