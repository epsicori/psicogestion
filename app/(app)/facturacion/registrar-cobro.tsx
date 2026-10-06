'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialogo } from '@/components/ui/dialogo';
import { t } from '@/lib/i18n';

import { FormularioCobro } from './formulario-cobro';

type Props = {
  pacientes: { id: string; nombre: string; apellidos: string }[];
  hoy: string;
};

/**
 * El botón «Registrar cobro» y su diálogo. Al registrar, el diálogo se cierra, el foco vuelve al
 * botón (lo hace `Dialogo`) y el `role="status"` lo anuncia. La lista se refresca con el
 * `revalidatePath` de la acción.
 */
export function RegistrarCobro({ pacientes, hoy }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState('');

  return (
    <>
      <Button
        type="button"
        className="min-h-11"
        onClick={() => {
          setAviso('');
          setAbierto(true);
        }}
      >
        <Plus />
        {t('cobros.registrarCobro')}
      </Button>
      <p role="status" className="sr-only">
        {aviso}
      </p>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={t('cobros.registrarCobro')} ancho="amplio">
        <FormularioCobro
          pacientes={pacientes}
          hoy={hoy}
          alRegistrar={() => {
            setAbierto(false);
            setAviso(t('cobros.cobroRegistrado'));
          }}
        />
      </Dialogo>
    </>
  );
}
