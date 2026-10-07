'use client';

import { useRouter } from 'next/navigation';

import { Desplegable } from '@/components/ui/desplegable';
import { t } from '@/lib/i18n';

type Props = {
  opciones: { id: string; nombre: string }[];
  elegido: string | null;
};

/** «Todos» es la cadena vacía: sin parámetro en la URL. */
const TODOS = '';

/**
 * Solo lo monta `page.tsx` para el administrador (D11). El filtro va por la URL y lo vuelve a leer
 * el servidor: aquí no se filtra nada.
 */
export function SelectorProfesional({ opciones, elegido }: Props) {
  const router = useRouter();

  return (
    <div className="w-full max-w-xs">
      <Desplegable
        etiqueta={t('cobros.profesional')}
        marcador={t('cobros.todosLosProfesionales')}
        valor={elegido ?? TODOS}
        opciones={[
          { valor: TODOS, etiqueta: t('cobros.todosLosProfesionales') },
          ...opciones.map((o) => ({ valor: o.id, etiqueta: o.nombre })),
        ]}
        alElegir={(valor) =>
          router.replace(valor === TODOS ? '/facturacion' : `/facturacion?profesional=${valor}`, { scroll: false })
        }
      />
    </div>
  );
}
