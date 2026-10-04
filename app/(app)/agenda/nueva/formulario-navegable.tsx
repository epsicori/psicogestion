'use client';

import { useRouter } from 'next/navigation';

import { FormularioAlta, type PropsFormularioAlta } from './formulario-alta';

type Props = Omit<PropsFormularioAlta, 'alTerminar' | 'alCancelar'> & {
  /** `dialogo`: abierto por encima de la agenda, se cierra volviendo atrás. `pagina`: a la agenda. */
  modo: 'dialogo' | 'pagina';
};

/**
 * El formulario con su salida: la Server Action ya revalidó `/agenda`, así que basta con salir.
 * Un hueco guardado no se anuncia después de navegar (la región de estado desaparece con la
 * pantalla); el calendario de detrás es quien lo enseña.
 */
export function FormularioNavegable({ modo, ...props }: Props) {
  const router = useRouter();
  const salir = () => (modo === 'dialogo' ? router.back() : router.push('/agenda'));

  return <FormularioAlta {...props} alTerminar={salir} alCancelar={salir} />;
}
