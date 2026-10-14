import { tz } from '@date-fns/tz';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';
import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { FICHAS } from '@/lib/facturacion/registro';
import { t, tCon } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { FormularioClave } from './formulario-clave';

const ZONA_POR_DEFECTO = 'Europe/Madrid';

/**
 * Ajustes › Programa de facturación (T-026a). Solo el administrador; a los demás se les
 * redirige a `/ajustes`. Sin ningún programa disponible no hay nada que conectar: se dice y
 * no se pinta ni el campo ni los botones (un control sin acción real detrás miente).
 *
 * De la clave guardada solo se lee lo que la base deja ver: el programa, los cuatro últimos
 * caracteres y la fecha. La clave entera no llega nunca a esta pantalla.
 */
async function CargaDelPrograma() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);

  if (!estado || estado.rol !== 'administrador') {
    redirect('/ajustes');
  }

  const disponibles = Object.values(FICHAS).filter((ficha) => ficha.disponible);
  if (disponibles.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('ajustes.facturacion.ningunoDisponible')}</p>;
  }

  const [estadoClave, organizacion] = await Promise.all([
    sesion.supabase.rpc('estado_clave_proveedor_facturacion'),
    sesion.supabase.from('organizacion').select('zona_horaria').maybeSingle(),
  ]);
  const { data, error } = estadoClave;
  if (error) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('ajustes.facturacion.errores.lectura')}
      </p>
    );
  }
  // La fecha se da en la zona de la organización, no en la del servidor (ADR-034).
  const zona = organizacion.data?.zona_horaria ?? ZONA_POR_DEFECTO;

  const conectado = data?.[0] ?? null;
  const ficha = (conectado && FICHAS[conectado.proveedor]) || disponibles[0];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        {conectado
          ? tCon('ajustes.facturacion.conectado', {
              programa: ficha.nombre,
              ultimos4: conectado.ultimos4,
              fecha: format(new Date(conectado.actualizado_en), "d 'de' MMMM 'de' yyyy", {
                in: tz(zona),
                locale: es,
              }),
            })
          : t('ajustes.facturacion.sinConectar')}
      </p>
      <FormularioClave proveedor={ficha.id} programa={ficha.nombre} conectado={conectado !== null} />
    </div>
  );
}

export default function PaginaProgramaDeFacturacion() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('ajustes.facturacion.titulo')}</h1>
      </header>

      <Suspense fallback={<Cargando filas={3} />}>
        <CargaDelPrograma />
      </Suspense>
    </main>
  );
}
