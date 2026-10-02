import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contenedor de base de datos de ESTE proyecto: `supabase_db_<project_id>`, con el
 * `project_id` de `supabase/config.toml` (solo se lee). `localizarContenedor()` de
 * `scripts/psql.mjs` toma el primer `supabase_db_*` de `docker ps`, y con dos proyectos
 * en marcha puede ser el de otro; aquí se escribe y se confirma, así que no vale (T-037).
 */
export function contenedorDelProyecto(): string {
  const config = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8');
  const proyecto = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!proyecto) {
    throw new Error('No se encuentra `project_id` en supabase/config.toml.');
  }

  const esperado = `supabase_db_${proyecto}`;
  const salida = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  if (!salida.split(/\r?\n/).some((nombre) => nombre.trim() === esperado)) {
    throw new Error(
      `No hay un contenedor "${esperado}" en ejecución (project_id de supabase/config.toml). ` +
        'No se usa ningún otro supabase_db_*. ¿Está la base local levantada (`npx supabase start`)?',
    );
  }
  return esperado;
}
