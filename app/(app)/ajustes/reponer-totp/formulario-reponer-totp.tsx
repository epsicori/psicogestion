'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Desplegable, type OpcionDesplegable } from '@/components/ui/desplegable';
import { ESTADO_INICIAL } from '@/lib/formularios';
import { t, tCon } from '@/lib/i18n';

import { reponerTotpDePerfil } from '../acciones';

type Props = {
  perfiles: OpcionDesplegable[];
};

/**
 * Pide confirmación antes de reponer: el dispositivo actual de esa persona deja de
 * funcionar y tendrá que volver a enrolarse. No es un gesto que deba ocurrir por un
 * clic de más.
 */
export function FormularioReponerTotp({ perfiles }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const elegido = perfiles.find((perfil) => perfil.valor === perfilId);

  const reponer = () => {
    if (!perfilId) return;
    setMensaje('');
    iniciarTransicion(async () => {
      const estado = (await reponerTotpDePerfil({ perfilId })) ?? ESTADO_INICIAL;
      setMensaje(estado.mensaje ?? '');
      setConfirmando(false);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Desplegable
        etiqueta={t('totp.formulario.usuario')}
        opciones={perfiles}
        valor={perfilId}
        marcador={t('totp.formulario.seleccionarUsuario')}
        alElegir={(valor) => {
          setPerfilId(valor);
          setConfirmando(false);
          setMensaje('');
        }}
      />

      {!confirmando && (
        <Button disabled={!perfilId || enviando} onClick={() => setConfirmando(true)}>
          {t('totp.formulario.reponer')}
        </Button>
      )}

      {confirmando && elegido && (
        <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm">{tCon('ajustes.confirmacion.reponerTotp', { nombre: elegido.etiqueta })}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={reponer} disabled={enviando}>
              {enviando ? t('comunes.cargando') : t('ajustes.confirmacion.confirmar')}
            </Button>
            <Button variante="contorno" onClick={() => setConfirmando(false)} disabled={enviando}>
              {t('ajustes.confirmacion.cancelar')}
            </Button>
          </div>
        </div>
      )}

      {mensaje && (
        <p role="status" className="text-sm">
          {mensaje}
        </p>
      )}
    </div>
  );
}
