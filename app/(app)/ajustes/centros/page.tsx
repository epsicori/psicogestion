import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Cargando } from '@/components/ui/piezas';

import { estadoDeCuenta } from '@/lib/cuentas/candado';
import { formatearFechaSinZona } from '@/lib/fechas/relativo';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { GestionAltas, type PersonaConAltas } from './gestion-altas';

const ZONA_POR_DEFECTO = 'Europe/Madrid';

const ETIQUETA_DE_ROL: Record<string, string> = {
  profesional_sanitario: t('roles.profesionalSanitario'),
  administrador: t('roles.administrador'),
};

/**
 * Altas de centro (T-041). Solo administrador y profesional: el técnico tiene un único
 * centro y se cambia por su propio camino; `dar_alta_centro()` lo rechaza con 23514.
 *
 * Todo se lee y se formatea **en servidor** y baja como filas planas: el cliente no
 * consulta la base ni formatea fechas. Lo que manda está en las RPC, que lanzan 42501 a
 * quien no es administrador; el `redirect` de aquí es cortesía.
 */
async function CargaDeAltas() {
  const sesion = await exigirSesion();
  const estado = await estadoDeCuenta(sesion);

  if (!estado || estado.rol !== 'administrador') {
    redirect('/ajustes');
  }

  const [perfiles, altas, centros, organizacion] = await Promise.all([
    sesion.supabase
      .from('perfiles')
      .select('id, nombre_completo, rol')
      .eq('estado', 'activo')
      .in('rol', ['profesional_sanitario', 'administrador'])
      .order('nombre_completo'),
    sesion.supabase
      .from('perfiles_centros')
      .select('id, perfil_id, centro_id, principal, desde')
      .is('hasta', null),
    // Todos los centros, para nombrar cualquier alta vigente; solo los abiertos se ofrecen.
    sesion.supabase.from('centros').select('id, nombre, activo').order('nombre'),
    sesion.supabase.from('organizacion').select('zona_horaria').maybeSingle(),
  ]);

  for (const [que, resultado] of [
    ['perfiles', perfiles],
    ['perfiles_centros', altas],
    ['centros', centros],
  ] as const) {
    if (resultado.error) console.error(`PaginaAltasDeCentro: fallo al leer ${que}`, resultado.error);
  }

  // Un `date` se ancla al mediodía en la zona: el día que entra es el que sale.
  const zona = organizacion.data?.zona_horaria ?? ZONA_POR_DEFECTO;
  const nombreDeCentro = new Map((centros.data ?? []).map((c) => [c.id, c.nombre]));

  const personas: PersonaConAltas[] = (perfiles.data ?? []).map((perfil) => {
    const suyas = (altas.data ?? []).filter((alta) => alta.perfil_id === perfil.id);
    return {
      perfilId: perfil.id,
      nombre: perfil.nombre_completo,
      rol: ETIQUETA_DE_ROL[perfil.rol] ?? perfil.rol,
      tienePrincipal: suyas.some((alta) => alta.principal),
      altas: suyas
        .map((alta) => ({
          centroId: alta.centro_id,
          nombre: nombreDeCentro.get(alta.centro_id) ?? '',
          principal: alta.principal,
          desde: formatearFechaSinZona(alta.desde, zona),
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    };
  });

  // `dar_alta_centro()` rechaza un centro cerrado con 23514: no se ofrece.
  const opcionesDeCentro = (centros.data ?? [])
    .filter((c) => c.activo)
    .map((c) => ({ valor: c.id, etiqueta: c.nombre }));

  return <GestionAltas personas={personas} centros={opcionesDeCentro} />;
}

export default function PaginaAltasDeCentro() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('altasCentro.titulo')}</h1>
        <p className="text-muted-foreground text-sm">{t('altasCentro.descripcion')}</p>
      </header>

      <Suspense fallback={<Cargando filas={3} />}>
        <CargaDeAltas />
      </Suspense>
    </main>
  );
}
