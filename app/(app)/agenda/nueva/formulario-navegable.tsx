'use client';

import { useRouter } from 'next/navigation';

import { anunciar } from './anunciar';
import { FormularioAlta, type PropsFormularioAlta } from './formulario-alta';

type Props = Omit<PropsFormularioAlta, 'alTerminar' | 'alCancelar'> & {
  /** `dialogo`: abierto por encima de la agenda, se cierra volviendo atrás. `pagina`: a la agenda. */
  modo: 'dialogo' | 'pagina';
};

/**
 * El formulario con su salida: la Server Action ya revalidó `/agenda`, así que basta con salir.
 * Al guardar se anuncia el éxito en una región que no se va con la pantalla, y desde la página se
 * lleva a la semana de la cita (`/agenda?fecha=`, el parámetro de `leerParametros`), para que se
 * vea donde quedó. Cancelar no anuncia nada.
 */
export function FormularioNavegable({ modo, ...props }: Props) {
  const router = useRouter();
  const cancelar = () => (modo === 'dialogo' ? router.back() : router.push('/agenda'));
  const terminar = ({ anuncio, fecha }: { anuncio: string; fecha: string }) => {
    anunciar(anuncio);
    if (modo === 'dialogo') router.back();
    else router.push(`/agenda?fecha=${encodeURIComponent(fecha)}`);
  };

  return <FormularioAlta {...props} alTerminar={terminar} alCancelar={cancelar} />;
}
