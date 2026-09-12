'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, LockOpen } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { esquemaPin, type DatosPin } from '@/lib/cuentas/esquemas';
import { t, tCon } from '@/lib/i18n';

import { abrirHistoria, cerrarHistoria, prolongarApertura } from './acciones';

type Props = {
  /** Caducidad de la ventana ya abierta, o `null` si el candado está cerrado. */
  caducaEnInicial: string | null;
};

/** Minutos que faltan para `iso`, redondeados hacia arriba. Negativo si ya pasó. */
function minutosRestantes(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 60000);
}

/**
 * El candado de la historia (ADR-026).
 *
 * **El aviso de caducidad es NO MODAL y llega tarde a propósito** (ADR-047): un
 * diálogo que roba el foco a quien está escribiendo una nota clínica es peor que la
 * ventana que avisa. Y no hay cuenta atrás segundo a segundo: el texto dice los
 * minutos que quedan y se recalcula cada medio minuto, porque un número que cambia
 * sin parar en la esquina de la pantalla es justo lo que el ADR llama parpadear.
 *
 * **`prolongarApertura()` cuelga de un botón**, nunca del renderizado: prolongar al
 * pintar dejaría el candado abierto mientras alguien tuviera la pestaña olvidada.
 */
export function FormularioCandado({ caducaEnInicial }: Props) {
  const [caducaEn, setCaducaEn] = useState(caducaEnInicial);
  const [bloqueadoHasta, setBloqueadoHasta] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [trabajando, iniciarTransicion] = useTransition();
  // `tic` no se lee: existe para volver a pintar cada medio minuto. Los minutos se
  // DERIVAN en el renderizado, que es lo que evita guardar en estado algo que ya se
  // puede calcular — y lo que el compilador de React pide al prohibir `setState`
  // dentro de un efecto.
  const [, setTic] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DatosPin>({ resolver: zodResolver(esquemaPin), defaultValues: { pin: '' } });

  useEffect(() => {
    if (!caducaEn) return;
    // Medio minuto, y no un segundo: un número que cambia sin parar en la esquina de
    // la pantalla es justo lo que el ADR-047 llama parpadear.
    const reloj = setInterval(() => setTic((n) => n + 1), 30_000);
    return () => clearInterval(reloj);
  }, [caducaEn]);

  const minutos = caducaEn ? minutosRestantes(caducaEn) : null;

  const abrir = handleSubmit((datos) => {
    setMensaje('');
    iniciarTransicion(async () => {
      const resultado = await abrirHistoria(datos);
      reset({ pin: '' });

      if (resultado.abierta) {
        setCaducaEn(resultado.caducaEn);
        setBloqueadoHasta(null);
        return;
      }

      setMensaje(resultado.mensaje);
      setBloqueadoHasta(resultado.bloqueadoHasta);
    });
  });

  const cerrar = () =>
    iniciarTransicion(async () => {
      await cerrarHistoria();
      setCaducaEn(null);
      setMensaje(t('candado.cerrada'));
    });

  const prolongar = () =>
    iniciarTransicion(async () => {
      const { caducaEn: nueva } = await prolongarApertura();
      if (nueva) setCaducaEn(nueva);
    });

  if (caducaEn) {
    const porCaducar = minutos !== null && minutos <= 2;

    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm" suppressHydrationWarning>
          <LockOpen className="text-primary size-4" aria-hidden="true" />
          {minutos !== null && minutos > 0
            ? tCon('candado.abiertaMinutos', { minutos })
            : t('candado.abierta')}
        </p>

        {porCaducar && (
          // No modal, no roba el foco, y se anuncia sin interrumpir: `polite`.
          <p
            role="status"
            aria-live="polite"
            className="border-border bg-muted rounded-lg border px-4 py-3 text-sm"
          >
            {t('candado.porCaducar')}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variante="contorno" onClick={prolongar} disabled={trabajando}>
            {t('candado.prolongar')}
          </Button>
          <Button onClick={cerrar} disabled={trabajando}>
            {t('candado.cerrar')}
          </Button>
        </div>

        {mensaje && (
          <p role="status" className="text-sm">
            {mensaje}
          </p>
        )}
      </div>
    );
  }

  const bloqueada = bloqueadoHasta !== null && minutosRestantes(bloqueadoHasta) > 0;

  return (
    <form noValidate onSubmit={abrir} className="flex flex-col gap-4">
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Lock className="size-4" aria-hidden="true" />
        {t('candado.explicacion')}
      </p>

      <Field
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        disabled={bloqueada}
        etiqueta={t('candado.etiquetaPin')}
        errores={errors.pin?.message ? [errors.pin.message] : undefined}
        {...register('pin')}
      />

      <Button type="submit" disabled={trabajando || bloqueada}>
        {trabajando ? t('comunes.cargando') : t('candado.abrir')}
      </Button>

      {mensaje && (
        <p role="status" className="text-destructive text-sm">
          {bloqueada && bloqueadoHasta
            ? tCon('candado.bloqueadoMinutos', { minutos: minutosRestantes(bloqueadoHasta) })
            : mensaje}
        </p>
      )}
    </form>
  );
}
