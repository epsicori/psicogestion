'use client';

import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialogo } from '@/components/ui/dialogo';
import { AvisoDeError } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

import { FormularioBono } from './formulario-bono';

type Props = {
  /** Módulo Facturación: la lista para elegir. `null`: no se pudo cargar, no se ofrece registrar a ciegas. */
  pacientes?: { id: string; nombre: string; apellidos: string }[] | null;
  /** Ficha del paciente: el paciente ya está elegido. */
  pacienteFijo?: { id: string; nombre: string };
  hoy: string;
};

/**
 * El botón «Registrar bono» y su diálogo (T-027 §1.4). Calco de `RegistrarCobro`: al registrar, el
 * diálogo se cierra, el foco vuelve al botón y el `role="status"` lo anuncia. Las claves de envío viven
 * aquí, no en el formulario, que el diálogo desmonta al cerrarse.
 */
export function RegistrarBono({ pacientes, pacienteFijo, hoy }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const claves = useRef(new Map<string, string>());

  function claveDeEnvio(huella: string): string {
    const guardada = claves.current.get(huella);
    if (guardada !== undefined) return guardada;
    const nueva = crypto.randomUUID();
    claves.current.set(huella, nueva);
    return nueva;
  }

  const sinLista = pacienteFijo === undefined && pacientes === null;

  return (
    <>
      {sinLista ? (
        <AvisoDeError mensaje={t('bonos.errorPacientes')} />
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
          {t('bonos.registrarBono')}
        </Button>
      )}
      {/* Visible: «Bono registrado» es la confirmación de una acción económica, no solo para lectores. */}
      <p role="status" className="text-sm text-foreground">
        {aviso}
      </p>
      {!sinLista && (
        <Dialogo
          abierto={abierto}
          // Con un envío en vuelo no se cierra: el usuario no vería su resultado.
          alCerrar={() => {
            if (!enviando) setAbierto(false);
          }}
          titulo={t('bonos.registrarBono')}
          ancho="amplio"
        >
          <FormularioBono
            pacientes={pacientes ?? undefined}
            pacienteFijo={pacienteFijo}
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
