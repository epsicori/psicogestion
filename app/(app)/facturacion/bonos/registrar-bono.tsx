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

const PREFIJO_CLAVE = 'bono-envio:';

/** La clave que sobrevivió a un desmontaje (cambio de pestaña de la ficha). Sin almacén, `undefined`. */
function leerGuardada(huella: string): string | undefined {
  try {
    return window.sessionStorage.getItem(PREFIJO_CLAVE + huella) ?? undefined;
  } catch {
    return undefined;
  }
}

function guardar(huella: string, clave: string): void {
  try {
    window.sessionStorage.setItem(PREFIJO_CLAVE + huella, clave);
  } catch {
    // Sin almacén la clave vive solo mientras este componente siga montado.
  }
}

function olvidar(huella: string): void {
  try {
    window.sessionStorage.removeItem(PREFIJO_CLAVE + huella);
  } catch {
    // Nada que olvidar.
  }
}

/**
 * El botón «Registrar bono' y su diálogo (T-027 §1.4). Calco de `RegistrarCobro`: al registrar, el
 * diálogo se cierra, el foco vuelve al botón y el `role="status"` lo anuncia. Las claves de envío viven
 * aquí, no en el formulario, que el diálogo desmonta al cerrarse; y también en `sessionStorage`, porque la
 * ficha desmonta la pestaña entera al cambiar de pestaña.
 */
export function RegistrarBono({ pacientes, pacienteFijo, hoy }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const claves = useRef(new Map<string, string>());

  function claveDeEnvio(huella: string): string {
    const guardada = claves.current.get(huella) ?? leerGuardada(huella);
    if (guardada !== undefined) {
      claves.current.set(huella, guardada);
      return guardada;
    }
    const nueva = crypto.randomUUID();
    claves.current.set(huella, nueva);
    guardar(huella, nueva);
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
              olvidar(huella);
              setAbierto(false);
              setAviso(avisoDeExito);
            }}
          />
        </Dialogo>
      )}
    </>
  );
}
