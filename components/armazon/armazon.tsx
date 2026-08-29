import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ReactNode } from 'react';

import { t } from '@/lib/i18n';

import { exigirSesion } from '@/lib/supabase/sesion';

import { ArmazonCliente } from './armazon-cliente';
import { nombrarRol } from './modulos';

function franjaDelDia(hora: number) {
  if (hora < 6) return t('armazon.buenasNoches');
  if (hora < 14) return t('armazon.buenosDias');
  if (hora < 21) return t('armazon.buenasTardes');
  return t('armazon.buenasNoches');
}

/**
 * Componente de servidor: resuelve sesión y perfil, y deja al cliente solo lo que
 * necesita estado (el cajón de navegación en móvil y la ruta activa).
 */
export async function Armazon({ children }: { children: ReactNode }) {
  const { supabase, usuario } = await exigirSesion();

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('nombre_completo, rol')
    .eq('id', usuario.id)
    .maybeSingle();

  if (error) {
    // Sin perfil no hay identidad que mostrar, pero tampoco es motivo para tumbar
    // la pantalla: se registra y se cae al correo de la sesión.
    console.error('Armazon: fallo al cargar el perfil', error);
  }

  const nombreCompleto = perfil?.nombre_completo ?? usuario.email ?? t('armazon.sinPerfil');
  const ahora = new Date();
  const fecha = format(ahora, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });

  return (
    <ArmazonCliente
      nombreCompleto={nombreCompleto}
      rol={perfil ? nombrarRol(perfil.rol) : t('armazon.perfilSinAsignar')}
      saludo={`${franjaDelDia(ahora.getHours())}, ${nombreCompleto.split(' ')[0]}`}
      fecha={fecha.charAt(0).toUpperCase() + fecha.slice(1)}
    >
      {children}
    </ArmazonCliente>
  );
}
