import type { ReactNode } from 'react';

import { Armazon } from '@/components/armazon/armazon';

/**
 * Envoltura de todo el espacio de trabajo con sesión: barra lateral, cabecera y
 * el contenedor de contenido. Las rutas del grupo `(app)` no añaden segmento a la
 * URL, así que `/pacientes` sigue siendo `/pacientes`.
 */
export default function LayoutApp({ children }: { children: ReactNode }) {
  return <Armazon>{children}</Armazon>;
}
