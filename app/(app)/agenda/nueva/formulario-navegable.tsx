'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { anunciar, prepararAnuncio } from './anunciar';
import { FormularioAlta, type PropsFormularioAlta } from './formulario-alta';

type Props = Omit<PropsFormularioAlta, 'alTerminar' | 'alCancelar'> & {
  /** `dialogo`: abierto por encima de la agenda, se cierra volviendo atrás. `pagina`: a la agenda. */
  modo: 'dialogo' | 'pagina';
};

/**
 * El formulario con su salida: la Server Action ya revalidó `/agenda`, así que basta con salir.
 * Al guardar se anuncia el éxito en una región que no se va con la pantalla, y desde la página se
 * lleva a la semana y al centro de la cita (`/agenda?fecha=&centro=`, los parámetros de
 * `leerParametros`), para que se vea donde quedó: sin el centro abriría el de la cookie. Cancelar no anuncia nada.
 */
export function FormularioNavegable({ modo, ...props }: Props) {
  const router = useRouter();
  // La región de estado tiene que existir antes del anuncio (H14).
  useEffect(() => {
    prepararAnuncio();
  }, []);
  const cancelar = () => (modo === 'dialogo' ? router.back() : router.push('/agenda'));
  const terminar = ({ anuncio, fecha, centroId }: { anuncio: string; fecha: string; centroId: string }) => {
    anunciar(anuncio);
    if (modo === 'dialogo') router.back();
    else router.push(`/agenda?fecha=${encodeURIComponent(fecha)}&centro=${encodeURIComponent(centroId)}`);
  };

  return <FormularioAlta {...props} alTerminar={terminar} alCancelar={cancelar} />;
}
