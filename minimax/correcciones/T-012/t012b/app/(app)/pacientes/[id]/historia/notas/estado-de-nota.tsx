import { Pildora } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';

export type EstadoDeNota = 'borrador' | 'firmada' | 'modificada' | 'firmada_con_cambios';

const mapeoTono: Record<EstadoDeNota, 'success' | 'info' | 'warning'> = {
  borrador: 'warning',
  firmada: 'success',
  modificada: 'success',
  firmada_con_cambios: 'info',
};

const mapeoTexto: Record<EstadoDeNota, string> = {
  borrador: t('notas.estado.borrador'),
  firmada: t('notas.estado.firmada'),
  modificada: t('notas.estado.modificada'),
  firmada_con_cambios: t('notas.estado.firmadaConCambios'),
};

export function PildoraDeEstado({ estado }: { estado: EstadoDeNota }) {
  return (
    <Pildora tono={mapeoTono[estado]}>
      {mapeoTexto[estado]}
    </Pildora>
  );
}
