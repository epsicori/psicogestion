import type { ReactNode } from 'react';

/**
 * Estado vacío para la pantalla de agenda.
 * @param icono - Tipo de icono a mostrar: 'calendario' | 'confirmado' | 'documento'
 * @param titulo - Título ya traducido (string)
 * @param explicacion - Explicación ya traducida (string)
 */
export function EstadoVacio({
  icono,
  titulo,
  explicacion,
}: {
  icono: 'calendario' | 'confirmado' | 'documento';
  titulo: string;
  explicacion: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icono === 'calendario' && (
          <svg
            aria-hidden="true"
            className="h-6 w-6"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <circle cx="8" cy="14" r="1.5" fill="currentColor" />
            <circle cx="12" cy="14" r="1.5" fill="currentColor" />
          </svg>
        )}
        {icono === 'confirmado' && (
          <svg
            aria-hidden="true"
            className="h-6 w-6"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="9 12 11.5 14.5 16 9" />
          </svg>
        )}
        {icono === 'documento' && (
          <svg
            aria-hidden="true"
            className="h-6 w-6"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
        )}
      </div>
      <p className="font-serif text-lg text-foreground">{titulo}</p>
      <p className="text-sm text-muted-foreground">{explicacion}</p>
    </div>
  );
}
