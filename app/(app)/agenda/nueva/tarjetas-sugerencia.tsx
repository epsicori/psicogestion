'use client';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { CabeceraSugerencias } from './cabecera-sugerencias';
import { ErrorPieza } from './esqueletos';
import { CuerpoSugerencia } from './tarjeta-sugerencia-cuerpo';
import type { TarjetaVista } from './vista-alta';

type Props = {
  modo: 'habitual' | 'enFrio';
  tarjetas: TarjetaVista[];
  /** El cálculo falló (por ejemplo, un `hoy` inválido): se dice, no se tumba la pantalla. */
  error: boolean;
  /** La clave de la tarjeta que coincide con el hueco elegido, si alguna. */
  elegida: string | null;
  alElegir: (clave: string) => void;
  /** Hay un recálculo en vuelo: lo que se ve puede ser de antes, y «sin huecos» aún no se puede afirmar. */
  cargando?: boolean;
};

/**
 * Hasta tres sugerencias de hueco. Elegir una es elegir ese hueco del calendario. Los motivos
 * llegan escritos: aquí no se calcula nada ni se nombra el tipo de terapia (D8).
 */
export function TarjetasSugerencia({ modo, tarjetas, error, elegida, alElegir, cargando = false }: Props) {
  if (error) return <ErrorPieza mensaje={t('agenda.alta.sugerencias.error')} />;

  // El `<p>` lleva siempre `role="status"`: cambia el texto de una región viva ya montada, y así se anuncia (H30).
  const sinTarjetas = tarjetas.length === 0;

  return (
    <section className="flex flex-col gap-3">
      <CabeceraSugerencias modo={modo} />
      {sinTarjetas ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t(cargando ? 'agenda.alta.sugerencias.cargando' : 'agenda.alta.sugerencias.vacio')}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-3">
          {tarjetas.map((tarjeta) => (
            <li key={tarjeta.clave}>
              <button
                type="button"
                aria-pressed={tarjeta.clave === elegida}
                onClick={() => alElegir(tarjeta.clave)}
                className={cn(
                  'focus-visible:ring-ring/50 min-h-11 w-full rounded-lg border p-3 text-left outline-none focus-visible:ring-2',
                  tarjeta.clave === elegida ? 'border-primary bg-secondary' : 'border-border bg-card hover:bg-muted',
                )}
              >
                <CuerpoSugerencia fecha={tarjeta.fecha} hora={tarjeta.hora} motivo={tarjeta.motivo} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
