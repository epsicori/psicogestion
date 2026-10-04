import type { MotivoSugerencia } from '@/lib/agenda/sugerencias';
import { t, tCon, type ClaveDeCatalogo } from '@/lib/i18n';

const DIAS: readonly ClaveDeCatalogo[] = [
  'agenda.regla.dias.lunes',
  'agenda.regla.dias.martes',
  'agenda.regla.dias.miercoles',
  'agenda.regla.dias.jueves',
  'agenda.regla.dias.viernes',
  'agenda.regla.dias.sabado',
  'agenda.regla.dias.domingo',
];

/** Lo que la interfaz escribe con letras (ADR-049c: nada de cifras en las sugerencias). */
const NUMEROS: Record<number, ClaveDeCatalogo> = {
  2: 'agenda.alta.numeros.2',
  3: 'agenda.alta.numeros.3',
  4: 'agenda.alta.numeros.4',
  5: 'agenda.alta.numeros.5',
  6: 'agenda.alta.numeros.6',
};

const INTERVALOS: Record<number, ClaveDeCatalogo> = {
  7: 'agenda.alta.intervalo.7',
  14: 'agenda.alta.intervalo.14',
  21: 'agenda.alta.intervalo.21',
  28: 'agenda.alta.intervalo.28',
};

/**
 * La frase de una sugerencia. Solo escribe lo que `sugerirHuecos` ya decidió: no calcula nada y
 * jamás nombra el tipo de terapia (D8).
 */
export function textoMotivo(motivo: MotivoSugerencia): string {
  switch (motivo.tipo) {
    case 'comoLasUltimas': {
      const clave = NUMEROS[motivo.n];
      return tCon('agenda.alta.motivo.comoLasUltimas', { n: clave ? t(clave) : motivo.n });
    }
    case 'diaHabitual': {
      const dia = DIAS[motivo.diaSemana - 1];
      return tCon('agenda.alta.motivo.diaHabitual', { dia: dia ? t(dia) : '', hora: motivo.hora });
    }
    case 'cadaIntervalo': {
      const clave = INTERVALOS[motivo.dias];
      const intervalo = clave ? t(clave) : tCon('agenda.alta.intervalo.otro', { dias: motivo.dias });
      return tCon('agenda.alta.motivo.cadaIntervalo', { intervalo });
    }
    case 'primerHueco':
      return t('agenda.alta.motivo.primerHueco');
  }
}
