'use client';

import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialogo } from '@/components/ui/dialogo';
import { AvisoDeError } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

import { FormularioCobro } from './formulario-cobro';

type Props = {
  /** `null`: no se pudo cargar la lista. No se ofrece registrar a ciegas. */
  pacientes: { id: string; nombre: string; apellidos: string }[] | null;
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
  // Claves de envío por huella (R4.1). Viven aquí y no en el formulario: el diálogo desmonta el
  // formulario al cerrarse. Solo un éxito olvida una clave.
  const claves = useRef(new Map<string, string>());

  function claveDeEnvio(huella: string): string {
    const guardada = claves.current.get(huella);
    if (guardada !== undefined) return guardada;
    const nueva = crypto.randomUUID();
    claves.current.set(huella, nueva);
    return nueva;
  }

  return (
    <>
      {pacientes === null ? (
        <AvisoDeError mensaje={t('cobros.errorPacientes')} />
      ) : (
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
      )}
      {/* Visible: «Cobro registrado» es la confirmación de una acción económica, no solo para lectores. */}
      <p role="status" className="text-sm text-foreground">
        {aviso}
      </p>
      {pacientes !== null && (
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
            claveDeEnvio={claveDeEnvio}
            alRegistrar={(huella, avisoDeExito) => {
              claves.current.delete(huella);
              setAbierto(false);
              setAviso(avisoDeExito);
            }}
          />
        </Dialogo>
      )}
    </>
  );
}
