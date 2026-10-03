import { formatearFechaCorta, formatearHora } from '@/lib/fechas';
import { t, type ClaveDeCatalogo } from '@/lib/i18n';
import { es } from '@/lib/i18n/es';
import type { Sesion } from '@/lib/cuentas/tipos';

import { ID_TITULO_AVISOS } from './ids';

const ZONA_POR_DEFECTO = 'Europe/Madrid';

// Los avisos de seguridad del propio titular. Los demás tipos de notificación viven en la
// campana; aquí solo lo que tiene que ver con el acceso y los códigos.
const TIPOS = ['codigos_regenerados', 'regeneracion_codigos_bloqueada', 'totp_repuesto', 'pin_bloqueado'];

function etiquetaDe(tipo: string): string {
  const etiquetas = es.notificaciones.tipos as Record<string, string>;
  return Object.hasOwn(etiquetas, tipo)
    ? t(`notificaciones.tipos.${tipo}` as ClaveDeCatalogo)
    : t('notificaciones.tipos.otro');
}

/**
 * Historial de avisos de seguridad (T-038). Lee `notificaciones` con el cliente de la
 * sesión: la RLS de lectura propia ya acota al titular, y esta consulta no añade ni
 * quita nada. **Incluye los leídos**: es un historial, no una bandeja. No marca nada
 * como leído (eso es de la campana, T-015). Las horas se formatean aquí, en servidor,
 * en la zona de la organización (ADR-034).
 */
export async function ListaAvisos({ sesion }: { sesion: Pick<Sesion, 'supabase'> }) {
  const [{ data: avisos, error }, { data: organizacion }] = await Promise.all([
    sesion.supabase
      .from('notificaciones')
      .select('id, tipo, detalle, creado_en, leida_en')
      .in('tipo', TIPOS)
      .order('creado_en', { ascending: false })
      .limit(50),
    sesion.supabase.from('organizacion').select('zona_horaria').maybeSingle(),
  ]);
  if (error) console.error('[ListaAvisos] no se pudieron leer los avisos', error.code);

  const zona = organizacion?.zona_horaria ?? ZONA_POR_DEFECTO;
  const sinAvisos = !avisos || avisos.length === 0;

  return (
    <section aria-labelledby={ID_TITULO_AVISOS} className="flex flex-col gap-3">
      <h3
        id={ID_TITULO_AVISOS}
        tabIndex={-1}
        className="font-serif text-lg font-semibold tracking-tight outline-none"
      >
        {t('cuenta.avisos.titulo')}
      </h3>
      {error && <p className="text-destructive text-sm">{t('cuenta.avisos.errorLectura')}</p>}
      {!error && sinAvisos && <p className="text-muted-foreground text-sm">{t('cuenta.avisos.vacio')}</p>}
      {!error && !sinAvisos && (
        <ul className="flex flex-col">
          {avisos.map((aviso) => {
            const instante = new Date(aviso.creado_en);
            return (
              <li
                key={aviso.id}
                className="border-border flex flex-col gap-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={aviso.leida_en ? 'font-medium' : 'font-semibold'}>
                    {etiquetaDe(aviso.tipo)}
                    {!aviso.leida_en && (
                      <span className="text-primary ml-2 text-xs font-medium">{t('cuenta.avisos.sinLeer')}</span>
                    )}
                  </p>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatearFechaCorta(instante, zona)} · {formatearHora(instante, zona)}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">{aviso.detalle}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
