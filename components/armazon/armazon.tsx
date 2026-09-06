import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LogOut } from 'lucide-react';
import { connection } from 'next/server';
import { Suspense, cache, type ReactNode } from 'react';

import { cerrarSesion } from '@/app/(app)/acciones';
import { Cargando } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { ArmazonCliente } from './armazon-cliente';
import { iniciales, nombrarRol } from './modulos';

/**
 * Perfil del usuario de la petición. `cache()` de React memoiza **por petición**,
 * no entre peticiones: los dos bloques de abajo lo piden y la consulta se hace una
 * sola vez.
 *
 * Es `cache()` y NO `use cache` a propósito, y la diferencia importa: `use cache`
 * guarda el resultado entre peticiones y lo compartiría **entre usuarios
 * distintos**. Aquí se está leyendo el nombre y el rol de quien tiene la sesión
 * abierta: cachear eso es servirle el perfil de otro. Nada que dependa del usuario
 * se cachea en esta aplicación.
 */
const cargarIdentidad = cache(async () => {
  const { supabase, usuario } = await exigirSesion();

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('nombre_completo, rol')
    .eq('id', usuario.id)
    .maybeSingle();

  if (error) {
    // Sin perfil no hay identidad que mostrar, pero tampoco es motivo para tumbar
    // la pantalla: se registra y se cae al correo de la sesión.
    console.error('Armazon: fallo al cargar el perfil', error);
  }

  return {
    nombreCompleto: perfil?.nombre_completo ?? usuario.email ?? t('armazon.sinPerfil'),
    rol: perfil ? nombrarRol(perfil.rol) : t('armazon.perfilSinAsignar'),
  };
});

function franjaDelDia(hora: number) {
  if (hora < 6) return t('armazon.buenasNoches');
  if (hora < 14) return t('armazon.buenosDias');
  if (hora < 21) return t('armazon.buenasTardes');
  return t('armazon.buenasNoches');
}

/**
 * Bloque de identidad del pie de la barra lateral. Lee la sesión, así que es
 * trabajo de petición y vive detrás de su propio `<Suspense>`.
 */
async function Identidad() {
  const { nombreCompleto, rol } = await cargarIdentidad();

  return (
    <div className="flex items-center gap-3 rounded-lg p-2">
      <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full font-serif text-xs font-bold">
        {iniciales(nombreCompleto)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{nombreCompleto}</span>
        <span className="text-muted-foreground block truncate text-xs">{rol}</span>
      </span>
      <form action={cerrarSesion}>
        <button
          type="submit"
          aria-label={t('armazon.cerrarSesion')}
          title={t('armazon.cerrarSesion')}
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

/**
 * Saludo y fecha de la cabecera. Bloque aparte del de identidad, y no por
 * capricho: además de la sesión necesita **el reloj**, y con Cache Components un
 * `new Date()` en el prerenderizado es un aviso `blocking-prerender-current-time`
 * —la hora del build se quedaría congelada en el shell estático—.
 *
 * `await connection()` es la forma que la guía de Next documenta para decir «esto
 * es de la petición, no del build»: a partir de ahí el reloj es el de verdad, y
 * este bloque se transmite detrás de su `<Suspense>` mientras el resto de la
 * página ya está pintada.
 *
 * La hora se calcula EN SERVIDOR y baja como cadena ya formateada. Un `new Date()`
 * en cliente daría la del navegador y rompería la hidratación.
 */
async function SaludoYFecha() {
  await connection();

  const { nombreCompleto } = await cargarIdentidad();
  const ahora = new Date();
  const fecha = format(ahora, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });

  return (
    <>
      <p className="text-muted-foreground text-sm">
        {fecha.charAt(0).toUpperCase() + fecha.slice(1)}
      </p>
      <h1 className="font-serif text-xl font-semibold tracking-tight md:text-2xl">
        {`${franjaDelDia(ahora.getHours())}, ${nombreCompleto.split(' ')[0]}`}
      </h1>
    </>
  );
}

/**
 * Armazón del espacio de trabajo. **No es `async`**: el marco —marca, navegación,
 * cajón, contenedor— no depende de ningún dato, así que se prerenderiza entero y
 * llega instantáneo.
 *
 * Lo que sí depende de la petición son DOS bloques, y cada uno tiene su propio
 * `<Suspense>`: la identidad del pie y el saludo de la cabecera. Un solo
 * `<Suspense>` alrededor de todo habría dejado la página entera detrás de la
 * sesión, que es exactamente lo que este corte tenía que evitar.
 */
export function Armazon({ children }: { children: ReactNode }) {
  return (
    <ArmazonCliente
      identidad={
        <Suspense fallback={<Cargando filas={2} />}>
          <Identidad />
        </Suspense>
      }
      saludo={
        <Suspense fallback={<Cargando filas={2} />}>
          <SaludoYFecha />
        </Suspense>
      }
    >
      {children}
    </ArmazonCliente>
  );
}
