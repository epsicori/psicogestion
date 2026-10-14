'use client';

import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Seleccion } from '@/components/ui/seleccion';
import { t } from '@/lib/i18n';

import { leerBonoDeCita, vincularBono, type BonoDeCita } from './acciones-bono';

/**
 * El bono de una cita dentro del panel de la agenda (T-027 §1.8). Se pide al montarse, no con la
 * agenda: el técnico no lee `citas` y para él la lectura vuelve `visible: false`, así que no ve ni el
 * rótulo. Sin bonos que elegir ni bono vinculado, tampoco se pinta nada. Quien lo monta le pone
 * `key={cita.id}`, de modo que cambiar de cita reinicia la lectura.
 */
export function BonoDeCita({ citaId }: { citaId: string }) {
  const [lectura, setLectura] = useState<BonoDeCita | null>(null);

  useEffect(() => {
    let vigente = true;
    leerBonoDeCita(citaId)
      .then((l) => {
        if (vigente) setLectura(l);
      })
      .catch(() => {
        if (vigente) setLectura({ visible: true, error: t('bonos.cita.errorLectura') });
      });
    return () => {
      vigente = false;
    };
  }, [citaId]);

  if (lectura === null) {
    return (
      <p role="status" className="text-muted-foreground text-xs">
        {t('bonos.cita.cargando')}
      </p>
    );
  }
  if (!lectura.visible) return null;
  if ('error' in lectura) {
    return (
      <p role="alert" className="text-destructive text-xs">
        {lectura.error}
      </p>
    );
  }
  if (!lectura.editable) {
    return (
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="text-foreground text-xs">{t('bonos.cita.etiqueta')}</span>
        <span className="text-foreground">{lectura.actual}</span>
      </div>
    );
  }
  return <Selector citaId={citaId} actual={lectura.actual} opciones={lectura.opciones} />;
}

function Selector({
  citaId,
  actual,
  opciones,
}: {
  citaId: string;
  actual: string | null;
  opciones: { id: string; texto: string }[];
}) {
  const [valor, setValor] = useState(actual ?? '');
  const [guardado, setGuardado] = useState(actual ?? '');
  const [mensaje, setMensaje] = useState('');
  const [pendiente, empezar] = useTransition();

  function guardar() {
    setMensaje('');
    empezar(async () => {
      try {
        const r = await vincularBono({ citaId, bonoId: valor });
        setMensaje(r.mensaje);
        if (r.ok) setGuardado(valor);
      } catch {
        setMensaje(t('bonos.cita.noSePudoVincular'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Seleccion
        id={`bono-cita-${citaId}`}
        etiqueta={t('bonos.cita.etiqueta')}
        textoVacio={t('bonos.cita.sinBono')}
        opciones={opciones.map((o) => ({ valor: o.id, texto: o.texto }))}
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          setMensaje('');
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variante="contorno" onClick={guardar} disabled={pendiente || valor === guardado}>
          {pendiente ? t('bonos.cita.guardando') : t('bonos.cita.guardar')}
        </Button>
        <p role="status" className="text-foreground text-xs">
          {mensaje}
        </p>
      </div>
    </div>
  );
}
