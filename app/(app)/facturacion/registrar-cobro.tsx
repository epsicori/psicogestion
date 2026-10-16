'use client';

import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialogo } from '@/components/ui/dialogo';
import { AvisoDeError } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';

import { FormularioCobro } from './formulario-cobro';

type Props = {
  /** `null`: no se pudo cargar la lista. No se ofrece registrar a ciegas. */
  pacientes: { id: string; nombre: string; apellidos: string }[] | null;
  hoy: string;
  /**
   * Modo factura (T-023b): el cobro se registra contra esta factura del espejo. El paciente es el de
   * la factura (texto fijo, no se elige) y no hace falta la lista de pacientes.
   */
  factura?: { id: string; numero: string; pacienteId: string; paciente: string };
};

/**
 * El botón «Registrar cobro» y su diálogo. Al registrar, el diálogo se cierra, el foco vuelve al
 * botón (lo hace `Dialogo`) y el `role="status"` lo anuncia. La lista se refresca con el
 * `revalidatePath` de la acción.
 */
export function RegistrarCobro({ pacientes, hoy, factura }: Props) {
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
      {pacientes === null && !factura ? (
        <AvisoDeError mensaje={t('cobros.errorPacientes')} />
      ) : (
        <Button
          type="button"
          className="min-h-11"
          // En la fila de una factura el rótulo visible es el corto; el nombre accesible lleva el número (D14).
          aria-label={factura ? tCon('cobros.facturas.registrarDeFactura', { numero: factura.numero }) : undefined}
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
      {(pacientes !== null || factura) && (
        <Dialogo
          abierto={abierto}
          // Con un envío en vuelo no se cierra: el usuario no vería su resultado (B-H11).
          alCerrar={() => {
            if (!enviando) setAbierto(false);
          }}
          titulo={
            factura ? tCon('cobros.facturas.tituloRegistrar', { numero: factura.numero }) : t('cobros.registrarCobro')
          }
          ancho="amplio"
        >
          <FormularioCobro
            pacientes={pacientes ?? []}
            factura={factura}
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
