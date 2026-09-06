import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LogOut } from 'lucide-react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { Suspense, cache, type ReactNode } from 'react';

import { cerrarSesion } from '@/app/(app)/acciones';
import { COOKIE_CENTRO } from './centro';
import { Cargando } from '@/components/ui/piezas';
import { t } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { ArmazonCliente } from './armazon-cliente';
import { iniciales, nombrarRol, type RolUsuario } from './modulos';
import { Navegacion } from './navegacion';
import { SelectorDeCentro, type CentroDelUsuario } from './selector-centro';

/**
 * Perfil del usuario de la petición. `cache()` de React memoiza **por petición**,
 * no entre peticiones: los bloques de abajo lo piden y la consulta se hace una
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
    /** Crudo, para filtrar la navegación. Nulo si no hay perfil legible. */
    rol: (perfil?.rol ?? null) as RolUsuario | null,
    rolVisible: perfil ? nombrarRol(perfil.rol) : t('armazon.perfilSinAsignar'),
  };
});

/**
 * Centros VIGENTES a los que pertenece quien mira (ADR-051, `perfiles_centros`).
 *
 * Dos consultas y no una con `join` incrustado: PostgREST sabe hacerlo, pero el
 * nombre de la relación es un detalle que se rompe al renombrar una clave ajena y
 * no avisa hasta que alguien abre la pantalla. Dos consultas por clave primaria
 * son baratas y no dependen de eso.
 *
 * La vigencia se filtra aquí y no en la pantalla: una pertenencia cerrada
 * (`hasta` pasado) no es un centro donde alguien pase consulta hoy.
 */
const cargarCentros = cache(async (): Promise<CentroDelUsuario[]> => {
  const { supabase, usuario } = await exigirSesion();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: pertenencias, error: errorPertenencias } = await supabase
    .from('perfiles_centros')
    .select('centro_id')
    .eq('perfil_id', usuario.id)
    .lte('desde', hoy)
    .or(`hasta.is.null,hasta.gte.${hoy}`);

  if (errorPertenencias || !pertenencias || pertenencias.length === 0) {
    if (errorPertenencias) console.error('Armazon: fallo al cargar las pertenencias', errorPertenencias);
    return [];
  }

  const { data: centros, error: errorCentros } = await supabase
    .from('centros')
    .select('id, nombre')
    .in('id', pertenencias.map((p) => p.centro_id))
    .order('nombre');

  if (errorCentros || !centros) {
    console.error('Armazon: fallo al cargar los centros', errorCentros);
    return [];
  }

  return centros;
});

function franjaDelDia(hora: number) {
  if (hora < 6) return t('armazon.buenasNoches');
  if (hora < 14) return t('armazon.buenosDias');
  if (hora < 21) return t('armazon.buenasTardes');
  return t('armazon.buenasNoches');
}

/**
 * La navegación depende del ROL, así que depende de la petición y va detrás de su
 * `<Suspense>`. Baja una cadena, no la lista de módulos ya filtrada: cada módulo
 * lleva un componente de icono y **un componente no cruza la frontera servidor →
 * cliente**. `Navegacion` filtra con la misma `modulosDe()` que está probada.
 */
async function NavegacionPorRol() {
  const { rol } = await cargarIdentidad();
  return <Navegacion rol={rol} />;
}

/**
 * El selector se pinta **solo si hay dos o más centros vigentes**. Con uno, el
 * componente devuelve `null` y la barra lateral no enseña un desplegable con una
 * sola opción.
 */
async function CentroActivo() {
  const centros = await cargarCentros();
  if (centros.length < 2) return null;

  const almacen = await cookies();
  const elegido = almacen.get(COOKIE_CENTRO)?.value;

  // La cookie manda solo si sigue siendo un centro suyo: una pertenencia cerrada
  // ayer no puede quedarse seleccionada hoy por lo que diga el navegador.
  const activo = centros.some((c) => c.id === elegido) ? elegido! : centros[0].id;

  return <SelectorDeCentro centros={centros} activo={activo} />;
}

/**
 * Bloque de identidad del pie de la barra lateral. Lee la sesión, así que es
 * trabajo de petición y vive detrás de su propio `<Suspense>`.
 */
async function Identidad() {
  const { nombreCompleto, rolVisible } = await cargarIdentidad();

  return (
    <div className="flex items-center gap-3 rounded-lg p-2">
      <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full font-serif text-xs font-bold">
        {iniciales(nombreCompleto)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{nombreCompleto}</span>
        <span className="text-muted-foreground block truncate text-xs">{rolVisible}</span>
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
 * es de la petición, no del build».
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
 * Armazón del espacio de trabajo. **No es `async`**: la marca, el cajón y el
 * contenedor no dependen de ningún dato, así que se prerenderizan enteros y llegan
 * instantáneos.
 *
 * Lo que sí depende de la petición son CUATRO bloques, cada uno con su propio
 * `<Suspense>`: el selector de centro, la navegación (que depende del rol), la
 * identidad del pie y el saludo de la cabecera. Un solo `<Suspense>` alrededor de
 * todo habría dejado la página entera detrás de la sesión.
 */
export function Armazon({ children }: { children: ReactNode }) {
  return (
    <ArmazonCliente
      selectorCentro={
        <Suspense fallback={null}>
          <CentroActivo />
        </Suspense>
      }
      navegacion={
        <Suspense fallback={<Cargando filas={4} />}>
          <NavegacionPorRol />
        </Suspense>
      }
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
