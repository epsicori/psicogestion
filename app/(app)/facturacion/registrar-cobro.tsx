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
  const [enviando, setEnviando] = useState(false);

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
      {/* Visible: «Cobro registrado» es la confirmación de una acción económica, no solo para lectores. */}
      <p role="status" className="text-sm text-foreground empty:hidden">
        {aviso}
      </p>
      <Dialogo
        abierto={abierto}
        // Con un envío en vuelo no se cierra: el usuario no vería su resultado (B-H11).
        alCerrar={() => {
          if (!enviando) setAbierto(false);
        }}
        titulo={t('cobros.registrarCobro')}
        ancho="amplio"
      >
        <FormularioCobro
          pacientes={pacientes}
          hoy={hoy}
          alCambiarEnvio={setEnviando}
          alRegistrar={() => {
            setAbierto(false);
            setAviso(t('cobros.cobroRegistrado'));
          }}
        />
      </Dialogo>
    </>
  );
}
