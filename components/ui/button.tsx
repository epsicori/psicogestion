import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const VARIANTES = {
  primario: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  secundario: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  contorno: 'border border-border bg-background hover:bg-muted',
  fantasma: 'text-muted-foreground hover:bg-muted hover:text-foreground',
} as const;

const TAMANOS = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
} as const;

type Props = ComponentProps<'button'> & {
  variante?: keyof typeof VARIANTES;
  tamano?: keyof typeof TAMANOS;
};

export function Button({
  className,
  variante = 'primario',
  tamano = 'md',
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition',
        'focus-visible:ring-ring/50 outline-none focus-visible:ring-2',
        'disabled:pointer-events-none disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...props}
    />
  );
}
