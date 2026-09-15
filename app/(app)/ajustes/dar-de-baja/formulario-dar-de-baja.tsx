'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Desplegable, type OpcionDesplegable } from '@/components/ui/desplegable';
import { ESTADO_INICIAL } from '@/lib/formularios';
import { t, tCon } from '@/lib/i18n';

import { darDeBaja } from '../acciones';

type Props = {
  perfiles: OpcionDesplegable[];
};

export function FormularioDarDeBaja({ perfiles }: Props) {
  const [enviando, iniciarTransicion] = useTransition();
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const elegido = perfiles.find((perfil) => perfil.valor === perfilId);

  const confirmar = () => {
    if (!perfilId) return;
    setMensaje('');
    iniciarTransicion(async () => {
      const estado = (await darDeBaja({ perfilId, motivo })) ?? ESTADO_INICIAL;
      setMensaje(estado.mensaje ?? '');
      setConfirmando(false);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Desplegable
        etiqueta={t('baja.formulario.usuario')}
        opciones={perfiles}
        valor={perfilId}
        alElegir={(valor) => {
          setPerfilId(valor);
          setConfirmando(false);
          setMensaje('');
        }}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivo" className="text-sm font-medium">
          {t('baja.formulario.motivo')}
        </label>
        <textarea
          id="motivo"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder={t('baja.formulario.motivoPlaceholder')}
          rows={3}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        />
      </div>

      {!confirmando && (
        <Button disabled={!perfilId || enviando} onClick={() => setConfirmando(true)}>
          {t('baja.formulario.confirmar')}
        </Button>
      )}

      {confirmando && elegido && (
        <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm">{tCon('ajustes.confirmacion.darDeBaja', { nombre: elegido.etiqueta })}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmar} disabled={enviando}>
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
