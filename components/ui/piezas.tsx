import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Tarjeta base con borde, sombra y fondo de tarjeta.
 * Envuelve contenido sin comportamiento.
 */
export function Tarjeta({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card shadow-sm', className)}>
      {children}
    </div>
  );
}

/**
 * Métrica visual para dashboards.
 * Muestra una etiqueta, un valor grande en serif, un matiz explicativo y un icono opcional.
 */
export function Metrica({
  etiqueta,
  valor,
  matiz,
  icono,
}: {
  etiqueta: string;
  valor: string | number;
  matiz?: string;
  icono?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <div className="flex items-center gap-2">
        {icono && (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            {icono}
          </div>
        )}
        <span className="font-serif text-2xl font-medium text-foreground">{valor}</span>
      </div>
      {matiz && <span className="text-xs text-muted-foreground/70">{matiz}</span>}
    </div>
  );
}

/**
 * Fila con iniciales en círculo, nombre truncado y posible contenido a la derecha.
 * Útil para listas de profesionales o pacientes.
 */
export function FilaConAvatar({
  iniciales,
  nombre,
  subtitulo,
  derecha,
}: {
  iniciales: string;
  nombre: string;
  subtitulo?: string;
  derecha?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-serif text-sm font-medium text-muted-foreground">
        {iniciales}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{nombre}</div>
        {subtitulo && (
          <div className="truncate text-xs text-muted-foreground">{subtitulo}</div>
        )}
      </div>
      {derecha && <div className="shrink-0">{derecha}</div>}
    </div>
  );
}

/**
 * Píldora de estado: success (verde), info (azul), warning (ámbar).
 * No usa rojo - ese es para errores.
 */
export function Pildora({
  tono,
  children,
}: {
  tono: 'success' | 'info' | 'warning';
  children: ReactNode;
}) {
  const estilos = {
    success: 'bg-primary/10 text-primary-foreground',
    info: 'bg-secondary text-secondary-foreground',
    warning: 'bg-background text-foreground',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        estilos[tono]
      )}
    >
      {children}
    </span>
  );
}

/**
 * Barra de progreso horizontal con etiqueta y valor numérico.
 * Accesible con role="progressbar".
 */
export function BarraDeProgreso({
  etiqueta,
  valor,
  className,
}: {
  etiqueta: string;
  valor: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, valor));

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{etiqueta}</span>
        <span className="font-medium text-foreground">{clamped}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${etiqueta}: ${clamped}%`}
        />
      </div>
    </div>
  );
}

/**
 * Franja vertical de color para identificar profesionales en agendas.
 * El color se aplica desde fuera mediante className.
 */
export function FranjaDeColor({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-10 w-1 rounded-full', className)}
      aria-hidden="true"
    />
  );
}

/**
 * Encabezado de módulo con versalita, título en serif, subtítulo opcional y acción a la derecha.
 */
export function EncabezadoDeModulo({
  versalita,
  titulo,
  subtitulo,
  accion,
}: {
  versalita: string;
  titulo: string;
  subtitulo?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="uppercase tracking-wide text-xs text-muted-foreground">
          {versalita}
        </span>
        <h2 className="font-serif text-xl font-semibold text-foreground">{titulo}</h2>
        {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  );
}

/**
 * Panel lateral contextual con pico apuntando al elemento relacionado.
 * Usa bg-secondary (malva) para selección.
 */
export function PanelLateral({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative rounded-lg bg-secondary p-4', className)}>
      <div className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-secondary" />
      <h3 className="mb-2 text-sm font-medium text-secondary-foreground">{titulo}</h3>
      <div className="text-sm text-secondary-foreground/80">{children}</div>
    </div>
  );
}

/**
 * Estado vacío: icono en círculo, frase en serif y explicación opcional.
 * El tercer caso de uso (además de carga y error).
 */
export function EstadoVacio({
  icono,
  frase,
  explicacion,
  accion,
}: {
  icono?: ReactNode;
  frase: string;
  explicacion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {icono && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icono}
        </div>
      )}
      <p className="font-serif text-lg text-foreground">{frase}</p>
      {explicacion && <p className="text-sm text-muted-foreground">{explicacion}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

/**
 * Marca de carga con skeleton.
 * No parpadea en prefers-reduced-motion.
 */
export function Cargando({ filas = 3 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={t('interfaz.cargando')}>
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className="h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none"
        />
      ))}
      <span className="sr-only">{t('interfaz.cargandoContenido')}</span>
    </div>
  );
}

/**
 * Aviso de error con borde y fondo en tonos de error (rojo).
 */
export function AvisoDeError({
  mensaje,
  accion,
}: {
  mensaje: string;
  accion?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
      role="alert"
    >
      <p className="text-sm font-medium text-destructive">{mensaje}</p>
      {accion && <div>{accion}</div>}
    </div>
  );
}
