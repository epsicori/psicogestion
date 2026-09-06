// T-005 · Extraído de scripts/test-rls.mjs (T-003), sin cambio de
// comportamiento: localizarContenedor() y ejecutarSql() se necesitaban en un
// segundo sitio (scripts/verificar-huellas.mjs y scripts/test-huellas.mjs) y
// una copia pegada se habría desincronizado el primer día.

import { spawnSync, execFileSync } from "node:child_process";

/**
 * Localiza el contenedor `supabase_db_*` en ejecución con `docker ps`, nunca
 * de memoria: si el proyecto cambia de nombre, un nombre fijo dejaría de
 * encontrarlo sin avisar.
 */
export function localizarContenedor() {
  const salida = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  const candidato = salida
    .split(/\r?\n/)
    .find((nombre) => /^supabase_db_/.test(nombre.trim()));
  if (!candidato) {
    throw new Error(
      "No se encuentra ningún contenedor supabase_db_* en ejecución. " +
        "¿Está la base local levantada (`npx supabase start`)?",
    );
  }
  return candidato.trim();
}

/**
 * Manda `guion` por stdin a `psql -v ON_ERROR_STOP=1` dentro del contenedor
 * de `contenedor`. La salida (stdout/stderr) se hereda tal cual en la
 * consola. Devuelve el código de salida de psql (0 si todo fue bien).
 */
export function ejecutarSql(contenedor, guion, opciones = {}) {
  const argumentosExtra = opciones.argumentosExtra ?? [];
  const resultado = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      contenedor,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      ...argumentosExtra,
      "-f",
      "-",
    ],
    { input: guion, stdio: ["pipe", "inherit", "inherit"], encoding: "utf8" },
  );

  if (resultado.error) {
    throw resultado.error;
  }

  return resultado.status ?? 1;
}
