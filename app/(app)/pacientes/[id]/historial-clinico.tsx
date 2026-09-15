import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Stethoscope } from 'lucide-react';

import { Pildora } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';

import type { ContenidoDelHistorial, ValoracionDeVista } from './acciones';
import {
  valoracionEsAntigua,
  type EpisodioDeVista,
  type ModalidadRelacional,
  type NivelDeRiesgo,
} from './presentacion';

/**
 * El historial clínico ya leído. **No lee nada**: recibe el modelo de vista que devolvió la
 * Server Action de apertura (ADR-056), que es la que dejó la fila en `accesos_historia`.
 * Por eso no es `async` y por eso no importa Supabase: si este componente pudiera consultar,
 * habría una segunda puerta a la historia y el registro de accesos dejaría de ser completo.
 */

const ETIQUETA_NIVEL: Record<NivelDeRiesgo, () => string> = {
  bajo: () => t('ficha.riesgoBajo'),
  moderado: () => t('ficha.riesgoModerado'),
  alto: () => t('ficha.riesgoAlto'),
};

const TONO_NIVEL: Record<NivelDeRiesgo, 'success' | 'info' | 'warning'> = {
  bajo: 'success',
  moderado: 'info',
  alto: 'warning',
};

const ETIQUETA_MODALIDAD: Record<ModalidadRelacional, () => string> = {
  individual: () => t('ficha.modalidadIndividual'),
  pareja: () => t('ficha.modalidadPareja'),
  familiar: () => t('ficha.modalidadFamiliar'),
  grupo: () => t('ficha.modalidadGrupo'),
};

function fechaLarga(iso: string): string {
  return format(new Date(iso), "d 'de' MMMM 'de' yyyy", { locale: es });
}

function Valoracion({ valoracion }: { valoracion: ValoracionDeVista }) {
  const antigua = valoracionEsAntigua(valoracion.valoradoEn);
  const fecha = fechaLarga(valoracion.valoradoEn);

  return (
    <li className="border-border border-t px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <Pildora tono={TONO_NIVEL[valoracion.nivel]}>{ETIQUETA_NIVEL[valoracion.nivel]()}</Pildora>
        <span className="text-muted-foreground text-xs">
          {antigua
            ? tCon('ficha.valoracionAntigua', { fecha })
            : tCon('ficha.valoradoEl', { fecha })}
        </span>
      </div>

      {valoracion.descripcion && <p className="mt-2 text-sm">{valoracion.descripcion}</p>}

      {valoracion.planSeguridad && (
        <p className="text-muted-foreground mt-2 text-sm">
          <span className="text-foreground font-medium">{t('ficha.planDeSeguridad')}: </span>
          {valoracion.planSeguridad}
        </p>
      )}
    </li>
  );
}

function Episodio({ episodio }: { episodio: EpisodioDeVista }) {
  return (
    <li className="border-border border-t px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {episodio.motivo ?? t('ficha.sinMotivoRegistrado')}
        </p>
        <Pildora tono="info">{ETIQUETA_MODALIDAD[episodio.modalidad]()}</Pildora>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {episodio.cerradoEn
          ? tCon('ficha.episodioCerrado', {
              inicio: fechaLarga(episodio.abiertoEn),
              fin: fechaLarga(episodio.cerradoEn),
            })
          : tCon('ficha.episodioAbierto', { fecha: fechaLarga(episodio.abiertoEn) })}
      </p>

      <p className="text-muted-foreground mt-3 text-xs font-semibold tracking-wide uppercase">
        {t('ficha.diagnosticos')}
      </p>

      {episodio.diagnosticos.length === 0 ? (
        <p className="text-muted-foreground mt-1 text-sm">{t('ficha.sinDiagnosticos')}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {episodio.diagnosticos.map((diagnostico) => (
            <li key={diagnostico.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-mono text-xs">{diagnostico.codigo}</span>
              <span>{diagnostico.descripcion}</span>
              {diagnostico.principal && (
                <Pildora tono="success">{t('ficha.diagnosticoPrincipal')}</Pildora>
              )}
              {diagnostico.retiradoEn && (
                <span className="text-muted-foreground text-xs">
                  {tCon('ficha.diagnosticoRetirado', { fecha: fechaLarga(diagnostico.retiradoEn) })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function HistorialClinico({ contenido }: { contenido: ContenidoDelHistorial }) {
  return (
    <div className="flex flex-col gap-6">
      {contenido.valoraciones.length > 0 && (
        <section>
          <h3 className="mb-2 font-serif text-lg font-semibold">
            {t('ficha.valoracionesDeRiesgo')}
          </h3>
          <ul className="border-border bg-card overflow-hidden rounded-xl border">
            {contenido.valoraciones.map((valoracion) => (
              <Valoracion key={valoracion.id} valoracion={valoracion} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 font-serif text-lg font-semibold">{t('ficha.episodios')}</h3>

        {contenido.episodios.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
            <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <Stethoscope className="size-5" aria-hidden="true" />
            </span>
            <p className="font-serif text-lg font-semibold">{t('ficha.sinEpisodios')}</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              {t('ficha.sinEpisodiosExplicacion')}
            </p>
          </div>
        ) : (
          <ul className="border-border bg-card overflow-hidden rounded-xl border">
            {contenido.episodios.map((episodio) => (
              <Episodio key={episodio.id} episodio={episodio} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
