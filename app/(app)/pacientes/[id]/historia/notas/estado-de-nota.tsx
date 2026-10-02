import { Pildora } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

import type { EstadoNota } from '@/lib/notas/estado';

const mapeoTono: Record<EstadoNota, 'success' | 'info' | 'warning'> = {
  borrador: 'warning',
  firmada: 'success',
  modificada: 'success',
  firmada_con_cambios: 'info',
};

const mapeoTexto: Record<EstadoNota, string> = {
  borrador: t('notas.estado.borrador'),
  firmada: t('notas.estado.firmada'),
  modificada: t('notas.estado.modificada'),
  firmada_con_cambios: t('notas.estado.firmadaConCambios'),
};

export function PildoraDeEstado({ estado }: { estado: EstadoNota }) {
  return (
    <Pildora tono={mapeoTono[estado]}>
      {mapeoTexto[estado]}
    </Pildora>
  );
}
