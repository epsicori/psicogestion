import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserRound } from 'lucide-react';
import { Suspense, cache } from 'react';

import { iniciales } from '@/components/armazon/modulos';
import { Cargando } from '@/components/ui/piezas';
import { t, tCon } from '@/lib/i18n';
import { exigirSesion } from '@/lib/supabase/sesion';

import { FormularioNuevoPaciente } from './formulario-nuevo-paciente';

/**
 * Los pacientes de la sesión, memoizados POR PETICIÓN con `cache()` de React: los
 * dos bloques de abajo —el recuento y la lista— los necesitan y la consulta se
 * hace una sola vez.
 *
 * NUNCA `use cache`: eso guarda el resultado entre peticiones y lo compartiría
 * entre usuarios. Aquí lo que se lee es la lista que RLS acota a quien tiene la
 * sesión abierta; cachearla es servirle los pacientes de otro profesional. Es el
 * error que Cache Components hace fácil de cometer y por eso queda escrito aquí.
 */
const cargarPacientes = cache(async () => {
  const { supabase } = await exigirSesion();

  const { data: pacientes, error } = await supabase
    .from('pacientes')
    .select('id, nombre, apellidos, creado_en')
    .order('creado_en', { ascending: false });

  if (error) {
    throw new Error(t('pacientes.noSePudoCargarLaListaDePacientes'));
  }

  return pacientes;
});

async function RecuentoDePacientes() {
  const pacientes = await cargarPacientes();

  return (
    <p className="text-muted-foreground mt-2 text-sm">
      {pacientes.length === 1
        ? t('pacientes.unoATuCargo')
        : tCon('pacientes.variosATuCargo', { n: pacientes.length })}
    </p>
  );
}

async function ListaDePacientes() {
  const pacientes = await cargarPacientes();

  if (pacientes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
          <UserRound className="size-5" />
        </span>
        <p className="font-serif text-lg font-semibold">{t('pacientes.sinPacientes')}</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          {t('pacientes.sinPacientesExplicacion')}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {pacientes.map((paciente) => {
        const nombreCompleto = `${paciente.nombre} ${paciente.apellidos}`;
        return (
          <li key={paciente.id}>
            <div className="hover:bg-muted flex items-center gap-3 px-4 py-3 transition">
              <span className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-full font-serif text-xs font-semibold">
                {iniciales(nombreCompleto)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{nombreCompleto}</span>
                <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                  {tCon('pacientes.altaEl', {
                    fecha: format(new Date(paciente.creado_en), "d 'de' MMMM 'de' yyyy", {
                      locale: es,
                    }),
                  })}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * **No es `async`**: el encabezado y el formulario de alta no dependen de ningún
 * dato, así que se prerenderizan y llegan instantáneos. Lo que depende de la
 * petición son DOS bloques —el recuento y la lista—, cada uno detrás de su propio
 * `<Suspense>`.
 *
 * Un solo `<Suspense>` envolviendo toda la página habría sido más corto y habría
 * dejado en blanco el formulario de alta mientras se resuelve la consulta, que es
 * justo lo que el prerenderizado parcial existe para evitar.
 */
export default function PaginaPacientes() {
  return (
    <>
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-primary mb-2 text-xs font-semibold tracking-[0.18em] uppercase">
            {t('pacientes.espacioDeTrabajo')}
          </p>
          <h2 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">
            {t('pacientes.titulo')}
          </h2>
          <Suspense fallback={<div className="mt-2"><Cargando filas={1} /></div>}>
            <RecuentoDePacientes />
          </Suspense>
        </div>
      </div>

      <FormularioNuevoPaciente />

      <div className="border-border bg-card mt-6 overflow-hidden rounded-xl border shadow-sm">
        <Suspense fallback={<div className="p-4"><Cargando filas={4} /></div>}>
          <ListaDePacientes />
        </Suspense>
      </div>
    </>
  );
}
