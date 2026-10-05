import { cn } from '@/lib/utils';

/**
 * El contenido de una tarjeta de sugerencia. Va dentro de un `<button>`: solo `span`, porque un
 * `div` dentro de un botón no es contenido de frase válido (E17).
 */
export function CuerpoSugerencia({
  fecha,
  hora,
  motivo,
}: {
  fecha: string;
  hora: string;
  motivo: string;
}) {
  return (
    <span>
      <span className="text-sm font-medium">{fecha}</span>
      <span className={cn('block font-mono text-lg', 'text-foreground')}>{hora}</span>
      <span className="text-sm text-muted-foreground">{motivo}</span>
    </span>
  );
}
