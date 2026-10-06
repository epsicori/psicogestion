'use client';

import { useId, type Ref } from 'react';

import { Button } from '@/components/ui/button';
import { t, tCon } from '@/lib/i18n';

export type AlternativaAviso = { clave: string; texto: string; etiqueta: string };

type Props = {
  ref?: Ref<HTMLElement>;
  minutos: number;
  alternativas: readonly AlternativaAviso[];
  /** Lo que bloquea Guardar en el formulario (`bloqueado`): «Agendar igualmente» no hace nada (H27). */
  ocupado: boolean;
  alElegir: (clave: string, etiqueta: string) => void;
  alAgendarIgualmente: () => void;
};

/**
 * El aviso de hueco raro (T-043): la cita elegida deja entre ella y la siguiente más minutos que el
 * descanso pero no cabe otra sesión. No es modal ni una región viva: se anuncia porque recibe el
 * foco, y Tab sale de él hacia el resto del formulario. Nunca `disabled` (H27).
 */
export function AvisoHuecoRaro({ ref, minutos, alternativas, ocupado, alElegir, alAgendarIgualmente }: Props) {
  const idTitulo = useId();
  const idTexto = useId();
  const idAlternativas = useId();

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={idTitulo}
      aria-describedby={idTexto}
      className="border-border bg-muted focus-visible:ring-ring/50 flex flex-col gap-3 rounded-lg border p-4 outline-none focus-visible:ring-2"
    >
      <h3 id={idTitulo} className="font-serif text-base">
        {t('agenda.alta.huecoRaro.titulo')}
      </h3>
      <p id={idTexto} className="text-sm">
        {tCon('agenda.alta.huecoRaro.texto', { minutos: String(minutos) })}
      </p>
      {alternativas.length > 0 ? (
        <>
          <p id={idAlternativas} className="text-sm font-medium">
            {t('agenda.alta.huecoRaro.alternativas')}
          </p>
          <ul aria-labelledby={idAlternativas} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {alternativas.map((a) => (
              <li key={a.clave}>
                <Button variante="contorno" className="h-auto text-left whitespace-normal" onClick={() => alElegir(a.clave, a.etiqueta)}>
                  {a.texto}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t('agenda.alta.huecoRaro.sinAlternativas')}</p>
      )}
      <div>
        <Button
          variante="secundario"
          aria-disabled={ocupado}
          className="aria-disabled:cursor-default aria-disabled:opacity-50"
          onClick={() => {
            if (!ocupado) alAgendarIgualmente();
          }}
        >
          {t('agenda.alta.huecoRaro.agendarIgualmente')}
        </Button>
      </div>
    </section>
  );
}
