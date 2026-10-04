import type { ReactNode } from 'react';

import { Armazon } from '@/components/armazon/armazon';

/**
 * Envoltura de todo el espacio de trabajo con sesión: barra lateral, cabecera y
 * el contenedor de contenido. Las rutas del grupo `(app)` no añaden segmento a la
 * URL, así que `/pacientes` sigue siendo `/pacientes`. `modal` es el espacio paralelo
 * donde se abre, por encima de la agenda, el alta de cita (T-028 B).
 */
export default function LayoutApp({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <Armazon>
      {children}
      {modal}
    </Armazon>
  );
}
